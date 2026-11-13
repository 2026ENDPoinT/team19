import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { authorizeGeneration, uploadPdf, watchPreparation, RealGenerationConfirmationRequired } from '../src/services/preparation.ts'
import { createOutline } from '../src/services/outlines.ts'
const originalFetch=globalThis.fetch,signal=new AbortController().signal
const file=new File(['%PDF-test'],'test.pdf',{type:'application/pdf'})
const fixtures=JSON.parse(readFileSync(new URL('../../backend/fixtures/cases.json',import.meta.url),'utf8')).cases
const body=name=>structuredClone(fixtures.find(item=>item.name===name).response.body)
try {
 for(const mode of ['sample','real'])for(const allowed of [false,true]){
  const calls=[]
  globalThis.fetch=async(url,options)=>{
   calls.push([url.pathname,options.method??'GET']);assert.equal(options.signal,signal)
   if(url.pathname==='/health')return Response.json({aiMode:mode})
   assert.equal(options.method,'POST')
   if(url.pathname==='/lectures'){assert.ok(options.body instanceof FormData);return Response.json(body('upload.accepted'),{status:202})}
   assert.deepEqual(JSON.parse(options.body),{mode:'review'})
   return Response.json(body('outline.review.accepted'),{status:202})
  }
  if(mode==='real'&&!allowed){
   await assert.rejects(uploadPdf(file,signal),RealGenerationConfirmationRequired)
   await assert.rejects(createOutline('lec_01','review',signal),RealGenerationConfirmationRequired)
   assert.ok(calls.every(call=>call[1]==='GET'))
  }else{
   const ticket=await uploadPdf(file,signal,allowed);assert.equal(ticket.aiMode,mode)
   assert.equal((await createOutline(ticket.lectureId,'review',signal,{allowReal:allowed,expectedMode:mode})).aiMode,mode)
   assert.equal(calls.filter(call=>call[1]==='POST').length,2)
   if(mode==='real'){
    await assert.rejects(uploadPdf(file,signal),RealGenerationConfirmationRequired)
    await assert.rejects(createOutline(ticket.lectureId,'review',signal),RealGenerationConfirmationRequired)
    assert.equal(calls.filter(call=>call[1]==='POST').length,2,'approval is not global or reused implicitly')
   }
  }
 }
 for(const mode of ['REAL','samle',undefined,['sample'],{mode:'real'}]){
  let posts=0;globalThis.fetch=async(_,options)=>{if(options.method==='POST')posts++;return Response.json({aiMode:mode})}
  await assert.rejects(uploadPdf(file,signal,true),/모드/)
  await assert.rejects(createOutline('lec_01','review',signal,{allowReal:true}),/모드/)
  assert.equal(posts,0)
 }
 let posts=0;globalThis.fetch=async(_,options)=>{if(options.method==='POST')posts++;return Response.json({aiMode:'real'})}
 await assert.rejects(createOutline('lec_01','review',signal,{allowReal:true,expectedMode:'sample'}),/모드가 바뀌/)
 assert.equal(posts,0)
 const reads=[];globalThis.fetch=async(url,options)=>{assert.equal(options.method,undefined);reads.push(url.pathname);return Response.json(body(url.pathname.startsWith('/jobs/')?'prepare.completed':'lecture.ready'))}
 const ready=await watchPreparation({lectureId:'lec_01',jobId:'job_01',aiMode:'real'},()=>{},signal)
 assert.equal(ready.aiMode,'real');assert.equal(reads.length,2)
 globalThis.fetch=async()=>{throw new TypeError('offline')}
 await assert.rejects(authorizeGeneration(signal,true),/서버에 연결/)
}finally{globalThis.fetch=originalFetch}
console.log('PASS sample/real request gates, per-request explicit approval, strict unknown-mode rejection, mode-change guard and GET-only real preparation')
