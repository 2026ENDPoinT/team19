import { useEffect, useRef, useState } from 'react'
import ActualClipPreview from './ActualClipPreview'
import { createOutline, watchOutline } from '../services/outlines'
import type { LearningMode, OutlineSnapshot } from '../services/outlines'
import type { PreparedLecture } from '../services/preparation'
type Props = { lecture: PreparedLecture; mode: LearningMode; modeName: string; onBack: () => void }
export default function OutlineFlow({ lecture, mode, modeName, onBack }: Props) {
  const [snapshot, setSnapshot] = useState<OutlineSnapshot | null>(null)
  const [phase, setPhase] = useState<'loading'|'idle'|'creating'|'watching'|'done'|'error'>('loading')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [playingClip, setPlayingClip] = useState<string | null>(null)
  const posting = useRef<AbortController | null>(null)
  const polling = useRef<AbortController | null>(null)
  useEffect(() => () => posting.current?.abort(), [])
  useEffect(() => {
    if (playingClip) return
    const controller = new AbortController()
    polling.current = controller
    setPhase('loading'); setMessage('')
    watchOutline(lecture.id, mode, (data) => { setSnapshot(data); setPhase('watching') }, controller.signal).then((result) => {
      if (!controller.signal.aborted) setPhase(result ? 'done' : 'idle')
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) { setPhase('error'); setMessage(cause instanceof Error ? cause.message : '클립 목록 조회 오류') }
    })
    return () => { controller.abort(); if (polling.current === controller) polling.current = null }
  }, [lecture.id, mode, refresh, playingClip])
  async function start() {
    if (posting.current) return
    polling.current?.abort()
    const controller = new AbortController()
    posting.current = controller
    setPhase('creating'); setMessage('')
    try {
      await createOutline(lecture.id, mode, controller.signal)
      if (!controller.signal.aborted) setRefresh((value) => value + 1)
    } catch (cause) {
      if (!controller.signal.aborted) { setPhase('error'); setMessage(cause instanceof Error ? cause.message : '클립 준비 요청 오류') }
    } finally { if (posting.current === controller) posting.current = null }
  }
  if (playingClip) return <ActualClipPreview key={playingClip} initialClipId={playingClip} pages={lecture.pages} onBack={() => setPlayingClip(null)} />
  const labels = {pending:'대기 중',running:'생성 중',completed:'준비 완료',failed:'생성 실패'}
  return <main className="mx-auto max-w-3xl px-5 py-10">
    <button type="button" className="rounded-lg border px-4 py-2" onClick={onBack}>← 학습 모드 선택</button>
    <h1 className="mt-7 text-2xl font-bold">{modeName} · 학습 클립</h1>
    <p className="mt-3 text-sm leading-6 text-slate-500">샘플 서버 연결 확인이에요. 업로드 PDF의 발췌·대체 페이지 그림·무음 음성을 사용해요. 아직 개념 추출 결과가 아닌 페이지별 개발용 샘플이에요. 한국어 개념명 생성·실제 AI 요약·TTS 내레이션은 연결 전이에요.</p>
    {phase === 'idle' && <div className="mt-7 rounded-xl bg-blue-50 p-5"><p>이 모드의 클립 계획이 아직 없어요.</p><button type="button" className="mt-4 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white" onClick={start}>이 모드로 클립 준비 요청</button></div>}
    {(phase === 'loading' || phase === 'creating' || phase === 'watching') && <p role="status" className="mt-6">{phase === 'creating' ? '클립 준비를 요청하고 있어요…' : snapshot?.outline.status === 'planning' || snapshot?.outline.status === 'pending' ? '자료를 클립으로 나누고 있어요…' : '클립 상태를 확인하고 있어요…'} 완료된 클립부터 열 수 있어요.</p>}
    {message && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{message}</p>}
    {snapshot?.outline.status === 'failed' && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{snapshot.message || '클립 계획을 준비하지 못했어요.'}</p>}
    {phase === 'error' && <button type="button" className="mt-4 rounded-lg border px-4 py-2" onClick={() => setRefresh((value) => value + 1)}>기존 계획·상태 다시 조회</button>}
    <div className="mt-6 grid gap-3">{snapshot?.outline.clips.map((clip) => <article key={clip.id} className="rounded-xl border p-5">
      <div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><h2 className="font-semibold">{clip.order + 1}. 자료 {clip.sourcePages.length ? `${clip.sourcePages.join(", ")}쪽` : "페이지 미지정"} · 샘플 클립</h2><p className="mt-2 text-sm text-slate-500">근거 {clip.sourcePages.join(', ')}쪽 · {labels[clip.status]}</p></div><button type="button" className="shrink-0 rounded-lg border px-4 py-2 disabled:text-slate-400" disabled={clip.status !== 'completed'} onClick={() => setPlayingClip(clip.id)}>재생</button></div>
      <details className="mt-3 text-sm text-slate-500"><summary className="cursor-pointer">PDF 추출 원문 확인</summary><p className="mt-2">PDF 문자 추출 과정에서 한글이 깨지거나 문장이 잘릴 수 있어요. 번역·복구된 개념명이 아니에요.</p><p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]" lang="und">{clip.title}</p></details>
      {clip.message && <p className="mt-3 text-sm text-red-700">{clip.message}</p>}
    </article>)}</div>
    {phase === 'done' && snapshot?.outline.status === 'ready' && <p className="mt-5 text-sm text-slate-500">클립 {snapshot.outline.clips.length}개의 상태 확인을 마쳤어요. 실패한 클립의 재생성은 자동 요청하지 않아요.</p>}
    <p className="mt-6 text-xs text-slate-500">다시 조회는 결과 확인만 해요. 화면을 나가면 조회는 멈추고 이미 접수한 서버 작업은 계속될 수 있어요.</p>
  </main>
}
