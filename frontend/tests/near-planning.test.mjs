import assert from 'node:assert/strict'
import {calculatePlayerState} from '../src/player/state.ts'
import {nearSpace} from '../src/player/nearLayout.ts'
const owner={id:'g',slot:'middle',cells:[['1','2']]}
const texts=[{id:'a',hidden:true,style:'body',content:'위 설명',near:{target:'g',side:'above'}},{id:'b',slot:'bottom',hidden:true,style:'body',content:'밑 설명'}]
const scene={id:'s',clear:true,sourcePages:[],texts,grids:[owner],diagrams:[],slides:[],codes:[],lines:['준비','표시','붙이기','긴 설명','숨기기'],actions:[{line:1,do:'show',target:'a',args:[]},{line:2,do:'attach',target:'b',args:['g','below','0']},{line:2,do:'show',target:'b',args:[]},{line:3,do:'setText',target:'b',args:['나중에 더 길어진 설명도 처음부터 측정해요']},{line:4,do:'hide',target:'a',args:[]},{line:4,do:'hide',target:'b',args:[]}]}
const blueprint={version:0,title:'near',theme:'dark',scenes:[scene]}
const captions=scene.lines.map((text,i)=>({sceneId:'s',lineIndex:i,text,startSec:i*2,endSec:i*2+2}))
const original=structuredClone(blueprint)
const at=t=>calculatePlayerState(blueprint,captions,t)
const first=at(0).nearPlan
assert.ok(first.some(e=>e.near?.side==='above'&&!e.reservationOwner))
assert.ok(first.some(e=>e.near?.side==='below'&&!e.reservationOwner))
assert.ok(first.some(e=>e.content==='나중에 더 길어진 설명도 처음부터 측정해요'&&!e.reservationOwner))
const sizes=Object.fromEntries(first.filter(e=>!e.reservationOwner).map(e=>[e.id,{height:52}]))
const expected=nearSpace(first,sizes)
assert.deepEqual(expected,{g:{above:60,below:60}})
for(const t of [2.1,4.1,6.1,8.1,0,4.1])assert.deepEqual(nearSpace(at(t).nearPlan,sizes),expected,'show, attach, setText, hide and backward seek do not shift owner space')
assert.deepEqual(blueprint,original)
console.log('PASS future near/attach and longest text reserved before show; stable space through hide and seek')
