import assert from 'node:assert/strict'
import { layoutDiagramEdges } from '../src/player/diagramEdges.ts'
const nodes=[{id:'controller',label:'컨트롤러'},{id:'view',label:'뷰'},{id:'model',label:'모델'}]
const edges=[{id:'a',from:'view',to:'controller',label:'사용자 이벤트'},{id:'b',from:'controller',to:'model',label:'상태 변경'},{id:'c',from:'model',to:'view',label:'상태 조회'},{id:'d',from:'view',to:'model',label:'변경 알림'}]
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
for(const layout of ['cycle','row','tree','layers']) {
 const links=layout==='tree'||layout==='layers'?edges.slice(0,2):edges
 const g=layoutDiagramEdges(nodes,links,layout)
 for(const route of g.routes.values()) {
  const [a,b]=route.points,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)
  const lx=route.label.x-(a.x+b.x)/2,ly=route.label.y-(a.y+b.y)/2
  near(lx*dx/len+ly*dy/len,0)
  near(Math.hypot(lx,ly),14)
  const w=Math.max(...route.lines.map(l=>Array.from(l).length*11))+8,h=route.lines.length*14+16
  assert.ok(route.label.x-w/2>=-1e-7&&route.label.x+w/2<=g.width+1e-7)
  assert.ok(route.label.y-h/2>=-1e-7&&route.label.y+h/2<=g.height+1e-7)
 }
 assert.deepEqual(layoutDiagramEdges(nodes.map(n=>({...n,hidden:true})),links,layout),g)
}
for(const count of [1,2,3,4,6]) {
 for(const circle of [false,true]) {
 const pair=[{id:'a',label:'뷰',shape:circle?'circle':'box'},{id:'b',label:'모델',shape:circle?'circle':'box'}]
 const links=Array.from({length:count},(_,i)=>({id:`e${i}`,from:i%2?'b':'a',to:i%2?'a':'b',label:`설명${i}`}))
 const g=layoutDiagramEdges(pair,links,'row'),a=g.positions.get('a'),b=g.positions.get('b')
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len
 const offsets=links.map(e=>{
  const r=g.routes.get(e.id),[p,q]=r.points
  near((q.x-p.x)*nx+(q.y-p.y)*ny,0) // line is perpendicular to its normal
  return ((p.x+q.x)/2-a.x)*nx+((p.y+q.y)/2-a.y)*ny
 })
 assert.equal(new Set(offsets.map(x=>x.toFixed(6))).size,count)
 for(let i=0;i<count;i++)near(offsets[i],-offsets[count-1-i])
 if(count%2===0)assert.ok(offsets.every(x=>Math.abs(x)>1e-7))
 }
}
console.log('PASS MVC cycle labels stay 14px perpendicular to own arrow, canvas bounds, 1/2/3/4/6 symmetric parallel lanes and hidden stability')
