import assert from 'node:assert/strict'
import { startAutoplay } from '../src/player/autoplay.ts'
let plays=0,errors=0
startAutoplay({play(){plays++;return Promise.resolve()}},()=>errors++)
await Promise.resolve(); assert.equal(plays,1);assert.equal(errors,0)
startAutoplay({play(){return Promise.reject(new Error('NotAllowedError'))}},()=>errors++)
await Promise.resolve();assert.equal(errors,1)
let reject
const cancel=startAutoplay({play(){return new Promise((_,r)=>{reject=r})}},()=>errors++)
cancel();reject(new Error('stale request'))
await Promise.resolve();assert.equal(errors,1)
console.log('PASS autoplay attempt, blocked fallback and cancelled clip suppression')
