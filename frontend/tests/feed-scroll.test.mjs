import assert from 'node:assert/strict'
import { wheelIntent, wheelPixels, playerSnapOffset } from '../src/player/feedScroll.ts'
assert.equal(wheelPixels(3,1,800),48)
assert.equal(wheelPixels(1,2,800),800)
assert.equal(wheelPixels(20,0,800),20)
assert.equal(wheelIntent(20,30,50).release,false)
assert.equal(wheelIntent(100,100,80).release,true)
assert.equal(wheelIntent(-130,0,500).release,true)
assert.deepEqual(wheelIntent(-20,160,50),{total:-20,release:false})
assert.deepEqual(wheelIntent(30,160,300),{total:30,release:false})
console.log('PASS wheel unit normalization, slow scroll hold, fast release, direction reversal and burst timeout')

assert.equal(playerSnapOffset(100,600,800),0,'short player is vertically centered')
assert.equal(playerSnapOffset(12,776,800),0,'full-height player keeps 12px clearance')
assert.equal(playerSnapOffset(70,776,800),58,'nearby resting scroll is aligned')
assert.equal(playerSnapOffset(-60,776,800),-72,'alignment works from below too')

const {attachFeedScroll}=await import('../src/player/feedScroll.ts')
const saved={window:globalThis.window,document:globalThis.document,Element:globalThis.Element}
const listeners=new Map(),scrolls=[]
let frameCallback, cancelled=false
try{
 globalThis.Element=class {}
 globalThis.window={requestAnimationFrame:fn=>{frameCallback=fn;return 1},cancelAnimationFrame:()=>{cancelled=true},innerHeight:800,scrollY:300,matchMedia:()=>({matches:false}),scrollTo:value=>scrolls.push(value),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}
 globalThis.document={fullscreenElement:null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}
 const detach=attachFeedScroll(()=>({getBoundingClientRect:()=>({top:80,height:776})}))
 listeners.get('scroll')()
 await new Promise(resolve=>setTimeout(resolve,190))
 frameCallback(performance.now()+425)
 assert.ok(scrolls.at(-1).top>300 && scrolls.at(-1).top<368,'animation passes through an intermediate position')
 frameCallback(performance.now()+900)
 assert.equal(scrolls.at(-1).top,368,'idle nearby scroll snaps to optimal frame')
 listeners.get('scroll')()
 await new Promise(resolve=>setTimeout(resolve,190))
 listeners.get('wheel')({deltaY:130,deltaX:0,deltaMode:0,cancelable:true,target:null,preventDefault(){throw new Error('strong scroll must remain free')}})
 assert.equal(cancelled,true,'strong wheel cancels in-flight animation')
 const count=scrolls.length
 listeners.get('scroll')()
 await new Promise(resolve=>setTimeout(resolve,190))
 assert.equal(scrolls.length,count,'release cooldown prevents immediate recapture')
 detach();assert.equal(listeners.size,0,'unmount removes listeners')
 console.log('PASS idle snapping, strong wheel escape, cooldown and cleanup')
}finally{
 for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value
}
