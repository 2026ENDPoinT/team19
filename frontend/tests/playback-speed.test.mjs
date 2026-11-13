import assert from 'node:assert/strict'
import { BASE_SPEED, toPlaybackRate, toShownRate } from '../src/player/playbackSpeed.ts'
assert.equal(BASE_SPEED, 1.25)
assert.equal(toPlaybackRate(1), 1.25); assert.equal(toPlaybackRate(2), 2.5); assert.equal(toPlaybackRate(0.5), 0.625)
for (const shown of [0.5, 0.75, 1, 1.25, 1.5, 1.7, 2]) assert.equal(toShownRate(toPlaybackRate(shown)), shown)
console.log('PASS base speed 1.25x: shown 1.0x plays at 1.25x, round trip for every speed step')
