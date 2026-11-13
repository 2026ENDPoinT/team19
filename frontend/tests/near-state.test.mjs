import assert from 'node:assert/strict'
import { calculatePlayerState } from '../src/player/state.ts'
import { stageComposition } from '../src/player/stageComposition.ts'
const grid={id:'g',slot:'middle',cells:[['1','2']],pointers:[]}
const label={id:'t',slot:'bottom',style:'formula',content:'P(X=1)=p'}
const scene={id:'s',clear:true,sourcePages:[],lines:['설명','성공 칸 밑','원래 자리','숨김'],texts:[label],grids:[grid],diagrams:[],slides:[],codes:[],actions:[{line:1,do:'attach',target:'t',args:['g','below','0']},{line:2,do:'place',target:'t',args:['bottom']},{line:3,do:'hide',target:'t',args:[]}]}
const blueprint={version:0,title:'near',theme:'dark',scenes:[scene]}
const captions=scene.lines.map((text,i)=>({sceneId:'s',lineIndex:i,text,startSec:i*2,endSec:i*2+2}))
const before=structuredClone(blueprint),at=t=>calculatePlayerState(blueprint,captions,t),text=s=>s.elements.find(e=>e.id==='t')
assert.equal(text(at(1)).near,undefined)
const moving=text(at(2.1))
assert.deepEqual(moving.near,{target:'g',side:'below',cell:'0'})
assert.ok(Math.abs(moving.attachMotion.progress-.25)<1e-8)
assert.equal(moving.attachMotion.origin.find(e=>e.id==='t').slot,'bottom')
assert.equal(moving.attachMotion.origin.find(e=>e.id==='t').near,undefined)
assert.equal(stageComposition(at(2.1).elements).invalid,false)
assert.ok(!stageComposition(at(2.1).elements).reserved.some(e=>e.id==='t'))
assert.equal(text(at(2.5)).attachMotion,undefined)
assert.equal(text(at(4.1)).near,undefined);assert.equal(text(at(4.1)).slot,'bottom')
assert.equal(text(at(6.1)).hidden,true)
assert.deepEqual(at(2.1),at(2.1));at(7);assert.deepEqual(text(at(2.1)),moving)
assert.deepEqual(blueprint,before)
const staticNear={...label,slot:undefined,near:{target:'g',side:'right'}}
const make=(texts,actions=[])=>({...blueprint,scenes:[{...scene,texts,actions}]})
assert.equal(stageComposition(calculatePlayerState(make([staticNear]),captions,.5).elements).invalid,false)
for(const near of [{target:'missing',side:'below'},{target:'g',side:'bad'},{target:'g',side:'below',cell:'9'},{target:'g',side:'below',cell:''},{target:'g',side:'below',cell:'1.5'}])assert.throws(()=>calculatePlayerState(make([{...staticNear,near}]),captions,.5))
assert.throws(()=>calculatePlayerState(make([{...staticNear,style:'title'}]),captions,.5))
assert.throws(()=>calculatePlayerState(make([{...staticNear,near:{target:'t2',side:'below'}},{id:'t2',style:'body',content:'B',near:{target:'t',side:'below'}}]),captions,.5),/순환/)
const chain=make([staticNear,{id:'t2',style:'body',content:'값',near:{target:'t',side:'below'}}])
assert.equal(calculatePlayerState(chain,captions,.5).elements.length,3)
assert.equal(text(calculatePlayerState(make([label],[{line:0,do:'attach',target:'t',args:['g','left']}]),captions,.1)).near.side,'left')
console.log('PASS near/attach state, slot return, active origin/progress, hide, seek/repeat, immutable blueprint, target/style/cell errors and cycles')
