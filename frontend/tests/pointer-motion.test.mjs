import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
const scene = {
  id: 's', clear: true, lines: ['move', 'move again'], sourcePages: [1],
  texts: [], slides: [], diagrams: [], codes: [],
  grids: [{ id: 'g', slot: 'middle', cells: [['1','2'],['3','4']], pointers: [
    { id: 'p', label: 'i', row: 0, col: 0 }, { id: 'q', label: 'j', row: 1, col: 0, hidden: true },
  ] }],
  actions: [{ line: 0, do: 'move', target: 'p', args: ['1,1'] }, { line: 1, do: 'move', target: 'p', args: ['0,1'] }],
}
const blueprint = { version: 0, title: 'pointer', theme: 'dark', scenes: [scene] }
const captions = [
  { sceneId: 's', lineIndex: 0, text: 'move', startSec: 1, endSec: 2 },
  { sceneId: 's', lineIndex: 1, text: 'move again', startSec: 2.3, endSec: 3 },
]
const at = (time, timings = captions) => calculatePlayerState(blueprint, timings, time).elements[0].pointers
const original = JSON.stringify(blueprint)
assert.equal(at(0)[0].moveOrigin, undefined)
assert.deepEqual(at(1)[0].moveOrigin, { row: 0, col: 0, progress: 0 })
assert.equal(at(1)[0].row, 1)
assert.equal(at(1)[0].col, 1)
assert.ok(Math.abs(at(1.35)[0].moveOrigin.progress - .5) < 1e-9)
assert.equal(at(2)[0].moveOrigin, undefined)
assert.deepEqual(at(2.3)[0].moveOrigin, { row: 1, col: 1, progress: 0 })
const paused = at(1.2)
at(3)
assert.deepEqual(at(1.2), paused)
assert.deepEqual(at(0)[0], scene.grids[0].pointers[0])
assert.deepEqual(at(1.2)[1], scene.grids[0].pointers[1])
// Repeated moves in one sentence keep the original source; same-cell move is a no-op.
scene.actions.splice(1, 0, { line: 0, do: 'move', target: 'p', args: ['0,1'] }, { line: 0, do: 'move', target: 'p', args: ['0,1'] })
assert.deepEqual(at(1)[0].moveOrigin, { row: 0, col: 0, progress: 0 })
assert.equal(at(1)[0].row, 0)
scene.actions.splice(1, 2)
const short = [{ ...captions[0], endSec: 1.1 }, { ...captions[1], startSec: 1.1 }]
assert.deepEqual(at(1.1, short)[0].moveOrigin, { row: 1, col: 1, progress: 0 })
assert.equal(JSON.stringify(blueprint), original)
console.log('PASS pointer motion, two-dimensional move, consecutive moves, same-cell move, hidden pointer, seek/pause/repeat and source immutability')
