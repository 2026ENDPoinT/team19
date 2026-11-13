import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { layoutDiagram, layoutNode } from '../src/player/diagramLayout.ts'
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

for (const count of [1, 3, 6]) {
  const nodes = Array.from({length: count}, (_, index) => ({id: `step-${index}`}))
  const edges = nodes.slice(1).map((node, index) => ({from: nodes[index].id, to: node.id}))
  const before = JSON.stringify({nodes, edges})
  const column = layoutDiagram(nodes, edges, 'column')
  assert.ok(column.width <= 360)
  const positions = [...column.positions.values()]
  assert.equal(new Set(positions.map((point) => point.x)).size, 1)
  for (let index = 0; index < positions.length; index++) {
    assert.ok(positions[index].x - 95 >= 0)
    assert.ok(positions[index].x + 95 <= column.width)
    assert.ok(positions[index].y - 22 >= 0)
    assert.ok(positions[index].y + 22 <= column.height)
    if (index) assert.ok(positions[index].y - positions[index - 1].y >= 80)
  }
  assert.deepEqual(layoutDiagram(nodes.map((node) => ({...node, hidden: true})), edges, 'column'), column)
  const row = layoutDiagram(nodes, edges, 'row')
  assert.equal(new Set([...row.positions.values()].map((point) => point.y)).size, 1)
  assert.equal(JSON.stringify({nodes, edges}), before)
}
console.log('PASS column order, 1/3/6 node bounds, readable box width, stable hidden positions and unchanged row meaning')

const rl = JSON.parse(readFileSync(new URL('../../samples/eval/rl-mdp-review-c4/result-terra.json', import.meta.url), 'utf8'))
const tree = rl.blueprint.scenes.find(scene => scene.id === 's3').diagrams[0]
const geometry = layoutDiagram(tree.nodes, tree.edges, 'tree')
for (const node of tree.nodes) {
  const size = layoutNode(node, 'tree'), point = geometry.positions.get(node.id)
  assert.equal(size.lines.join(''), node.label)
  assert.ok(point.x - size.width / 2 >= 0 && point.x + size.width / 2 <= geometry.width)
  assert.ok(point.y - size.height / 2 >= 0 && point.y + size.height / 2 <= geometry.height)
  for (const line of size.lines) assert.ok(Math.hypot(Array.from(line).length * size.fontSize / 2, size.lines.length * size.lineHeight / 2) <= size.radius, node.label)
}
for (let i=0;i<tree.nodes.length;i++) for (let j=i+1;j<tree.nodes.length;j++) {
  const a=tree.nodes[i],b=tree.nodes[j],p=geometry.positions.get(a.id),q=geometry.positions.get(b.id)
  assert.ok(Math.hypot(p.x-q.x,p.y-q.y) > layoutNode(a,'tree').radius + layoutNode(b,'tree').radius)
}
assert.deepEqual(layoutDiagram(tree.nodes.map(node=>({...node,hidden:true})),tree.edges,'tree'),geometry)
for (const layout of ['row','column','tree']) {
  const size=layoutNode({id:'long',shape:'circle',label:'아주 긴 상태와 행동의 라벨입니다'},layout)
  assert.ok(size.lines.length > 1)
  assert.equal(size.lines.join(''),'아주 긴 상태와 행동의 라벨입니다')
}
console.log('PASS RL labels wrap inside circles, nodes do not overlap or clip, hidden positions stay stable')
