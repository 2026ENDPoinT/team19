import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
const scene = {
  id: 's', clear: true, lines: ['zoom', 'continue'], sourcePages: [1],
  texts: [], grids: [], codes: [], diagrams: [],
  slides: [{ id: 'slide', slot: 'middle', page: 1, box: [0, 0, 1, 1] }],
  actions: [{ line: 0, do: 'focus', target: 'slide', args: ['0.2,0.2,0.4,0.4'] }],
}
const blueprint = { version: 0, title: 'focus', theme: 'dark', scenes: [scene] }
const captions = [
  { sceneId: 's', lineIndex: 0, text: 'zoom', startSec: 1, endSec: 2 },
  { sceneId: 's', lineIndex: 1, text: 'continue', startSec: 2.3, endSec: 3 },
]
const original = JSON.stringify(blueprint)
const boxAt = (time, timings = captions) => calculatePlayerState(blueprint, timings, time).elements[0].focusBox
function near(actual, expected) {
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-9, `${actual} != ${expected}`))
}
assert.equal(boxAt(0), undefined)
near(boxAt(1), [0, 0, 1, 1])
near(boxAt(1.2), [.1, .1, .7, .7])
near(boxAt(1.4), [.2, .2, .4, .4])
near(boxAt(2.3), [.2, .2, .4, .4])
assert.deepEqual(boxAt(1.2), boxAt(1.2))
boxAt(3)
near(boxAt(1.2), [.1, .1, .7, .7])
near(boxAt(1), [0, 0, 1, 1])
const short = [{ ...captions[0], endSec: 1.1 }, { ...captions[1], startSec: 1.1 }]
near(boxAt(1.05, short), [.1, .1, .7, .7])
near(boxAt(1.1, short), [.2, .2, .4, .4])
scene.actions.push({ line: 1, do: 'focus', target: 'slide', args: ['0.3,0.3,0.2,0.2'] })
near(boxAt(2.3), [.2, .2, .4, .4])
near(boxAt(2.5), [.25, .25, .3, .3])
near(boxAt(2.7), [.3, .3, .2, .2])
scene.actions.pop()
assert.equal(JSON.stringify(blueprint), original)
console.log('PASS focus interpolation, pause, reverse seek, repeat, short captions, consecutive focus and source immutability')
