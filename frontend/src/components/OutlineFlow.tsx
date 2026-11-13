import FileSummary from './FileSummary'
import ProcessingStatus from './ProcessingStatus'
import { clipsDone, jobStageLabel } from '../services/jobStages'
import { useEffect, useRef, useState } from 'react'
import ActualClipPreview from './ActualClipPreview'
import { watchOrCreateOutline } from '../services/outlines'
import type { LearningMode, OutlineSnapshot } from '../services/outlines'
import type { PreparedLecture } from '../services/preparation'
type Props = { lecture: PreparedLecture; mode: LearningMode; modeName: string; fileName?: string; onBack: () => void }
export default function OutlineFlow({ lecture, mode, modeName, fileName, onBack }: Props) {
  const [snapshot, setSnapshot] = useState<OutlineSnapshot | null>(null)
  const [phase, setPhase] = useState<'loading'|'idle'|'creating'|'watching'|'done'|'error'>('loading')
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [playingClip, setPlayingClip] = useState<string | null>(null)
  const automaticAttempted = useRef(false)
  useEffect(() => {
    if (playingClip) return
    const controller = new AbortController()
    setPhase('loading'); setMessage('')
    watchOrCreateOutline(lecture.id, mode, (data) => { setSnapshot(data); setPhase('watching') }, controller.signal, lecture.aiMode, () => {
      if (refresh > 0 || automaticAttempted.current || snapshot) return false
      automaticAttempted.current = true
      setPhase('creating')
      return true
    }).then((result) => {
      if (!controller.signal.aborted) setPhase(result ? 'done' : 'idle')
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) { setPhase('error'); setMessage(cause instanceof Error ? cause.message : '클립 준비 오류') }
    })
    return () => controller.abort()
  }, [lecture.id, mode, refresh, playingClip])
  if (playingClip) return <ActualClipPreview key={playingClip} initialClipId={playingClip} pages={lecture.pages} onBack={() => setPlayingClip(null)} />
  const labels = {pending:'대기 중',running:'생성 중',completed:'준비 완료',failed:'생성 실패'}
  const statusStyles = { pending: 'bg-slate-100 text-slate-600', running: 'bg-blue-50 text-blue-700', completed: 'bg-emerald-50 text-emerald-700', failed: 'bg-red-50 text-red-700' }
  return <main className="brand-page brand-outline mx-auto w-full max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
    <section aria-labelledby="clips-title" className="mx-auto w-full max-w-[820px]">
      <button type="button" className="mb-7 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={onBack}>← 학습 모드 선택</button>
      <div className="mb-4 inline-flex rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-blue-700">선택한 모드 · {modeName}</div>
      <h1 id="clips-title" className="text-[30px] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-[38px]">학습 클립 목록</h1>
      <p className="mt-3 text-[15px] leading-7 text-slate-500">준비된 클립부터 바로 재생하고 학습할 수 있어요.</p>
      {fileName && <div className="mt-7"><FileSummary file={{name:fileName}} /></div>}
      {phase === 'idle' && <p role="status" className="mt-7 text-sm text-slate-500">클립을 찾지 못했어요. 학습 모드를 다시 선택해 주세요.</p>}
      {(phase === 'loading' || phase === 'creating' || phase === 'watching') && <div className="mt-7">
        <ProcessingStatus progress={snapshot?.outline.status === 'ready' ? { completed: snapshot.outline.clips.filter(clip => clip.status === 'completed').length, total: snapshot.outline.clips.length, done: clipsDone(snapshot.outline.clips) } : undefined} stage={snapshot?.stage} message={phase === 'creating' ? '클립을 만드는 중' : phase === 'loading' ? '클립을 확인하는 중' : snapshot?.outline.status === 'ready' ? '클립별 준비 상태를 확인하는 중' : undefined} />
        <p className="mt-3 text-sm leading-6 text-slate-500">완료된 클립은 나머지 작업 중에도 바로 재생할 수 있어요.</p>
      </div>}
      {message && <div role="alert" className="mt-8 rounded-3xl border border-amber-200 bg-amber-50/60 p-6">
        <p className="text-xs font-semibold text-amber-700">요청·상태 확인 오류</p>
        <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-slate-900">기존 클립 계획과 상태를 확인해 주세요</h2>
        <p className="mt-2 break-words text-sm leading-6 text-slate-600">{message}</p>
      </div>}
      {snapshot?.outline.status === 'failed' && <div role="alert" className="mt-6 rounded-3xl border border-red-100 bg-red-50/60 p-6"><h2 className="font-bold text-red-700">클립 계획 준비 실패</h2><p className="mt-2 text-sm leading-6 text-slate-600">{snapshot.message || '클립 계획을 준비하지 못했어요.'}</p></div>}
      {phase === 'error' && <div className="mt-4">
        <button type="button" className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500" onClick={() => setRefresh((value) => value + 1)}>다시 확인하기</button>
      </div>}
      <div className="mt-5 grid gap-3">{snapshot?.outline.clips.map((clip) => <article data-brand-card="clip" key={clip.id} className={`rounded-2xl border bg-white p-4 transition sm:p-5 ${clip.status === 'completed' ? 'border-blue-200 shadow-[0_8px_24px_rgba(37,99,235,0.05)]' : 'border-slate-200'}`}>
        <div className="flex items-start gap-3.5 sm:gap-4">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${clip.status === 'completed' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{String(clip.order + 1).padStart(2,'0')}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h2 className="min-w-0 whitespace-pre-wrap break-words text-base font-bold leading-6 tracking-[-0.02em] text-slate-900 [overflow-wrap:anywhere] sm:text-[17px]">{clip.title}</h2>
              <span className={`inline-flex w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[clip.status]}`}>{clip.status === 'running' ? jobStageLabel(clip.stage) : labels[clip.status]}</span>
            </div>
            <p className="mt-2 text-xs font-medium text-slate-400">근거 {clip.sourcePages.join(', ')}쪽</p>
            {clip.message && <p className="mt-3 break-words text-sm leading-6 text-red-700">{clip.message}</p>}
            <button type="button" className="mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent" disabled={clip.status !== 'completed'} onClick={() => setPlayingClip(clip.id)}>{clip.status === 'completed' ? '눌러서 학습 시작 →' : '재생 준비 중'}</button>
          </div>
        </div>
      </article>)}</div>
    </section>
  </main>
}
