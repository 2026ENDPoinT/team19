import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { layoutNode } from '../src/player/diagramLayout.ts'
import { layoutDiagramEdges } from '../src/player/diagramEdges.ts'
import { calculatePlayerState } from '../src/player/state.ts'
const root=fileURLToPath(new URL('..',import.meta.url))
const server=await createServer({root,server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'})
try {
 const {default:Diagram}=await server.ssrLoadModule('/src/player/Diagram.tsx')
 const node={id:'plain',label:'최대화',shape:'text'}
 const draw=nodes=>renderToStaticMarkup(createElement(Diagram,{element:{id:'d',layout:'row',nodes,edges:[]}}))
 const plain=draw([node])
 assert.ok(plain.includes('최대화'));assert.equal((plain.match(/<rect/g)||[]).length,0);assert.equal((plain.match(/<circle/g)||[]).length,0)
 assert.ok(plain.includes('fill="#ffffff"'))
 const active=draw([{...node,explaining:true}]);assert.ok(active.includes('fill="#ace6f3"'));assert.ok(!active.includes('<rect'))
 const mixed=draw([node,{id:'box',label:'구성 요소',shape:'box'},{id:'circle',label:'상태',shape:'circle'}])
 assert.equal((mixed.match(/<rect/g)||[]).length,1);assert.equal((mixed.match(/<circle/g)||[]).length,1)
 assert.ok(draw([{...node,stamp:'x'}]).includes('아님 표시'))
 assert.ok(!draw([{...node,hidden:true}]).includes('최대화'))
 for(const layout of ['row','column','cycle','tree','layers']) {
  assert.deepEqual(layoutNode(node,layout),layoutNode({...node,shape:'box'},layout))
  const nodes=[node,{id:'b',label:'최소화',shape:'box'}],edges=[{id:'e',from:'plain',to:'b'}]
  assert.deepEqual(layoutDiagramEdges(nodes,edges,layout),layoutDiagramEdges(nodes.map(n=>({...n,shape:'box'})),edges,layout))
 }
 const scene={id:'s',clear:true,lines:['강조','해제'],sourcePages:[],texts:[],slides:[],grids:[],codes:[],diagrams:[{id:'d',slot:'middle',layout:'row',nodes:[node],edges:[]}],actions:[{line:0,do:'highlight',target:'plain',args:[]},{line:1,do:'unhighlight',target:'plain',args:[]}]}
 const blueprint={version:0,title:'plain',theme:'dark',scenes:[scene]},captions=scene.lines.map((text,i)=>({sceneId:'s',lineIndex:i,text,startSec:i,endSec:i+1}))
 const at=t=>calculatePlayerState(blueprint,captions,t).elements[0].nodes[0]
 assert.equal(at(.5).explaining,true);assert.ok(!at(1.5).explaining);assert.equal(at(.5).explaining,true)
 console.log('PASS text-only SVG, white/mint emphasis, mixed shapes, stamp, hidden, box-equivalent ports and seek/unhighlight')
} finally {await server.close()}
