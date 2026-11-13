import assert from 'node:assert/strict'
import { sourcePageNavigation } from '../src/player/sourcePageNavigation.ts'
assert.deepEqual(sourcePageNavigation([3],3),{page:3,index:0,count:1,previous:undefined,next:undefined})
assert.deepEqual(sourcePageNavigation([3,4,8],4),{page:4,index:1,count:3,previous:3,next:8})
assert.equal(sourcePageNavigation([3,4,8],4,8).next,undefined)
assert.equal(sourcePageNavigation([3,4,8],4,3).previous,undefined)
assert.equal(sourcePageNavigation([3,4,8],4,99).page,4)
assert.equal(sourcePageNavigation([3,3,4],3).count,2)
assert.equal(sourcePageNavigation([],undefined).count,0)
console.log('PASS automatic/manual source selection, boundaries, duplicate pages, invalid selection and empty sources')
