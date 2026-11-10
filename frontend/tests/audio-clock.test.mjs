import assert from 'node:assert/strict'
import { bindAudioClock } from '../src/player/audioClock.ts'
class Audio extends EventTarget {
  currentTime = 0; paused = true; ended = false; seeking = false
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
  emit(name) { this.dispatchEvent(new Event(name)) }
}
const audio = new Audio()
const callbacks = new Map()
let id = 0
const frames = {request(fn){callbacks.set(++id,fn);return id},cancel(key){callbacks.delete(key)}}
const times = []
const cleanup = bindAudioClock(audio,time => times.push(time),frames)
assert.equal(times.at(-1),0)
assert.equal(callbacks.size,0)
audio.paused = false; audio.emit('play'); assert.equal(callbacks.size,1)
function step(){ const [key,fn] = callbacks.entries().next().value; callbacks.delete(key);fn(0) }
audio.currentTime = 1.25;step();assert.equal(times.at(-1),1.25);assert.equal(callbacks.size,1)
audio.pause();assert.equal(callbacks.size,0)
audio.currentTime = 8;audio.emit('seeked');assert.equal(times.at(-1),8)
audio.paused=false;audio.emit('play');audio.seeking=true;audio.emit('seeking');assert.equal(callbacks.size,0)
audio.currentTime=2;audio.seeking=false;audio.emit('seeked');assert.equal(times.at(-1),2);assert.equal(callbacks.size,1)
audio.currentTime=0;step();assert.equal(times.at(-1),0)
const stale = callbacks.values().next().value
cleanup();assert.equal(callbacks.size,0);assert.equal(audio.paused,true)
const count=times.length;audio.emit('timeupdate');stale(0);assert.equal(times.length,count)
console.log('PASS audio clock: playback frames, pause, forward/reverse seek, loop, cleanup and stale callbacks')
