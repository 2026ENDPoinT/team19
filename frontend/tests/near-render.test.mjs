import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'})
try {
 const {default:PlayerStage}=await server.ssrLoadModule('/src/player/PlayerStage.tsx')
 const state={sceneId:'s',sourcePages:[],caption:'성공',elements:[{id:'g',slot:'middle',cells:[['0','1']],pointers:[]},{id:'label',style:'formula',content:'P(X=1)=p',near:{target:'g',side:'below',cell:'1'}}]}
 const html=renderToStaticMarkup(createElement(PlayerStage,{state,pageUrl:()=>undefined,isPlaying:false,onTogglePlayback(){},controls:null}))
 assert.ok(!html.includes('role="alert"'));assert.ok(html.includes('player-near-label'))
 assert.ok(html.includes('data-near-cell="g:cell:0,1"'));assert.ok(html.includes('data-near-anchor="g"'))
 assert.equal((html.match(/data-near-anchor="label"/g)||[]).length,1)
 console.log('PASS attached formula renders without slot error and fixed-cell/component anchors are emitted')
}finally{await server.close()}
