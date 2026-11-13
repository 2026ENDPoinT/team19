import { useAudioClock } from '../player/useAudioClock'
import { samplePageUrl } from '../services/samplePages'
import PlayerStage from '../player/PlayerStage'
import { startAutoplay } from '../player/autoplay'
import { currentSourcePage } from '../player/currentSourcePage'
import { sourcePageNavigation } from '../player/sourcePageNavigation'
import { captureClipTransition } from '../player/clipTransition'
import { handlePlayerShortcut } from '../player/keyboardShortcuts'
import PlayerControls from '../player/PlayerControls'
import { calculatePlayerState } from '../player/state'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { attachFeedScroll } from '../player/feedScroll'
import '../player/feed.css'
import '../player/sourcePages.css'
import type { CSSProperties } from 'react'
import { loadClip } from '../services/clips'
import { evalClips, evalPageUrl, isEvalClip, loadEvalClip } from '../services/evalClips'
import type { ClipResult } from '../services/clips'

// clipIds: 업로드 클립 재생에서 위·아래로 넘길 완료된 클립 목록(순서대로, Q-AI-43). 없으면 학습 예시 목록을 쓴다.
type Props = { onBack: () => void; initialClipId?: string; pages?: Record<number, string>; clipIds?: string[] }

export default function ActualClipPreview({ onBack, initialClipId, pages, clipIds }: Props) {
  const [clipId, setClipId] = useState(initialClipId ?? evalClips[0]?.id ?? 'clip-01')
  const [captionsOn, setCaptionsOn] = useState(true)
  const [result, setResult] = useState<ClipResult | null>(null)
  const [error, setError] = useState('')
  const { audioRef, time, restart } = useAudioClock(result ? clipId + ':' + result.resultId : 'loading')
  const [retry, setRetry] = useState(0)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [manualSource, setManualSource] = useState<{ context: string; page: number } | null>(null)
  const [sourceRatios, setSourceRatios] = useState<Record<string, number>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackError, setPlaybackError] = useState('')
  const surfaceRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const alignAfterLoad = useRef(false)
  const [loadingHeight, setLoadingHeight] = useState<number>()

  const transitionRef = useRef<ReturnType<typeof captureClipTransition> | null>(null)
  const [transitionBusy, setTransitionBusy] = useState(false)
  useEffect(() => () => { const transition = transitionRef.current; transitionRef.current = null; transition?.cancel() }, [])

  function chooseClip(next: string, direction = 0) {
    if (transitionRef.current || next === clipId) return
    const player = surfaceRef.current?.querySelector<HTMLElement>('.player-viewport')
    if (direction && player && contentRef.current) {
      transitionRef.current = captureClipTransition(document.fullscreenElement === surfaceRef.current ? surfaceRef.current! : contentRef.current, player, direction)
      setTransitionBusy(true)
    }
    setLoadingHeight(contentRef.current?.getBoundingClientRect().height)
    alignAfterLoad.current = true
    audioRef.current?.pause()
    // 전체화면 중에는 이전 화면을 유지해야 플레이어가 다시 그려지며 전체화면이 풀리지 않는다.
    if (!document.fullscreenElement) setResult(null)
    setClipId(next)
  }

  useEffect(() => attachFeedScroll(() => surfaceRef.current?.querySelector<HTMLElement>('.player-viewport') ?? null), [])
  useLayoutEffect(() => {
    if (!result || !alignAfterLoad.current) return
    const frame = requestAnimationFrame(() => {
      const player = surfaceRef.current?.querySelector('.player-viewport')
      if (player && !transitionRef.current) window.scrollBy({ top: player.getBoundingClientRect().top - 12, behavior: 'instant' })
      alignAfterLoad.current = false
      const transition = transitionRef.current
      if (transition && player instanceof HTMLElement) {
        void transition.play(player).finally(() => {
          if (transitionRef.current === transition) { transitionRef.current = null; setTransitionBusy(false); setLoadingHeight(undefined) }
        })
      } else if (transition) {
        transition.cancel(); transitionRef.current = null; setTransitionBusy(false); setLoadingHeight(undefined)
      } else {
        setLoadingHeight(undefined)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [result])
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === surfaceRef.current && document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (surfaceRef.current?.requestFullscreen) await surfaceRef.current.requestFullscreen()
      else throw new Error('unsupported')
    } catch {
      setPlaybackError('이 브라우저에서 전체화면을 열지 못했어요.')
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    if (!document.fullscreenElement) setResult(null)
    setError('')
    setIsPlaying(false)
    setPlaybackError('')
    const loading = isEvalClip(clipId) && !initialClipId ? loadEvalClip(clipId, controller.signal) : loadClip(clipId, controller.signal)
    loading
      .then((data) => { if (!controller.signal.aborted) setResult(data) })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          transitionRef.current?.cancel(); transitionRef.current = null; setTransitionBusy(false); setLoadingHeight(undefined)
          setError(cause instanceof Error ? cause.message : '클립 연결 오류')
        }
      })
    return () => controller.abort()
  }, [clipId, retry, initialClipId])

  useEffect(() => {
    const audio = audioRef.current
    if (!result || error || !audio) return
    return startAutoplay(audio, () => {
      setPlaybackError('자동재생을 시작하지 못했어요. 재생 버튼이나 스페이스바를 눌러 시작해 주세요.')
    })
  }, [result, error])

  // 숏폼처럼 옆 버튼으로 비교할 클립 목록의 이전·다음 클립으로 넘긴다(업로드 클립 화면은 제외).
  const feedEnabled = !initialClipId || Boolean(clipIds)
  const order = clipIds ?? ['clip-01', 'clip-01-b', 'parts-test', ...evalClips.map((clip) => clip.id)]
  const position = order.indexOf(clipId)
  // 끝에서 더 넘기면 반대쪽 끝으로 돌아간다(마지막 → 처음, 처음 → 마지막). 넘김 방향 효과는 누른 방향 그대로.
  function moveClip(step: number) {
    if (position < 0 || order.length < 2) return
    const next = order[(position + step + order.length) % order.length]
    chooseClip(next, step)
  }

  async function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) { audio.pause(); return }
    try {
      await audio.play()
      setPlaybackError('')
    } catch {
      setPlaybackError('재생을 시작하지 못했어요. 아래 재생 버튼으로 다시 시도해 주세요.')
    }
  }

  useEffect(() => {
    if (!result || error) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const editing = Boolean(target?.closest('input:not([type="range"]), textarea, [role="textbox"], [contenteditable]:not([contenteditable="false"])'))
      handlePlayerShortcut(event, audioRef.current, result.durationSec, () => { void togglePlayback() }, editing)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [result, error])

  // 전체화면은 플레이어 칸만 키우므로 그때만 버튼을 플레이어 안으로 옮긴다.
  // 원본 페이지 보기: 학습 예시 화면에서는 위·아래 클립 버튼 아래(맨 아래)에 둥근 버튼으로 둔다.
  const sourceToggle = !feedEnabled
    ? <button type="button" className="source-page-toggle mt-2 rounded-lg border px-4 py-2" aria-expanded={sourceOpen} aria-controls="source-page-panel" onClick={() => setSourceOpen((open) => !open)}>{sourceOpen ? '원본 페이지 닫기' : '원본 페이지 보기'}</button>
    : <button type="button" className="source-page-toggle clip-feed-source" aria-label={sourceOpen ? '원본 페이지 닫기' : '원본 페이지 보기'} title={sourceOpen ? '원본 페이지 닫기' : '원본 페이지 보기'} aria-expanded={sourceOpen} aria-controls="source-page-panel" onClick={() => setSourceOpen((open) => !open)}><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg></button>
  const feedNav = !feedEnabled ? null : <div className="clip-feed-nav">
            <button type="button" aria-label="이전 클립" disabled={transitionBusy || position < 0 || order.length < 2} onClick={() => moveClip(-1)}><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg></button>
            <button type="button" aria-label="다음 클립" disabled={transitionBusy || position < 0 || order.length < 2} onClick={() => moveClip(1)}><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>
            {!isFullscreen && result && sourceToggle}
          </div>

  let stage = null
  let stageError = ''
  if (result) {
    try { stage = calculatePlayerState(result.blueprint, result.captions, time) }
    catch (cause) { stageError = cause instanceof Error ? cause.message : '장면 계산 오류' }
  }

  function pageUrl(page: number) {
    if (initialClipId) return pages?.[page]
    return isEvalClip(clipId) ? evalPageUrl(clipId, page) : samplePageUrl(clipId, page)
  }

  const source = currentSourcePage(stage)
  const sourceContext = `${clipId}:${stage?.sceneId}:${source?.page}`
  const manualPage = manualSource?.context === sourceContext ? manualSource.page : undefined
  const sourceNavigation = sourcePageNavigation(stage?.sourcePages ?? [], source?.page, manualPage)
  const sourceRatio = sourceNavigation.page ? sourceRatios[pageUrl(sourceNavigation.page) ?? ''] ?? 1.414 : 1.414
  return (
    <main className={`brand-page brand-player clip-preview-page mx-auto w-full px-5 py-3 ${sourceOpen ? 'max-w-[1600px]' : 'max-w-4xl'}`} style={{ '--source-page-ratio': sourceRatio } as CSSProperties}>
      <button type="button" className="rounded-lg border px-4 py-2" onClick={onBack}>← {initialClipId ? '클립 목록' : '업로드 화면'}</button>
      <h1 className="mt-3 text-xl font-bold">학습 영상</h1>
      {!initialClipId && <>
      <label className="mt-3 block font-semibold" htmlFor="actual-clip">학습 클립</label>
      <select id="actual-clip" disabled={transitionBusy} value={clipId} onChange={(event) => chooseClip(event.target.value)} className="mt-2 w-full rounded-lg border bg-white p-2">
        <option value="clip-01">A · Sonnet / Cedar</option>
        <option value="clip-01-b">B · Terra / Cedar</option>
        <option value="parts-test">시각화 예시</option>
        {evalClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.label}</option>)}
      </select>
      </>}
      <div ref={contentRef} className="clip-transition-container" aria-busy={transitionBusy} style={{ minHeight: loadingHeight }}>
      {error ? (
        // 불러오기에 실패해도 위·아래 버튼은 남겨 다음 클립으로 넘어갈 수 있게 한다.
        <div className="actual-clip-layout mt-6">
        {feedNav}
        <div className="flex-1 rounded-xl bg-red-50 p-4" role="alert">
          <p>{error}</p><p className="mt-2 text-sm">{feedNav ? '위·아래 버튼으로 다른 클립으로 넘어가거나 다시 불러와 주세요.' : '다른 클립을 선택하거나 다시 불러와 주세요.'}</p>
          <button className="mt-3 rounded-lg border px-4 py-2" type="button" onClick={() => setRetry((value) => value + 1)}>다시 불러오기</button>
        </div>
        </div>
      ) : !result ? <p role="status" className="mt-6">실제 클립을 불러오고 있어요…</p> : (
        <section className="mt-3">
          <h2 className="text-xl font-bold">{result.blueprint.title}</h2>
          <p className="mt-2 break-all text-xs text-slate-500">{Math.ceil(result.durationSec)}초</p>
          {!feedEnabled && sourceToggle}
          <div className={`actual-clip-layout${sourceOpen ? ' actual-clip-layout--with-source' : ''}`}>
          {!isFullscreen && feedNav}
          <div className={`actual-player${transitionBusy ? ' clip-transition-active' : ''}`} ref={surfaceRef}>
          <audio src={result.audioUrl} hidden preload="metadata" loop ref={audioRef}
            onPlay={() => { setIsPlaying(true); setPlaybackError('') }} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)}
            onError={() => setError('음성을 불러오지 못했어요. BE의 미디어 제공 상태를 확인해 주세요.')} />
          {stageError ? <p role="alert" className="mt-5 text-red-700">{stageError}</p> : stage && <PlayerStage state={stage} pageUrl={pageUrl} isPlaying={isPlaying} onTogglePlayback={togglePlayback} captionsOn={captionsOn}
            controls={<PlayerControls captionsOn={captionsOn} onToggleCaptions={() => setCaptionsOn((on) => !on)} audioRef={audioRef} time={time} duration={result.durationSec} isPlaying={isPlaying} isFullscreen={isFullscreen} onTogglePlayback={togglePlayback} onRestart={restart} onFullscreen={toggleFullscreen} />} />}
          {playbackError && <p role="alert" className="mt-2 text-sm text-red-700">{playbackError}</p>}
          {isFullscreen && feedNav}
          </div>
          {sourceOpen && (
            <aside id="source-page-panel" className="source-page-panel" aria-label="현재 표시 중인 원본 페이지">
              <h3 className="font-semibold">{manualPage !== undefined ? '선택한 원본' : source?.representative ? '장면 대표 원본' : '현재 표시 중인 원본'}</h3>
              {source?.representative && manualPage === undefined && <p className="mt-2 text-sm text-slate-500">설명 중인 쪽이 지정되지 않아 이 장면의 첫 참고 페이지를 표시해요.</p>}
              {stageError ? <p className="mt-3 text-sm">장면을 확인할 수 없어 원본을 표시하지 못했어요.</p>
                : !source ? <p className="mt-3 text-sm">이 장면에는 연결된 원본 페이지가 없어요.</p>
                 : <>
                  <div className={`source-page-carousel${sourceNavigation.count > 1 ? ' source-page-carousel--multiple' : ''}`}>
                    {sourceNavigation.count > 1 && <button type="button" aria-label="이전 원본 페이지" disabled={sourceNavigation.previous === undefined} onClick={() => { if (sourceNavigation.previous !== undefined) setManualSource({context:sourceContext,page:sourceNavigation.previous}) }}>‹</button>}
                    <SourcePage key={`${clipId}-${sourceNavigation.page}`} page={sourceNavigation.page} imageUrl={pageUrl(sourceNavigation.page)} onAspect={(url, ratio) => setSourceRatios(previous => previous[url] === ratio ? previous : { ...previous, [url]: ratio })} />
                    {sourceNavigation.count > 1 && <button type="button" aria-label="다음 원본 페이지" disabled={sourceNavigation.next === undefined} onClick={() => { if (sourceNavigation.next !== undefined) setManualSource({context:sourceContext,page:sourceNavigation.next}) }}>›</button>}
                  </div>
                  {sourceNavigation.count > 1 && <p className="source-page-counter" aria-live="polite">{sourceNavigation.index + 1} / {sourceNavigation.count}</p>}
                </>}
            </aside>
          )}
          </div>

        </section>
      )}
      </div>
    </main>
  )
}


function SourcePage({ page, imageUrl, onAspect }: { page: number; imageUrl?: string; onAspect: (url: string, ratio: number) => void }) {
  const [failed, setFailed] = useState(false)
  return (
    <figure className="source-page-figure mt-4">
      <figcaption className="mb-2 text-sm text-slate-600">원본 {page}쪽</figcaption>
      {!imageUrl || failed
        ? <p className="rounded-lg bg-slate-100 p-3 text-sm">이 페이지의 그림을 불러올 수 없어요.</p>
        : <img src={imageUrl} alt={`현재 장면의 근거 자료 ${page}쪽 전체`} className="source-page-image rounded-lg border" onLoad={(event) => { const image = event.currentTarget; if (image.naturalHeight) onAspect(imageUrl, image.naturalWidth / image.naturalHeight) }} onError={() => setFailed(true)} />}
    </figure>
  )
}
