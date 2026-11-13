import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'})
try {
 const {default:ProcessingStatus}=await server.ssrLoadModule('/src/components/ProcessingStatus.tsx')
 const draw=progress=>renderToStaticMarkup(createElement(ProcessingStatus,{progress}))
 for(const [completed,total,expected] of [[0,4,0],[1,4,25],[2,3,66],[4,4,100]]) {
  const html=draw({completed,total})
  assert.ok(html.includes(`aria-valuenow="${expected}"`));assert.ok(html.includes(`${expected}%`))
  assert.ok(html.includes(`전체 ${total}개 중 ${completed}개 클립 완성`))
 }
 for(const progress of [undefined,{completed:0,total:0}]) {
  const html=draw(progress);assert.ok(!html.includes('aria-valuenow='));assert.ok(!html.includes('%'));assert.ok(!html.includes('분석 중'))
 }
 const artwork=draw(undefined)
 assert.ok(artwork.includes('processing-artwork\" aria-hidden=\"true'))
 // 정적 점 96개 대신 마우스에 반응하는 도트 판(canvas) 하나를 장식으로 둔다.
 assert.ok(/<canvas class="dot-field dot-field--art" aria-hidden="true">/.test(artwork))
 // 단계별 부분 점수: 5개 중 1개 완성 + 1개 음성 단계 → 36%, 문구는 완성 1개 그대로
 {const html=draw({completed:1,total:5,done:1.8});assert.ok(html.includes('aria-valuenow="36"'));assert.ok(html.includes('전체 5개 중 1개 클립 완성'))}
 console.log('PASS confirmed completion percentage and no percentage or placeholder for unknown progress')
} finally {await server.close()}
