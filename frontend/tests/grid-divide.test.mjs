import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
const scene = {
  id: 's', clear: true, lines: ['나누기', '더 나누기', '합치기', '숨김'], sourcePages: [],
  texts: [], slides: [], codes: [], diagrams: [],
  grids: [{ id: 'g', slot: 'middle', cells: [['1', '3', '5', '7'], ['2', '4', '6', '8'], ['', '', '', '']], pointers: [] }],
  actions: [
    { line: 0, do: 'divide', target: 'g', args: ['row:1'] },
    { line: 1, do: 'divide', target: 'g', args: ['col:1', 'row:0'] },
    { line: 2, do: 'undivide', target: 'g', args: ['col:1'] },
    { line: 3, do: 'hide', target: 'g', args: [] },
  ],
}
const blueprint = { version: 0, title: 'divide', theme: 'dark', scenes: [scene] }
const captions = scene.lines.map((text, i) => ({ sceneId: 's', lineIndex: i, text, startSec: i, endSec: i + 1 }))
const grid = time => calculatePlayerState(blueprint, captions, time).elements.find(e => e.id === 'g')
// 첫 문장 전(시간 0)에는 구분선이 없다: 첫 문장이 0초에 시작하므로 이 확인은 생략
assert.deepEqual(grid(0.5).dividers, ['row:1'])
assert.deepEqual(grid(1.5).dividers, ['row:1', 'col:1', 'row:0'])
assert.deepEqual(grid(2.5).dividers, ['row:1', 'row:0'])
assert.equal(grid(3.5).dividers, undefined)
assert.deepEqual(grid(0.5).dividers, ['row:1']) // 되감기
const bad = args => () => calculatePlayerState({ ...blueprint, scenes: [{ ...scene, actions: [{ line: 0, do: 'divide', target: 'g', args }] }] }, captions, 0.5)
assert.throws(bad(['row:2'])) // 마지막 줄 아래는 안 됨
assert.throws(bad(['col:3'])) // 마지막 칸 오른쪽은 안 됨
assert.throws(bad(['middle']))
assert.throws(bad([]))
console.log('PASS grid divide: row/col lines, add/remove, hide clears, seek, invalid positions')
