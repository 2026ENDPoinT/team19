import assert from 'node:assert/strict'
import { handlePlayerShortcut } from '../src/player/keyboardShortcuts.ts'
const audio = {paused:false,currentTime:10}
let toggles = 0, prevented = 0, stopped = 0
function press(key, extras={}, editing=false, target=audio) {
 handlePlayerShortcut({key,repeat:false,altKey:false,ctrlKey:false,metaKey:false,isComposing:false,preventDefault(){prevented++},stopPropagation(){stopped++},...extras},target,20,()=>toggles++,editing)
}
press('ArrowLeft'); assert.equal(audio.currentTime,8)
press('ArrowRight'); assert.equal(audio.currentTime,10)
audio.paused=true; press('ArrowLeft'); assert.equal(audio.currentTime,9)
audio.currentTime=0; press('ArrowLeft'); assert.equal(audio.currentTime,0)
audio.currentTime=20; press('ArrowRight'); assert.equal(audio.currentTime,20)
press(' '); press(' ',{repeat:true}); assert.equal(toggles,1)
const count=prevented
press(' ',{},true); press(' ',{ctrlKey:true}); press(' ',{isComposing:true}); press('x'); press(' ',{},false,null)
assert.equal(toggles,1); assert.equal(prevented,count); assert.equal(stopped,count)
console.log('PASS player shortcuts, repeat suppression, seek bounds, typing and modifier exceptions')
