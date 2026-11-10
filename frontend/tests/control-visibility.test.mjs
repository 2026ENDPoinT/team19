import assert from 'node:assert/strict'
import { scheduleControlsVisibility } from '../src/player/controlVisibility.ts'
let now = 0, next = 0
const tasks = new Map()
const scheduler = {
  set(callback, delay) { const id = ++next; tasks.set(id, { callback, at: now + delay }); return id },
  clear(id) { tasks.delete(id) },
}
function advance(ms) {
  now += ms
  for (const [id, task] of [...tasks]) if (task.at <= now) { tasks.delete(id); task.callback() }
}
const values = []
const outside = { playing: true, hovered: false, interacting: false }
let cleanup = scheduleControlsVisibility(outside, value => values.push(value), scheduler)
advance(1499)
assert.deepEqual(values, [true])
advance(1)
assert.deepEqual(values, [true, false])
cleanup()
for (const state of [
  { ...outside, playing: false }, { ...outside, hovered: true }, { ...outside, interacting: true },
]) {
  cleanup = scheduleControlsVisibility(state, value => values.push(value), scheduler)
  advance(3000)
  assert.equal(values.at(-1), true)
  assert.equal(tasks.size, 0)
  cleanup()
}
// Re-entering or pausing cancels the old timer, including an already queued callback.
cleanup = scheduleControlsVisibility(outside, value => values.push(value), scheduler)
const staleCallback = [...tasks.values()][0].callback
advance(1000)
cleanup()
const count = values.length
staleCallback()
assert.equal(values.length, count)
cleanup = scheduleControlsVisibility({ ...outside, hovered: true }, value => values.push(value), scheduler)
advance(3000)
assert.equal(values.at(-1), true)
cleanup()
assert.equal(tasks.size, 0)
console.log('PASS controls hide after 1.5s, stay visible on pause/hover/interaction, re-entry, timer cleanup and stale callbacks')
