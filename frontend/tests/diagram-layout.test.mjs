import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { layoutDiagram } from '../src/player/diagramLayout.ts'
const result = JSON.parse(readFileSync(new URL('../../samples/parts-test/result.json', import.meta.url), 'utf8'))
for (const scene of result.blueprint.scenes) for (const diagram of scene.diagrams) {
  const before = JSON.stringify(diagram)
  const layout = layoutDiagram(diagram.nodes, diagram.edges, diagram.layout)
  assert.equal(layout.positions.size, diagram.nodes.length)
  assert.equal(new Set([...layout.positions.values()].map(p => `${p.x},${p.y}`)).size, diagram.nodes.length)
  if (diagram.layout === 'tree') for (const edge of diagram.edges) assert.ok(layout.positions.get(edge.from).y < layout.positions.get(edge.to).y)
  const changed = structuredClone(diagram.nodes).map(node => ({...node, hidden: !node.hidden}))
  assert.deepEqual(layoutDiagram(changed, diagram.edges, diagram.layout), layout)
  assert.equal(JSON.stringify(diagram), before)
}
assert.throws(() => layoutDiagram([{id:'a'},{id:'b'}],[{from:'a',to:'b'},{from:'b',to:'a'}],'tree'))
assert.throws(() => layoutDiagram([{id:'a'}],[{from:'a',to:'missing'}],'tree'))
assert.throws(() => layoutDiagram([{id:'a'}],[],'cycle'))
console.log('PASS diagram positions, tree depth, hidden stability, source immutability, invalid references/cycles/layouts')
