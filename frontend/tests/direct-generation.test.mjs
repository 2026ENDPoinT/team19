import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { watchOrCreateOutline } from '../src/services/outlines.ts'
const {cases}=JSON.parse(readFileSync(new URL('../../backend/fixtures/cases.json',import.meta.url),'utf8'))
const body=name=>structuredClone(cases.find(item=>item.name===name).response.body)
const done=body('outline.review.A.registered');done.status='ready';done.clips.forEach(clip=>clip.status='completed')
const missing=()=>Response.json({error:{code:'OUTLINE_NOT_FOUND',message:'missing'}},{status:404})
const original=globalThis.fetch
try {
 let posts=0,gets=0,claims=0,created=false
 globalThis.fetch=async(url,options)=>{
  if(url.pathname==='/health')return Response.json({aiMode:'real'})
  if(options.method==='POST'){posts++;created=true;return Response.json(body('outline.review.accepted'),{status:202})}
  gets++;return created?Response.json(done):missing()
 }
 const signal=new AbortController().signal
 assert.equal((await watchOrCreateOutline('lec_01','review',()=>{},signal,'real',()=>{claims++;return true})).status,'ready')
 assert.equal(posts,1);assert.equal(gets,2);assert.equal(claims,1)
 await watchOrCreateOutline('lec_01','review',()=>{},signal,'real',()=>{throw Error('existing must not create')})
 assert.equal(posts,1)
 created=false
 assert.equal(await watchOrCreateOutline('lec_01','review',()=>{},signal,'real',()=>false),null)
 assert.equal(posts,1)
 let allowed=true
 const claim=()=>{const result=allowed;allowed=false;return result}
 globalThis.fetch=async(url,options)=>{
  if(url.pathname==='/health')return Response.json({aiMode:'real'})
  if(options.method==='POST'){posts++;throw Error('response lost')}
  return missing()
 }
 await assert.rejects(watchOrCreateOutline('lec_01','review',()=>{},signal,'real',claim),/서버에 연결하지 못했어요/)
 assert.equal(posts,2)
 await watchOrCreateOutline('lec_01','review',()=>{},signal,'real',claim)
 assert.equal(posts,2,'query retry must not repeat ambiguous generation')
 globalThis.fetch=async(url,options)=>url.pathname==='/health'?Response.json({aiMode:'sample'}):missing()
 await assert.rejects(watchOrCreateOutline('lec_01','review',()=>{},signal,'real',()=>true),/서버 실행 모드/)
 const controller=new AbortController();controller.abort()
 await assert.rejects(watchOrCreateOutline('lec_01','review',()=>{},controller.signal,'real',()=>{throw Error('aborted claim')}),{name:'AbortError'})
 console.log('PASS mode selection auto-create once, existing reuse, GET-only retry, ambiguous POST suppression, server-mode guard and cancellation')
}finally{globalThis.fetch=original}
