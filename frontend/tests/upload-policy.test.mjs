import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {fileURLToPath} from 'node:url'
import {request,ApiRequestError} from '../src/services/preparation.ts'
const message='PDF가 101쪽이에요. 최대 100쪽까지 올릴 수 있어요. 필요한 부분만 나눠서 올려 주세요.'
const original=globalThis.fetch
try{
 globalThis.fetch=async()=>Response.json({error:{code:'PDF_TOO_LONG',message,retryable:false}},{status:422})
 await assert.rejects(request('/lectures',new AbortController().signal),e=>e instanceof ApiRequestError&&e.code==='PDF_TOO_LONG'&&e.message===message)
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch')}
 await assert.rejects(request('/health',new AbortController().signal),/localhost:5173/)
}finally{globalThis.fetch=original}
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'})
try{
 const {default:Panel}=await server.ssrLoadModule('/src/components/PreparationPanel.tsx')
 const html=renderToStaticMarkup(createElement(Panel,{fileName:'101.pdf',preparation:{phase:'upload-error',message},onBack(){},onContinue(){}}))
 assert.ok(html.includes(message));assert.ok(html.includes('파일 선택으로 돌아가기'))
 assert.ok(!html.includes('같은 작업 상태 다시 확인'))
 console.log('PASS server page-limit message preserved, file replacement offered and connection port guidance')
}finally{await server.close()}
