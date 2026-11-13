import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { uploadPdf, watchPreparation, preparationDelay, PreparationFailed } from '../src/services/preparation.ts'
const fixtures = JSON.parse(readFileSync(new URL('../../backend/fixtures/cases.json', import.meta.url), 'utf8'))
const body = (name) => structuredClone(fixtures.cases.find((item) => item.name === name).response.body)
const originalFetch = globalThis.fetch
const signal = new AbortController().signal
try {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push([url.pathname, options.method ?? 'GET'])
    assert.equal(options.signal, signal)
    if (url.pathname === '/health') return Response.json({ aiMode: 'sample' })
    assert.equal(url.pathname, '/lectures')
    assert.ok(options.body instanceof FormData)
    assert.equal(options.body.get('file').name, 'test.pdf')
    // Content-Type은 브라우저가 multipart 경계와 함께 넣으므로 직접 넣지 않는다. 기기 ID 헤더만 보낸다(Q-BE-07).
    assert.deepEqual(Object.keys(options.headers), ['X-Owner-Id'])
    assert.match(options.headers['X-Owner-Id'], /^[A-Za-z0-9_-]{16,64}$/)
    return Response.json(body('upload.accepted'), { status: 202 })
  }
  const ticket = await uploadPdf(new File(['%PDF-test'], 'test.pdf', { type: 'application/pdf' }), signal)
  assert.deepEqual(ticket, { lectureId: 'lec_01', jobId: 'job_01', aiMode: 'sample' })
  assert.deepEqual(calls, [['/health','GET'],['/lectures','POST']])
  // A non-sample server must never receive the file.
  let realCalls = 0
  globalThis.fetch = async () => { realCalls++; return Response.json({ aiMode: 'real' }) }
  await assert.rejects(uploadPdf(new File(['test'], 'test.pdf'), signal), /비용/)
  assert.equal(realCalls, 1)
  const sequence = ['prepare.pending', 'prepare.running', 'prepare.completed', 'lecture.ready']
  const seen = [], waits = [], paths = []
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, undefined)
    paths.push(url.pathname)
    return Response.json(body(sequence.shift()))
  }
  const ready = await watchPreparation(ticket, job => seen.push(job.status), signal, async ms => { waits.push(ms) })
  assert.deepEqual(seen, ['pending','running','completed'])
  assert.deepEqual(waits, [3000,3000])
  assert.equal(ready.id, 'lec_01')
  assert.equal(ready.pageCount, body('lecture.ready').pageCount)
  for (const page of body('lecture.ready').pages) {
    if (page.imageUrl) assert.equal(ready.pages[page.number], new URL(page.imageUrl, 'http://127.0.0.1:8000').href)
  }
  assert.equal(paths.at(-1), '/lectures/lec_01')
  // Failure terminates without a timer or lecture request.
  globalThis.fetch = async () => Response.json({ id: 'job_01', status: 'failed', error: { message: 'PDF error' } })
  await assert.rejects(watchPreparation(ticket, () => {}, signal, async () => assert.fail('must stop')), error => error instanceof PreparationFailed && error.message === 'PDF error')
  // An interrupted GET can be resumed on the same ticket; no POST is sent.
  globalThis.fetch = async () => { throw new TypeError('network failure') }
  await assert.rejects(watchPreparation(ticket, () => {}, signal), /서버에 연결/)
  const resumed = ['prepare.completed','lecture.ready']
  globalThis.fetch = async (url, options) => { assert.equal(options.method, undefined); return Response.json(body(resumed.shift())) }
  assert.equal((await watchPreparation(ticket, () => {}, signal)).id, 'lec_01')
  globalThis.fetch = async () => Response.json({ id: 'other-job', status: 'completed' })
  await assert.rejects(watchPreparation(ticket, () => {}, signal), /응답 형식/)
  // Leaving the screen cancels waiting and ignores an in-flight old response.
  const abort = new AbortController()
  const waiting = preparationDelay(3000, abort.signal)
  abort.abort()
  await assert.rejects(waiting, { name: 'AbortError' })
  const stale = new AbortController()
  globalThis.fetch = async () => { stale.abort(); return Response.json(body('prepare.completed')) }
  await assert.rejects(watchPreparation(ticket, () => assert.fail('stale update'), stale.signal), { name: 'AbortError' })
} finally { globalThis.fetch = originalFetch }
console.log('PASS sample-only upload, multipart, 3s sequential poll, completion, failure, query resume without POST, wrong job and cancellation')
