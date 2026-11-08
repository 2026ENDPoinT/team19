// 영상 설계도 v0 형식 검사기 (초안)
// 사용법: node validate.js 파일1.json [파일2.json ...]
// 형식이 틀리면 이유를 출력한다. 맞으면 배열(격자)의 마지막 상태를 출력해 내용을 눈으로 확인할 수 있게 한다.
const fs = require('fs');

const SLOTS = ['top', 'middle', 'bottom'];
const TEXT_STYLES = ['title', 'body', 'keyword', 'formula'];
const LAYOUTS = ['row', 'column', 'tree', 'layers', 'cycle'];
const SHAPES = ['box', 'circle'];
const ACTIONS = {
  // 동작 이름: 대상이 될 수 있는 종류
  show: ['text', 'slide', 'diagram', 'node', 'edge', 'grid', 'pointer', 'code'],
  hide: ['text', 'slide', 'diagram', 'node', 'edge', 'grid', 'pointer', 'code'],
  highlight: ['text', 'node', 'edge', 'grid', 'pointer', 'code'],
  unhighlight: ['text', 'node', 'edge', 'grid', 'pointer', 'code'],
  move: ['pointer'],
  swap: ['grid'],
  setValue: ['grid'],
  setText: ['text'],
  focus: ['slide'],
  markLine: ['code'],
};

