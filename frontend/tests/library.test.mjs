import assert from 'node:assert/strict'
import { listLectures, loadLecture } from '../src/services/preparation.ts'
const originalFetch = globalThis.fetch
const signal = new AbortController().signal
try {
  globalThis.fetch = async (url, options) => {
    if (url.pathname === '/lectures') {
      assert.match(options.headers['X-Owner-Id'], /^[A-Za-z0-9_-]{16,64}$/)
      return Response.json([{ id: 'lec_1', title: '그리디', status: 'ready', pageCount: 3 }, { id: 'lec_2', title: '', status: 'running', pageCount: 0 }, { bad: true }])
    }
    assert.equal(url.pathname, '/lectures/lec_1')
    return Response.json({ id: 'lec_1', title: '그리디', status: 'ready', pageCount: 2, preparationJobId: 'job_9', pages: [{ number: 1, imageUrl: '/assets/a' }, { number: 2, imageUrl: null }] })
  }
  assert.deepEqual(await listLectures(signal), [
    { id: 'lec_1', title: '그리디', status: 'ready', pageCount: 3 },
    { id: 'lec_2', title: '제목 없는 강의', status: 'running', pageCount: 0 },
  ])
  const lecture = await loadLecture('lec_1', 'sample', signal)
  assert.equal(lecture.id, 'lec_1'); assert.equal(lecture.pageCount, 2); assert.equal(lecture.aiMode, 'sample')
  assert.equal(Object.keys(lecture.pages).length, 1)
  await assert.rejects(loadLecture('lec_1', 'sample', signal, 'other_job'))
  console.log('PASS library: owner header on list, malformed rows skipped, open ready lecture without upload job')
} finally { globalThis.fetch = originalFetch }
