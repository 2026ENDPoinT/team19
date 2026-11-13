import { useAudioClock } from '../player/useAudioClock'
import { samplePageUrl } from '../services/samplePages'
import PlayerStage from '../player/PlayerStage'
import { handlePlayerShortcut } from '../player/keyboardShortcuts'
import PlayerControls from '../player/PlayerControls'
import { calculatePlayerState } from '../player/state'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { attachFeedScroll } from '../player/feedScroll'
import '../player/feed.css'
import { loadClip } from '../services/clips'
import { evalClips, evalPageUrl, isEvalClip, loadEvalClip } from '../services/evalClips'
import type { ClipResult } from '../services/clips'

type Props = { onBack: () => void; initialClipId?: string; pages?: Record<number, string> }

export default function ActualClipPreview({ onBack, initialClipId, pages }: Props) {
  const [clipId, setClipId] = useState(initialClipId ?? 'clip-01')
  const [captionsOn, setCaptionsOn] = useState(false)
  const [result, setResult] = useState<ClipResult | null>(null)
  const [error, setError] = useState('')
  const { audioRef, time, restart } = useAudioClock(result ? clipId + ':' + result.resultId : 'loading')
  const [retry, setRetry] = useState(0)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackError, setPlaybackError] = useState('')
  const surfaceRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const alignAfterLoad = useRef(false)
  const [loadingHeight, setLoadingHeight] = useState<number>()

  function chooseClip(next: string) {
    setLoadingHeight(contentRef.current?.getBoundingClientRect().height)
    alignAfterLoad.current = true
    setResult(null)
    setClipId(next)
  }

  useEffect(() => attachFeedScroll(() => surfaceRef.current?.querySelector<HTMLElement>('.player-viewport') ?? null), [])
  useLayoutEffect(() => {
    if (!result || !alignAfterLoad.current) return
    setLoadingHeight(undefined)
    const frame = requestAnimationFrame(() => {
      const player = surfaceRef.current?.querySelector('.player-viewport')
      if (player) window.scrollBy({ top: player.getBoundingClientRect().top - 12, behavior: 'instant' })
      alignAfterLoad.current = false
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
    setResult(null)
    setError('')
    setIsPlaying(false)
    setPlaybackError('')
    const loading = isEvalClip(clipId) && !initialClipId ? loadEvalClip(clipId, controller.signal) : loadClip(clipId, controller.signal)
    loading
      .then((data) => { if (!controller.signal.aborted) setResult(data) })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '클립 연결 오류')
      })
    return () => controller.abort()
  }, [clipId, retry, initialClipId])

  // 숏폼처럼 옆 버튼으로 비교할 클립 목록의 이전·다음 클립으로 넘긴다(업로드 클립 화면은 제외).
  const order = ['clip-01', 'clip-01-b', 'parts-test', ...evalClips.map((clip) => clip.id)]
  const position = order.indexOf(clipId)
  function moveClip(step: number) {
    const next = order[position + step]
    if (next) chooseClip(next)
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

  return (
    <main className="mx-auto max-w-4xl px-5 py-3">
      <button type="button" className="rounded-lg border px-4 py-2" onClick={onBack}>← {initialClipId ? '클립 목록' : '업로드 화면'}</button>
      <h1 className="mt-3 text-xl font-bold">{initialClipId ? '업로드 자료의 샘플 클립' : '실제 클립 연결 확인'}</h1>
      {initialClipId ? <p className="mt-3 text-sm text-slate-500">샘플 모드의 PDF 발췌·무음 음성 결과예요. 실제 AI 요약·TTS 생성 결과가 아니에요.</p> : <>
      <details className="mt-2 text-sm text-slate-600">
        <summary className="cursor-pointer">샘플 안내</summary>
      <p className="mt-2 text-sm text-slate-600">저장된 실제 결과와 음성을 확인하는 개발 화면이에요. 텍스트·수식·격자·코드를 시간에 맞춰 표시해요. 가로 다이어그램·재귀 트리도 표시해요. 원본 그림의 확대·강조도 표시해요. 원본 확대·배열 교환·포인터는 음성 시간에 맞춰 이동해요. 나머지 동작은 즉시 적용됩니다.</p>
      <p className="mt-2 text-xs text-slate-500">A/B·부품 검사 원본은 BE API에서, 다른 과목 평가 원본은 정식 저장 파일에서 불러옵니다. parts-test는 실제 설명 음성 대신 신호음을 사용합니다.</p>
      </details>
      <label className="mt-3 block font-semibold" htmlFor="actual-clip">비교할 클립</label>
      <select id="actual-clip" value={clipId} onChange={(event) => chooseClip(event.target.value)} className="mt-2 w-full rounded-lg border bg-white p-2">
        <option value="clip-01">A · Sonnet / Cedar</option>
        <option value="clip-01-b">B · Terra / Cedar</option>
        <option value="parts-test">부품 검사 · 신호음 샘플 (실제 TTS 아님)</option>
        {evalClips.map((clip) => <option key={clip.id} value={clip.id}>평가 · {clip.label}</option>)}
      </select>
      </>}
      <div ref={contentRef} style={{ minHeight: loadingHeight }}>
      {error ? (
        <div className="mt-6 rounded-xl bg-red-50 p-4" role="alert">
          <p>{error}</p><p className="mt-2 text-sm">다른 클립을 선택하거나 서버 상태를 확인해 주세요. 다시 불러오기는 결과 조회만 하며, 새 생성이나 생성 재시도를 요청하지 않습니다.</p>
          <button className="mt-3 rounded-lg border px-4 py-2" type="button" onClick={() => setRetry((value) => value + 1)}>다시 불러오기</button>
        </div>
      ) : !result ? <p role="status" className="mt-6">실제 클립을 불러오고 있어요…</p> : (
        <section className="mt-3" key={`${clipId}-${result.resultId}`}>
          <h2 className="text-xl font-bold">{result.blueprint.title}</h2>
          <p className="mt-2 break-all text-xs text-slate-500">{result.resultId} · {result.durationSec.toFixed(1)}초</p>
          <button type="button" className="source-page-toggle mt-2 rounded-lg border px-4 py-2" aria-expanded={sourceOpen} aria-controls="source-page-panel" onClick={() => setSourceOpen((open) => !open)}>
            {sourceOpen ? '원본 페이지 닫기' : '원본 페이지 보기'}
          </button>
          <div className={`actual-clip-layout${sourceOpen ? ' actual-clip-layout--with-source' : ''}`}>
          <div className="actual-player" ref={surfaceRef}>
          <audio src={result.audioUrl} hidden preload="metadata" loop ref={audioRef}
            onPlay={() => { setIsPlaying(true); setPlaybackError('') }} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)}
            onError={() => setError('음성을 불러오지 못했어요. BE의 미디어 제공 상태를 확인해 주세요.')} />
          {stageError ? <p role="alert" className="mt-5 text-red-700">{stageError}</p> : stage && <PlayerStage state={stage} pageUrl={pageUrl} isPlaying={isPlaying} onTogglePlayback={togglePlayback} captionsOn={captionsOn}
            controls={<PlayerControls captionsOn={captionsOn} onToggleCaptions={() => setCaptionsOn((on) => !on)} audioRef={audioRef} time={time} duration={result.durationSec} isPlaying={isPlaying} isFullscreen={isFullscreen} onTogglePlayback={togglePlayback} onRestart={restart} onFullscreen={toggleFullscreen} />} />}
          {playbackError && <p role="alert" className="mt-2 text-sm text-red-700">{playbackError}</p>}
          {!initialClipId && <div className="clip-feed-nav">
            <button type="button" aria-label="이전 클립" disabled={position <= 0} onClick={() => moveClip(-1)}><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg></button>
            <button type="button" aria-label="다음 클립" disabled={position < 0 || position >= order.length - 1} onClick={() => moveClip(1)}><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>
          </div>}
          </div>
          {sourceOpen && (
            <aside id="source-page-panel" className="source-page-panel" aria-label="현재 장면의 원본 페이지">
              <h3 className="font-semibold">현재 장면의 원본</h3>
              {stageError ? <p className="mt-3 text-sm">장면을 확인할 수 없어 원본을 표시하지 못했어요.</p>
                : !stage?.sourcePages.length ? <p className="mt-3 text-sm">이 장면에는 연결된 원본 페이지가 없어요.</p>
                : stage.sourcePages.map((page) => <SourcePage key={`${clipId}-${page}`} page={page} imageUrl={pageUrl(page)} />)}
            </aside>
          )}
          </div>

        </section>
      )}
      </div>
    </main>
  )
}


function SourcePage({ page, imageUrl }: { page: number; imageUrl?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <figure className="mt-4">
      <figcaption className="mb-2 text-sm text-slate-600">원본 {page}쪽</figcaption>
      {!imageUrl || failed
        ? <p className="rounded-lg bg-slate-100 p-3 text-sm">이 페이지의 그림을 불러올 수 없어요.</p>
        : <img src={imageUrl} alt={`현재 장면의 근거 자료 ${page}쪽 전체`} className="w-full rounded-lg border" onError={() => setFailed(true)} />}
    </figure>
  )
}
