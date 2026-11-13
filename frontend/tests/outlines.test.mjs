import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createOutline, loadOutline, watchOutline } from '../src/services/outlines.ts'
const { cases } = JSON.parse(readFileSync(new URL('../../backend/fixtures/cases.json', import.meta.url), 'utf8'))
const body = name => structuredClone(cases.find(item => item.name === name).response.body)
const originalFetch = globalThis.fetch
const signal = new AbortController().signal
try {
  for (const mode of ['intro','review','exam']) {
    const paths = []
    globalThis.fetch = async (url, options) => {
      paths.push(url.pathname)
      if (url.pathname === '/health') return Response.json({aiMode:'sample'})
      assert.equal(options.method,'POST')
      assert.deepEqual(JSON.parse(options.body),{mode})
      return Response.json(body(`outline.${mode}.accepted`),{status:202})
    }
    assert.equal((await createOutline('lec_01',mode,signal)).reused,false)
    assert.equal(paths.length,2)
  }
  let count = 0
  globalThis.fetch = async () => { count++; return Response.json({aiMode:'real'}) }
  await assert.rejects(createOutline('lec_01','review',signal),/비용/)
  assert.equal(count,1)
  globalThis.fetch = async url => url.pathname === '/health' ? Response.json({aiMode:'sample'}) : Response.json(body('outline.review.reused.ready'),{status:200})
  assert.equal((await createOutline('lec_01','review',signal)).reused,true)
  globalThis.fetch = async () => Response.json({error:{code:'OUTLINE_NOT_FOUND',message:'missing'}},{status:404})
  assert.equal(await loadOutline('lec_01','review',signal),null)
  globalThis.fetch = async () => Response.json({error:{code:'LECTURE_NOT_FOUND',message:'lecture missing'}},{status:404})
  await assert.rejects(loadOutline('lec_01','review',signal),/lecture missing/)
  const planning = body('outline.review.planning')
  const active = body('outline.review.A.registered')
  active.clips[0].status='completed'
  const done = structuredClone(active)
  done.clips.forEach((clip,index) => clip.status=index === 1 ? 'failed' : 'completed')
  let reads = 0
  const waits = [], snapshots = []
  globalThis.fetch = async (url,options) => {
    assert.equal(options.method,undefined)
    if (url.pathname.startsWith('/jobs/')) return Response.json({id:planning.jobId,status:'running',stage:'planning',error:null})
    return Response.json([planning,active,done][reads++])
  }
  const result = await watchOutline('lec_01','review',data=>snapshots.push(data),signal,async ms=>waits.push(ms))
  assert.equal(snapshots.length,3)
  assert.equal(snapshots[1].outline.clips[0].status,'completed')
  assert.deepEqual(waits,[3000,3000])
  assert.ok(result.clips.every(clip=>clip.status==='completed'||clip.status==='failed'))
  globalThis.fetch = async url => url.pathname.startsWith('/jobs/') ? Response.json({id:planning.jobId,status:'failed',error:{message:'planning failed'}}) : Response.json(planning)
  const failed=[]
  assert.equal((await watchOutline('lec_01','review',data=>failed.push(data),signal,async()=>assert.fail('must stop'))).status,'failed')
  assert.equal(failed[0].message,'planning failed')
  globalThis.fetch = async () => { throw new TypeError('offline') }
  await assert.rejects(watchOutline('lec_01','review',()=>{},signal),/서버에 연결/)
  globalThis.fetch = async (_,options) => { assert.equal(options.method,undefined); return Response.json(done) }
  assert.equal((await watchOutline('lec_01','review',()=>{},signal)).status,'ready')
  const wrong=structuredClone(done);wrong.mode='exam'
  globalThis.fetch=async()=>Response.json(wrong)
  await assert.rejects(loadOutline('lec_01','review',signal),/응답 형식/)
  const stale=new AbortController()
  globalThis.fetch=async()=>{stale.abort();return Response.json(done)}
  await assert.rejects(watchOutline('lec_01','review',()=>assert.fail('stale callback'),stale.signal),{name:'AbortError'})
} finally { globalThis.fetch=originalFetch }
console.log('PASS mode requests, sample guard, reused 200, precise 404, 3s polling, partial-ready list, terminal failures, GET-only resume and cancellation')
