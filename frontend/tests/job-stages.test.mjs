import assert from 'node:assert/strict'
import { jobStageLabel } from '../src/services/jobStages.ts'
import { watchOutline } from '../src/services/outlines.ts'
for(const stage of ['queued','starting','extracting','describing','planning','blueprint','audio','finished','failed','interrupted']) assert.ok(!jobStageLabel(stage).includes('서버에서 처리'))
for(const stage of [null,undefined,'new-stage','__proto__','toString']) assert.equal(jobStageLabel(stage),'서버에서 처리 상태를 확인하는 중')
assert.ok(!jobStageLabel('describing').includes('AI'),'sample is not real AI analysis')
const originalFetch=globalThis.fetch
const signal=new AbortController().signal
const outline={id:'outline',mode:'review',status:'ready',jobId:'outline-job',clips:[
 {id:'done',order:0,title:'완료',sourcePages:[1],status:'completed',jobId:'done-job'},
 {id:'active',order:1,title:'진행',sourcePages:[2],status:'running',jobId:'active-job'},
 {id:'queued',order:2,title:'대기',sourcePages:[3],status:'pending',jobId:'queued-job'},
]}
try {
 let round=0;const jobReads=[],snapshots=[],waits=[]
 globalThis.fetch=async(url,options)=>{
  assert.equal(options.method,undefined)
  if(url.pathname.startsWith('/jobs/')){jobReads.push(url.pathname);return Response.json({id:'active-job',status:'running',stage:round===1?'blueprint':'audio'})}
  round++;const data=structuredClone(outline)
  if(round===3)data.clips.forEach(clip=>clip.status='completed')
  return Response.json(data)
 }
 await watchOutline('lecture','review',data=>snapshots.push(data),signal,async ms=>waits.push(ms))
 assert.deepEqual(jobReads,['/jobs/active-job','/jobs/active-job'])
 assert.deepEqual(snapshots.slice(0,2).map(data=>data.outline.clips[1].stage),['blueprint','audio'])
 assert.equal(snapshots[0].outline.clips[0].status,'completed')
 assert.equal(snapshots[0].outline.clips[2].stage,'queued')
 assert.deepEqual(waits,[3000,3000])
 const failed=structuredClone(outline);failed.clips=failed.clips.slice(0,2)
 globalThis.fetch=async url=>Response.json(url.pathname.startsWith('/jobs/')?{id:'active-job',status:'failed',stage:'interrupted',error:{message:'서버 재시작'}}:failed)
 const failure=[]
 await watchOutline('lecture','review',data=>failure.push(data),signal,async()=>assert.fail('terminal must stop'))
 assert.equal(failure[0].outline.clips[1].status,'failed')
 assert.equal(failure[0].outline.clips[1].message,'서버 재시작')
 globalThis.fetch=async url=>Response.json(url.pathname.startsWith('/jobs/')?{id:'wrong',status:'running',stage:'audio'}:outline)
 await assert.rejects(watchOutline('lecture','review',()=>{},signal),/클립 작업 응답/)
 const controller=new AbortController()
 globalThis.fetch=async url=>{
  if(url.pathname.startsWith('/jobs/')){controller.abort();return Response.json({id:'active-job',status:'running',stage:'audio'})}
  return Response.json(outline)
 }
 await assert.rejects(watchOutline('lecture','review',()=>assert.fail('stale update'),controller.signal),{name:'AbortError'})
} finally {globalThis.fetch=originalFetch}
console.log('PASS stage labels, safe fallback, running-job stages, per-clip queue, partial readiness, terminal failures and cancellation; GET only')
