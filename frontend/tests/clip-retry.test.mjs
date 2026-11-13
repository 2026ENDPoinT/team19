import assert from 'node:assert/strict'
import {canRetryClip,retryClip,loadOutline,watchOutline} from '../src/services/outlines.ts'
import {ApiRequestError} from '../src/services/preparation.ts'
const clip={id:'c',order:0,title:'실패 클립',sourcePages:[1],status:'failed',message:'설계도 오류',retryable:true,jobId:'old/job',stage:''}
const signal=new AbortController().signal,original=globalThis.fetch
try{
 const calls=[]
 globalThis.fetch=async(url,options)=>{
  calls.push([url.pathname,options.method??'GET'])
  if(url.pathname==='/health')return Response.json({aiMode:'sample'})
  assert.equal(url.pathname,'/jobs/old%2Fjob/retry');assert.equal(options.body,'{}');assert.equal(options.signal,signal)
  return Response.json({jobId:'new',retryOf:clip.jobId,status:'pending'},{status:202})
 }
 assert.equal(await retryClip(clip,signal,'sample'),'new')
 assert.deepEqual(calls,[['/health','GET'],['/jobs/old%2Fjob/retry','POST']])
 for(const other of [{...clip,status:'completed'},{...clip,retryable:false},{...clip,jobId:null}]){
  assert.equal(canRetryClip(other),false)
  const count=calls.length;await assert.rejects(retryClip(other,signal,'sample'));assert.equal(calls.length,count)
 }
 let posts=0
 globalThis.fetch=async(url)=>url.pathname==='/health'?Response.json({aiMode:'sample'}):(posts++,Response.json({error:{code:'RETRY_NOT_ALLOWED',message:'이미 요청됨',retryable:false}},{status:409}))
 await assert.rejects(retryClip(clip,signal,'sample'),e=>e instanceof ApiRequestError&&e.status===409)
 assert.equal(posts,1,'409 does not automatically retry')
 const payload={id:'o',mode:'intro',status:'ready',jobId:'outline-job',clips:[{...clip,error:{message:'설계도 오류',retryable:true}}]}
 globalThis.fetch=async()=>Response.json(payload)
 assert.equal((await loadOutline('l','intro',signal)).clips[0].retryable,true)
 let reads=0
 globalThis.fetch=async()=>Response.json({...payload,clips:[{...payload.clips[0],status:reads++?'completed':'pending',jobId:'new',error:null}]})
 const snapshots=[]
 await watchOutline('l','intro',s=>snapshots.push(s),signal,async()=>{})
 assert.deepEqual(snapshots.map(s=>s.outline.clips[0].status),['pending','completed'])
 console.log('PASS retry eligibility, exact single Job POST, 409 no retry, error metadata and resumed completion polling')
}finally{globalThis.fetch=original}
