import FileSummary from './FileSummary'
import ProcessingStatus from './ProcessingStatus'
import { jobStageLabel } from '../services/jobStages'
import { useEffect, useRef, useState } from 'react'
import ActualClipPreview from './ActualClipPreview'
import { createOutline, watchOutline } from '../services/outlines'
import type { LearningMode, OutlineSnapshot } from '../services/outlines'
import { RealGenerationConfirmationRequired } from '../services/preparation'
import type { PreparedLecture } from '../services/preparation'
type Props = { lecture: PreparedLecture; mode: LearningMode; modeName: string; fileName?: string; onBack: () => void }
export default function OutlineFlow({ lecture, mode, modeName, fileName, onBack }: Props) {
  const [snapshot, setSnapshot] = useState<OutlineSnapshot | null>(null)
  const [phase, setPhase] = useState<'loading'|'idle'|'confirm-generation'|'creating'|'watching'|'done'|'error'>('loading')
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
  async function start(allowReal = false) {
    if (posting.current) return
    polling.current?.abort()
    const controller = new AbortController()
    posting.current = controller
    setPhase('creating'); setMessage('')
    try {
      await createOutline(lecture.id, mode, controller.signal, { allowReal, expectedMode:lecture.aiMode })
      if (!controller.signal.aborted) setRefresh((value) => value + 1)
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof RealGenerationConfirmationRequired) setPhase('confirm-generation')
        else { setPhase('error'); setMessage(cause instanceof Error ? cause.message : '클립 준비 요청 오류') }
      }
    } finally { if (posting.current === controller) posting.current = null }
  }
  if (playingClip) return <ActualClipPreview key={playingClip} initialClipId={playingClip} pages={lecture.pages} onBack={() => setPlayingClip(null)} />
  const labels = {pending:'대기 중',running:'생성 중',completed:'준비 완료',failed:'생성 실패'}
  const statusStyles = { pending: 'bg-slate-100 text-slate-600', running: 'bg-blue-50 text-blue-700', completed: 'bg-emerald-50 text-emerald-700', failed: 'bg-red-50 text-red-700' }
  return <main className="mx-auto w-full max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
    <section aria-labelledby="clips-title" className="mx-auto w-full max-w-[820px]">
      <button type="button" className="mb-7 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={onBack}>← 학습 모드 선택</button>
      <div className="mb-4 inline-flex rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-blue-700">선택한 모드 · {modeName}</div>
      <h1 id="clips-title" className="text-[30px] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-[38px]">학습 클립 목록</h1>
      <p className="mt-3 text-[15px] leading-7 text-slate-500">준비된 클립부터 바로 재생하고 학습할 수 있어요.</p>
      {fileName && <div className="mt-7"><FileSummary file={{name:fileName}} /></div>}
      {phase === 'idle' && <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50/70 p-6 sm:p-8">
        <div aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-bold text-blue-600 shadow-sm">≡</div>
        <h2 className="mt-5 text-xl font-bold tracking-[-0.03em] text-slate-900">이 모드의 클립 계획이 아직 없어요</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">선택한 모드로 강의자료의 클립 준비를 요청할 수 있어요.</p>
        <button type="button" className="mt-6 h-12 w-full rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto" onClick={() => void start()}>이 모드로 클립 준비 요청 →</button>
      </div>}
      {phase === 'confirm-generation' && <section aria-label="실제 AI 클립 생성 비용 확인" className="mt-6 rounded-3xl border border-amber-200 bg-amber-50/60 p-5 sm:p-6">
        <h2 className="font-bold text-slate-900">실제 AI 클립 생성 · 비용 발생 가능</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">이 모드의 분할 계획과 클립들의 시각화·음성을 생성해요. 여러 클립이 자동으로 준비될 수 있으며 AI API 비용이 발생할 수 있어요. 아직 생성 요청은 보내지 않았어요.</p>
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={() => void start(true)}>비용 안내 확인 · 클립 생성 시작</button><button type="button" className="rounded-xl border border-slate-300 px-4 py-3 text-sm" onClick={() => setPhase('idle')}>돌아가기</button></div>
      </section>}
      {(phase === 'loading' || phase === 'creating' || phase === 'watching') && <div className="mt-7">
        <ProcessingStatus stage={snapshot?.stage} message={phase === 'creating' ? '클립 준비를 요청하는 중' : phase === 'loading' ? '기존 클립 상태를 조회하는 중' : snapshot?.outline.status === 'ready' ? '클립별 준비 상태를 확인하는 중' : undefined} />
        <p className="mt-3 text-sm leading-6 text-slate-500">완료된 클립은 나머지 작업 중에도 바로 재생할 수 있어요.</p>
      </div>}
      {message && <div role="alert" className="mt-8 rounded-3xl border border-amber-200 bg-amber-50/60 p-6">
        <p className="text-xs font-semibold text-amber-700">요청·상태 확인 오류</p>
        <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-slate-900">기존 클립 계획과 상태를 확인해 주세요</h2>
        <p className="mt-2 break-words text-sm leading-6 text-slate-600">{message}</p>
      </div>}
      {snapshot?.outline.status === 'failed' && <div role="alert" className="mt-6 rounded-3xl border border-red-100 bg-red-50/60 p-6"><h2 className="font-bold text-red-700">클립 계획 준비 실패</h2><p className="mt-2 text-sm leading-6 text-slate-600">{snapshot.message || '클립 계획을 준비하지 못했어요.'}</p></div>}
      {phase === 'error' && <div className="mt-4">
        <button type="button" className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500" onClick={() => setRefresh((value) => value + 1)}>기존 계획·상태 다시 조회</button>
        <p className="mt-3 text-xs leading-5 text-slate-500">다시 조회는 새 생성 요청이 아니라 기존 작업의 상태만 확인해요.</p>
      </div>}
      <div className="mt-5 grid gap-3">{snapshot?.outline.clips.map((clip) => <article key={clip.id} className={`rounded-2xl border bg-white p-4 transition sm:p-5 ${clip.status === 'completed' ? 'border-blue-200 shadow-[0_8px_24px_rgba(37,99,235,0.05)]' : 'border-slate-200'}`}>
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
      {phase === 'done' && snapshot?.outline.status === 'ready' && <p className="mt-5 text-sm leading-6 text-slate-500">클립 {snapshot.outline.clips.length}개의 상태 확인을 마쳤어요. 실패한 클립의 재생성은 자동 요청하지 않아요.</p>}
      <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500"><strong className="text-slate-600">{lecture.aiMode === 'real' ? '실제 AI 모드' : '샘플 모드'}</strong> · {lecture.aiMode === 'real' ? 'AI가 생성한 설명과 음성을 제공해요. 학습 내용은 원본 자료와 함께 확인해 주세요.' : 'PDF 발췌·대체 페이지 이미지·무음 음성을 사용하는 개발용 결과예요.'}</div>
      <p className="mt-5 text-center text-xs leading-5 text-slate-400">화면을 나가면 조회는 멈추고 이미 접수한 서버 작업은 계속될 수 있어요.</p>
    </section>
  </main>
}
