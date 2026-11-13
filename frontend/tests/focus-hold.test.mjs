import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
import { isLit } from '../src/player/focusDim.ts'
const scene = {
  id: 's', clear: true, lines: ['a 강조', 'a 끔', 'b 강조', '끔', '조용 1', '조용 2', '조용 3'], sourcePages: [],
  texts: [{ id: 'a', slot: 'top', style: 'body', content: 'A' }, { id: 'b', slot: 'bottom', style: 'body', content: 'B' }],
  slides: [], codes: [], diagrams: [], grids: [{ id: 'g', slot: 'middle', cells: [['1', '2', '3']], pointers: [] }],
  actions: [
    { line: 0, do: 'highlight', target: 'a', args: [] }, { line: 1, do: 'unhighlight', target: 'a', args: [] },
    { line: 2, do: 'highlight', target: 'g', args: ['1'] }, { line: 3, do: 'unhighlight', target: 'g', args: ['1'] },
  ],
}
const blueprint = { version: 0, title: 'hold', theme: 'dark', scenes: [scene] }
const captions = scene.lines.map((text, i) => ({ sceneId: 's', lineIndex: i, text, startSec: i, endSec: i + 1 }))
const at = time => Object.fromEntries(calculatePlayerState(blueprint, captions, time).elements.map(e => [e.id, e]))
// 강조가 꺼진 문장(1)에서도 직전에 강조된 a는 또렷하게(유지) → 나머지만 흐림
assert.equal(isLit(at(1.5).a), true); assert.equal(isLit(at(1.5).b), false)
// 칸 강조가 꺼진 문장(3)에서도 그 칸만 유지
assert.deepEqual(at(3.5).g.heldCells, ['0,1'])
// 강조 없는 문장 2개(3,4)까지는 유지, 3개째(5)부터는 원래 밝기
assert.deepEqual(at(4.5).g.heldCells, ['0,1'])
assert.equal(Object.values(at(5.5)).some(isLit), false)
// 되감기·탐색에도 같은 결과
assert.equal(isLit(at(1.5).a), true)
// 강조가 실제로 켜진 문장에서는 유지 표시가 없다
assert.equal(at(2.5).a.heldLit, undefined)
assert.equal(JSON.stringify(blueprint.scenes[0].texts[0]).includes('held'), false)
console.log('PASS focus hold: keep last highlight through 2 quiet sentences, reset on 3rd, cells, seek-safe, source unchanged')
