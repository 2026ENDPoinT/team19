import assert from 'node:assert/strict'
import {deleteLecture,ApiRequestError} from '../src/services/preparation.ts'
const original=globalThis.fetch,signal=new AbortController().signal
try{
 let calls=0
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(url.pathname,'/lectures/a%2Fb');assert.equal(options.method,'DELETE')
  assert.match(options.headers['X-Owner-Id'],/^[A-Za-z0-9_-]{16,64}$/);assert.equal(options.signal,signal)
  return new Response(null,{status:204})
 }
 assert.equal(await deleteLecture('a/b',signal),'deleted');assert.equal(calls,1)
 for(const [status,code,result] of [[404,'LECTURE_NOT_FOUND','deleted'],[500,'STORAGE_CLEANUP_PENDING','cleanup-pending']]){
  globalThis.fetch=async()=>Response.json({error:{code,message:code}},{status})
  assert.equal(await deleteLecture('l',signal),result)
 }
 for(const [status,code] of [[409,'LECTURE_BUSY'],[503,'STORAGE_UNAVAILABLE'],[422,'INVALID_REQUEST']]){
  let attempts=0
  globalThis.fetch=async()=>{attempts++;return Response.json({error:{code,message:code}},{status})}
  await assert.rejects(deleteLecture('l',signal),e=>e instanceof ApiRequestError&&e.code===code)
  assert.equal(attempts,1,'failed deletion is not automatically repeated')
 }
 globalThis.fetch=async()=>{throw new TypeError('network')}
 await assert.rejects(deleteLecture('l',signal),/서버에 연결/)
 console.log('PASS owned DELETE, 204, absent lecture, cleanup pending, busy/storage failure and no automatic retries')
}finally{globalThis.fetch=original}