function check(file) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  let clip;
  try { clip = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return [`JSON을 읽을 수 없음: ${e.message}`]; }

  if (clip.version !== 0) err('clip', 'version은 0이어야 함');
  if (typeof clip.title !== 'string' || !clip.title) err('clip', 'title 없음');
  if (!['dark', 'light'].includes(clip.theme)) err('clip', 'theme은 dark 또는 light');
  if (!Array.isArray(clip.scenes) || clip.scenes.length === 0) return [...errors, 'scenes가 비어 있음'];

  let known = new Map();      // id -> { kind, ref }
  const allIds = new Set();   // 클립 전체에서 id 중복 금지
  const grids = new Map();    // grid id -> 현재 칸 값 (시뮬레이션)

  const addId = (where, id, kind, ref) => {
    if (typeof id !== 'string' || !id) return err(where, 'id 없음');
    if (allIds.has(id)) err(where, `id 중복: ${id}`);
    allIds.add(id); known.set(id, { kind, ref });
  };
  const cellOf = (grid, s, where) => {
    // "4" -> [0,4], "1,3" -> [1,3]
    const parts = String(s).split(',').map(Number);
    const [r, c] = parts.length === 1 ? [0, parts[0]] : parts;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= grid.length || c >= grid[r].length) {
      err(where, `칸 위치가 범위 밖: ${s}`); return null;
    }
    return [r, c];
  };

  clip.scenes.forEach((sc, si) => {
    const W = `scene ${sc.id || si}`;
    if (sc.clear) { known = new Map(); }
    if (!Array.isArray(sc.lines) || sc.lines.length === 0) err(W, 'lines가 비어 있음');
    for (const key of ['texts', 'slides', 'diagrams', 'grids', 'codes', 'actions', 'sourcePages']) {
      if (!Array.isArray(sc[key])) err(W, `${key} 배열이 없음 (없으면 []로)`);
    }
    for (const t of sc.texts || []) {
      addId(W, t.id, 'text', t);
      if (!SLOTS.includes(t.slot)) err(W, `${t.id} slot 오류`);
      if (!TEXT_STYLES.includes(t.style)) err(W, `${t.id} style 오류`);
    }
    for (const s of sc.slides || []) {
      addId(W, s.id, 'slide', s);
      if (!SLOTS.includes(s.slot)) err(W, `${s.id} slot 오류`);
      if (!Number.isInteger(s.page) || s.page < 1) err(W, `${s.id} page 오류`);
      if (!(sc.sourcePages || []).includes(s.page)) err(W, `${s.id} page ${s.page}가 sourcePages에 없음`);
      if (!Array.isArray(s.box) || s.box.length !== 4 || s.box.some(v => v < 0 || v > 1)) err(W, `${s.id} box는 0~1 사이 숫자 4개`);
    }
    for (const d of sc.diagrams || []) {
      addId(W, d.id, 'diagram', d);
      if (!SLOTS.includes(d.slot)) err(W, `${d.id} slot 오류`);
      if (!LAYOUTS.includes(d.layout)) err(W, `${d.id} layout 오류`);
      const nodeIds = new Set();
      for (const n of d.nodes || []) {
        addId(W, n.id, 'node', n); nodeIds.add(n.id);
        if (!SHAPES.includes(n.shape)) err(W, `${n.id} shape 오류`);
      }
      for (const e of d.edges || []) {
        addId(W, e.id, 'edge', e);
        if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) err(W, `${e.id} 연결 대상 노드가 이 다이어그램에 없음`);
      }
    }
    for (const g of sc.grids || []) {
      addId(W, g.id, 'grid', g);
      if (!SLOTS.includes(g.slot)) err(W, `${g.id} slot 오류`);
      if (!Array.isArray(g.cells) || g.cells.length === 0) { err(W, `${g.id} cells 없음`); continue; }
      grids.set(g.id, g.cells.map(row => [...row]));
      for (const p of g.pointers || []) {
        addId(W, p.id, 'pointer', { ...p, grid: g.id });
        cellOf(g.cells, `${p.row},${p.col}`, `${W} ${p.id}`);
      }
    }
    for (const c of sc.codes || []) {
      addId(W, c.id, 'code', c);
      if (!SLOTS.includes(c.slot)) err(W, `${c.id} slot 오류`);
      if (!Array.isArray(c.lines) || c.lines.length === 0) err(W, `${c.id} lines 없음`);
    }

    let lastLine = 0;
    (sc.actions || []).forEach((a, ai) => {
      const A = `${W} action ${ai}`;
      if (!Number.isInteger(a.line) || a.line < 0 || a.line >= (sc.lines || []).length) return err(A, `line ${a.line}이 문장 범위 밖`);
      if (a.line < lastLine) err(A, 'line 순서가 뒤로 감 (문장 순서대로 적어야 함)');
      lastLine = a.line;
      if (!ACTIONS[a.do]) return err(A, `모르는 동작: ${a.do}`);
      const t = known.get(a.target);
      if (!t) return err(A, `대상 없음: ${a.target} (이 장면이나 이어지는 앞 장면에 있어야 함)`);
      if (!ACTIONS[a.do].includes(t.kind)) return err(A, `${a.do}는 ${t.kind}에 쓸 수 없음`);
      if (!Array.isArray(a.args)) return err(A, 'args 배열이 없음');
      const g = t.kind === 'grid' ? grids.get(a.target) : null;
      if (a.do === 'swap') {
        const p = cellOf(g, a.args[0], A), q = cellOf(g, a.args[1], A);
        if (p && q) [g[p[0]][p[1]], g[q[0]][q[1]]] = [g[q[0]][q[1]], g[p[0]][p[1]]];
      } else if (a.do === 'setValue') {
        const p = cellOf(g, a.args[0], A);
        if (p) g[p[0]][p[1]] = String(a.args[1]);
      } else if (a.do === 'move') {
        const grid = grids.get(t.ref.grid);
        if (grid) cellOf(grid, a.args[0], A);
      } else if ((a.do === 'highlight' || a.do === 'unhighlight') && g) {
        for (const s of a.args) {
          const m = /^(\d+)-(\d+)$/.exec(s);
          if (m) { cellOf(g, m[1], A); cellOf(g, m[2], A); } else cellOf(g, s, A);
        }
      } else if (a.do === 'markLine') {
        const n = Number(a.args[0]);
        if (!Number.isInteger(n) || n < 1 || n > t.ref.lines.length) err(A, `코드 줄 번호 범위 밖: ${a.args[0]}`);
      } else if (a.do === 'focus') {
        const b = String(a.args[0]).split(',').map(Number);
        if (b.length !== 4 || b.some(v => !(v >= 0 && v <= 1))) err(A, 'focus는 "x,y,w,h" (0~1)');
      } else if (a.do === 'setText') {
        if (typeof a.args[0] !== 'string') err(A, 'setText는 새 내용 1개');
      }
    });
  });

  if (!errors.length) {
    for (const [id, g] of grids) console.log(`  [${id}] 마지막 상태: ${g.map(r => r.join(' ')).join(' / ')}`);
  }
  return errors;
}

let failed = 0;
for (const f of process.argv.slice(2)) {
  console.log(f);
  const errors = check(f);
  if (errors.length) { failed++; errors.forEach(e => console.log('  ✗ ' + e)); }
  else console.log('  ✓ 형식 통과');
}
process.exit(failed ? 1 : 0);
