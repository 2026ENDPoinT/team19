import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'})
try{
 const {default:Grid}=await server.ssrLoadModule('/src/player/Grid.tsx')
 const base={id:'g',cells:[['3','1','2']],pointers:[]}
 for(const progress of [0,.5,1]){
  const html=renderToStaticMarkup(createElement(Grid,{element:{...base,cellOrigins:progress<1?{'0,0':{row:0,col:1,progress},'0,1':{row:0,col:0,progress}}:{}}}))
  assert.equal((html.match(/player-shape-enter/g)||[]).length,1,'only the array container has an entrance animation')
  assert.ok(html.includes('player-grid-graphic player-shape-enter'))
  assert.equal((html.match(/<rect/g)||[]).length,6,'moving and stationary cells are not duplicated')
 }
 console.log('PASS array entrance only, no per-cell replay or duplicated cells across swap frames')
}finally{await server.close()}
