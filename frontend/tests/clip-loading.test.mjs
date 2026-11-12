import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadClip } from '../src/services/clips.ts'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
const { cases } = read('../../backend/fixtures/cases.json')
const originalFetch = globalThis.fetch
const controller = new AbortController()
try {
  // Official fixtures are test data only; the webpage still calls the real API.
  for (const name of ['clip.not-found', 'clip.failed']) {
    const example = cases.find((item) => item.name === name)
    assert.ok(example)
    globalThis.fetch = async () => Response.json(example.response.body, { status: example.response.status })
    await assert.rejects(loadClip('test', controller.signal), (error) => {
      assert.ok(error.message.includes(example.response.body.error.message))
      assert.ok(error.message.includes(example.response.body.error.code))
      return true
    })
  }
  globalThis.fetch = async () => new Response('<html>Unavailable</html>', { status: 503 })
  await assert.rejects(loadClip('test', controller.signal), /503/)
  globalThis.fetch = async () => Response.json({ error: { message: 42 } }, { status: 500 })
  await assert.rejects(loadClip('test', controller.signal), /500/)
  globalThis.fetch = async () => new Response('invalid JSON', { status: 200 })
  await assert.rejects(loadClip('test', controller.signal), /아직 재생 가능한/)
  globalThis.fetch = async () => Response.json({ status: 'running', result: null })
  await assert.rejects(loadClip('test', controller.signal), /아직 재생 가능한/)
  for (const file of ['../../samples/clip-01/result.json', '../../samples/clip-01/alt-terra/result.json', '../../samples/parts-test/result.json']) {
    const result = read(file)
    globalThis.fetch = async (url, options) => {
      assert.equal(url.pathname, '/clips/clip%2Fwith%20space')
      assert.equal(options.signal, controller.signal)
      return Response.json({ status: 'completed', error: null, result: { ...result, audioUrl: '/assets/test-audio' } })
    }
    const loaded = await loadClip('clip/with space', controller.signal)
    assert.equal(loaded.resultId, result.resultId)
    assert.equal(loaded.audioUrl, 'http://127.0.0.1:8000/assets/test-audio')
    assert.deepEqual(loaded.captions, result.captions)
  }
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(loadClip('test', controller.signal), (error) => {
    assert.ok(error.message.includes('백엔드 서버에 연결하지 못했어요'))
    assert.ok(error.message.includes('http://127.0.0.1:8000'))
    return true
  })
  const canceled = new AbortController()
  canceled.abort()
  const cancelReason = new Error('request canceled')
  globalThis.fetch = async () => { throw cancelReason }
  await assert.rejects(loadClip('test', canceled.signal), (error) => error === cancelReason)
  // Canceled requests keep their AbortError so the caller can ignore stale loads.
  globalThis.fetch = async () => { throw new DOMException('canceled', 'AbortError') }
  await assert.rejects(loadClip('test', controller.signal), { name: 'AbortError' })
} finally {
  globalThis.fetch = originalFetch
}
console.log('PASS official clip errors, malformed responses, real result loading, audio URL, request signal and cancellation')
