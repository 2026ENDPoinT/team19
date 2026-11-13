import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
const scene = {
  id: 's', clear: true, lines: ['바꿔요', '다음'], sourcePages: [],
  texts: [], slides: [], diagrams: [],
  codes: [{ id: 'c', slot: 'bottom', lines: ['a', 'b'] }],
  grids: [{ id: 'g', slot: 'middle', cells: [['1', '2', '3']], pointers: [] }],
  actions: [{ line: 0, do: 'highlight', target: 'g', args: ['0'] }, { line: 0, do: 'markLine', target: 'c', args: ['1'] }, { line: 1, do: 'unhighlight', target: 'g', args: ['0'] }],
}
const blueprint = { version: 0, title: 'gap', theme: 'dark', scenes: [scene] }
// 0~1초 문장, 1~1.3초 쉼(자막 없음), 1.3초부터 다음 문장
const captions = [{ sceneId: 's', lineIndex: 0, text: '바꿔요', startSec: 0, endSec: 1 }, { sceneId: 's', lineIndex: 1, text: '다음', startSec: 1.3, endSec: 2 }]
const at = time => { const s = calculatePlayerState(blueprint, captions, time); return { g: s.elements.find(e => e.id === 'g'), c: s.elements.find(e => e.id === 'c'), caption: s.caption } }
assert.deepEqual(at(0.5).g.explainedCells, ['0,0']); assert.equal(at(0.5).c.explainedLine, 1)
// 쉼 동안에도 직전 문장의 강조·코드 줄이 그대로(자막 글자만 비어 있음)
assert.deepEqual(at(1.15).g.explainedCells, ['0,0']); assert.equal(at(1.15).c.explainedLine, 1); assert.equal(at(1.15).caption, '')
// 다음 문장이 시작되면 바뀐다
assert.equal(at(1.5).c.explainedLine, undefined)
console.log('PASS sentence gap keeps previous sentence emphasis until next sentence starts')
