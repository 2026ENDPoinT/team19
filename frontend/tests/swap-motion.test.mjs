import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
const scene = {
  id: 's', clear: true, lines: ['swap', 'done'], sourcePages: [1],
  texts: [], slides: [], codes: [], diagrams: [],
  grids: [{ id: 'g', slot: 'middle', cells: [['5', '3', '5']], pointers: [] }],
  actions: [
    { line: 0, do: 'highlight', target: 'g', args: ['0'] },
    { line: 0, do: 'swap', target: 'g', args: ['0', '1'] },
  ],
}
const blueprint = { version: 0, title: 'swap', theme: 'dark', scenes: [scene] }
const captions = [
  { sceneId: 's', lineIndex: 0, text: 'swap', startSec: 1, endSec: 2 },
  { sceneId: 's', lineIndex: 1, text: 'done', startSec: 2.3, endSec: 3 },
]
const at = (time, timings = captions) => calculatePlayerState(blueprint, timings, time).elements[0]
const original = JSON.stringify(blueprint)
assert.deepEqual(at(0).cells, [['5', '3', '5']])
assert.deepEqual(at(1).cells, [['3', '5', '5']])
assert.deepEqual(at(1).cellOrigins, {
  '0,0': { row: 0, col: 1, progress: 0 },
  '0,1': { row: 0, col: 0, progress: 0 },
})
assert.ok(Math.abs(at(1.2).cellOrigins['0,0'].progress - .5) < 1e-9)
assert.deepEqual(at(1.2).highlightedCells, ['0,0'])
assert.deepEqual(at(2).cellOrigins, {})
assert.deepEqual(at(2.3).cellOrigins, {})
const paused = at(1.2)
at(3)
assert.deepEqual(at(1.2), paused)
assert.deepEqual(at(0).cells, [['5', '3', '5']])
// Composing swaps tracks origins by cell position, including duplicate values.
scene.actions.push({ line: 0, do: 'swap', target: 'g', args: ['1', '2'] })
assert.deepEqual(at(1).cells, [['3', '5', '5']])
assert.equal(at(1).cellOrigins['0,2'].col, 0)
assert.equal(at(1).cellOrigins['0,1'].col, 2)
scene.actions.push({ line: 0, do: 'swap', target: 'g', args: ['1', '1'] })
assert.equal(at(1).cellOrigins['0,1'].col, 2)
scene.actions.pop()
scene.actions.push({ line: 0, do: 'setValue', target: 'g', args: ['2', '9'] })
assert.equal(at(1).cellOrigins['0,2'], undefined)
assert.equal(at(1).cells[0][2], '9')
scene.actions.pop()
scene.actions.pop()
const short = [{ ...captions[0], endSec: 1.1 }, { ...captions[1], startSec: 1.1 }]
assert.deepEqual(at(1.1, short).cellOrigins, {})
assert.equal(JSON.stringify(blueprint), original)
console.log('PASS swap origins, duplicate values, composed swaps, same-cell swap, overwrite, seek/pause/repeat and short-caption finalization')
