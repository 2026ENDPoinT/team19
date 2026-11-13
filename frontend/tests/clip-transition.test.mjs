import assert from 'node:assert/strict'
import { clipTransitionFrames } from '../src/player/clipTransition.ts'
for(const height of [400,746]) {
 assert.deepEqual(clipTransitionFrames(1,height),{outgoing:[{transform:'translateY(0px)'},{transform:`translateY(${-height}px)`}],incoming:[{transform:`translateY(${height}px)`},{transform:'translateY(0px)'}]})
 assert.equal(clipTransitionFrames(-1,height).outgoing[1].transform,`translateY(${height}px)`)
 assert.equal(clipTransitionFrames(-1,height).incoming[0].transform,`translateY(${-height}px)`)
 assert.deepEqual(clipTransitionFrames(10,height),clipTransitionFrames(1,height))
}
console.log('PASS previous/next clip directions, frame-height travel limits and normalized direction')
