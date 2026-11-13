import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
const scene = {
  id: 's', clear: true, lines: ['처음', '올림', '내림'], sourcePages: [],
  texts: [{ id: 't', slot: 'top', style: 'title', content: '제목' }, { id: 'b', slot: 'bottom', style: 'body', content: '다음 설명', hidden: true }],
  slides: [], codes: [], diagrams: [],
  grids: [{ id: 'g', slot: 'middle', cells: [['1', '2']], pointers: [] }],
  actions: [
    { line: 0, do: 'highlight', target: 'g', args: ['0'] },
    { line: 1, do: 'place', target: 'g', args: ['top'] }, { line: 1, do: 'show', target: 'b', args: [] },
    { line: 2, do: 'place', target: 'g', args: ['middle'] },
  ],
}
const blueprint = { version: 0, title: 'place', theme: 'dark', scenes: [scene] }
const captions = scene.lines.map((text, i) => ({ sceneId: 's', lineIndex: i, text, startSec: i, endSec: i + 1 }))
const grid = time => calculatePlayerState(blueprint, captions, time).elements.find(e => e.id === 'g')
assert.equal(grid(.5).slot, 'middle')
assert.equal(grid(1.5).slot, 'top'); assert.deepEqual(grid(1.5).highlightedCells, ['0,0'])
assert.equal(grid(2.5).slot, 'middle')
assert.equal(grid(1.5).slot, 'top') // 되감기
const bad = action => calculatePlayerState({ ...blueprint, scenes: [{ ...scene, actions: [action] }] }, captions, .5)
assert.throws(() => bad({ line: 0, do: 'place', target: 'g', args: ['full'] }))
assert.equal(scene.grids[0].slot, 'middle')
console.log('PASS place: move to top and back, state follows, seek, invalid slot, source unchanged')
