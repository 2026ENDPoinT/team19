import assert from 'node:assert/strict'
import { wheelIntent, wheelPixels } from '../src/player/feedScroll.ts'
assert.equal(wheelPixels(3,1,800),48)
assert.equal(wheelPixels(1,2,800),800)
assert.equal(wheelPixels(20,0,800),20)
assert.equal(wheelIntent(20,30,50).release,false)
assert.equal(wheelIntent(100,100,80).release,true)
assert.equal(wheelIntent(-130,0,500).release,true)
assert.deepEqual(wheelIntent(-20,160,50),{total:-20,release:false})
assert.deepEqual(wheelIntent(30,160,300),{total:30,release:false})
console.log('PASS wheel unit normalization, slow scroll hold, fast release, direction reversal and burst timeout')
