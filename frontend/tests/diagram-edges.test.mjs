import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { layoutDiagramEdges } from '../src/player/diagramEdges.ts'
import { layoutDiagram, layoutNode } from '../src/player/diagramLayout.ts'
const result=JSON.parse(readFileSync(new URL('../../samples/eval/se-arch-review-c2/result-terra.json',import.meta.url),'utf8'))
// 꺾인 선(routes)은 column 배치만 대상이다. 다른 배치는 직선으로 그린다.
for(const scene of result.blueprint.scenes)for(const diagram of scene.diagrams.filter(d=>d.layout==='column')){
 const before=JSON.stringify(diagram),g=layoutDiagramEdges(diagram.nodes,diagram.edges,diagram.layout)
 for(const edge of diagram.edges){
  const route=g.routes.get(edge.id);assert.ok(route)
  for(let i=1;i<route.points.length;i++){
   const a=route.points[i-1],b=route.points[i]
   assert.ok(a.x===b.x||a.y===b.y,'column edges are orthogonal')
   for(const node of diagram.nodes){
    const p=g.positions.get(node.id),size=layoutNode(node,'column')
    const left=p.x-size.width/2,right=p.x+size.width/2,top=p.y-size.height/2,bottom=p.y+size.height/2
    const intersects=a.x===b.x ? a.x>left&&a.x<right&&Math.max(a.y,b.y)>top&&Math.min(a.y,b.y)<bottom : a.y>top&&a.y<bottom&&Math.max(a.x,b.x)>left&&Math.min(a.x,b.x)<right
    assert.ok(!intersects,`${scene.id} ${edge.id} passes through ${node.id}`)
   }
  }
  for(const point of route.points)assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.x<=g.width&&point.y>=0&&point.y<=g.height)
  for(const other of diagram.edges)if(edge.from===other.to&&edge.to===other.from)assert.notDeepEqual(route.points,[...g.routes.get(other.id).points].reverse(),'reciprocal edges must not share a path')
  for(const line of route.lines)assert.ok(Array.from(line).length<=8)
 }
 assert.deepEqual(layoutDiagramEdges(diagram.nodes.map(n=>({...n,hidden:true})),diagram.edges.map(e=>({...e,hidden:true})),diagram.layout),g,'hiding preserves lanes and node positions')
 assert.equal(JSON.stringify(diagram),before)
 console.log(`PASS MVC ${scene.id}: ${diagram.edges.length} routes without node crossings`)
}
for(const layout of ['row','tree']){
 const nodes=[{id:'a'},{id:'b'}],edges=[{id:'e',from:'a',to:'b'}]
 const actual=layoutDiagramEdges(nodes,edges,layout),expected=layoutDiagram(nodes,edges,layout)
 assert.deepEqual(actual.positions,expected.positions);assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);assert.equal(actual.routes.size,0)
}
const nodes=[{id:'a',label:'원',shape:'circle'},{id:'b',label:'둘',shape:'circle'}]
const edges=[{id:'ab',from:'a',to:'b',label:'긴 연결선 이름도 여러 줄로 보여요'},{id:'ba',from:'b',to:'a',label:'되돌아감'}]
const circle=layoutDiagramEdges(nodes,edges,'column')
assert.equal(circle.routes.size,2)
assert.notEqual(circle.routes.get('ab').points[0].x,circle.routes.get('ba').points[0].x)
assert.throws(()=>layoutDiagramEdges(nodes,[{id:'bad',from:'a',to:'missing'}],'column'))
assert.equal(layoutDiagramEdges([],[],'column').routes.size,0)
console.log('PASS circular ports, long labels, bounds, invalid references, empty diagrams and unchanged row/tree geometry')
