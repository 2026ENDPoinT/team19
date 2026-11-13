import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
import { midpoint } from '../src/player/diagramEdges.ts'
const scene = {
  id: 's', clear: true, lines: ['보여 줌', '아니에요', '맞아요', '지움', '숨김'], sourcePages: [],
  texts: [{ id: 't', slot: 'top', style: 'body', content: '항상 보장' }], slides: [], grids: [], codes: [],
  diagrams: [{ id: 'd', slot: 'middle', layout: 'row', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', from: 'a', to: 'b', label: '보장' }] }],
  actions: [
    { line: 1, do: 'stamp', target: 'e', args: ['x'] }, { line: 1, do: 'stamp', target: 't', args: ['x'] },
    { line: 2, do: 'stamp', target: 'b', args: ['o'] }, { line: 2, do: 'stamp', target: 't', args: ['o'] },
    { line: 3, do: 'unstamp', target: 'e', args: [] }, { line: 4, do: 'hide', target: 't', args: [] },
  ],
}
const blueprint = { version: 0, title: 'stamp', theme: 'dark', scenes: [scene] }
const captions = scene.lines.map((text, i) => ({ sceneId: 's', lineIndex: i, text, startSec: i, endSec: i + 1 }))
const at = time => { const s = calculatePlayerState(blueprint, captions, time); const d = s.elements.find(e => e.id === 'd'); return { t: s.elements.find(e => e.id === 't'), e: d.edges[0], b: d.nodes[1] } }
assert.equal(at(.5).e.stamp, undefined)
assert.equal(at(1.5).e.stamp, 'x'); assert.equal(at(1.5).t.stamp, 'x')
assert.equal(at(2.5).t.stamp, 'o'); assert.equal(at(2.5).b.stamp, 'o')
assert.equal(at(3.5).e.stamp, undefined); assert.equal(at(3.5).b.stamp, 'o')
assert.equal(at(4.5).t.stamp, undefined)
assert.equal(at(1.5).e.stamp, 'x') // 되감기도 처음부터 다시 계산
const bad = (action) => calculatePlayerState({ ...blueprint, scenes: [{ ...scene, actions: [action] }] }, captions, .5)
assert.throws(() => bad({ line: 0, do: 'stamp', target: 'e', args: ['v'] }))
assert.throws(() => bad({ line: 0, do: 'stamp', target: 'd', args: ['x'] }))
assert.deepEqual(midpoint([{ x: 0, y: 0 }, { x: 10, y: 0 }]), { x: 5, y: 0 })
assert.deepEqual(midpoint([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 30, y: 10 }]), { x: 10, y: 10 })
console.log('PASS stamp x/o on text, node, edge; replace, unstamp, hide, seek; invalid args/targets; edge midpoint')
