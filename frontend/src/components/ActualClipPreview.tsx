import { useAudioClock } from '../player/useAudioClock'
import { samplePageUrl } from '../services/samplePages'
import PlayerStage from '../player/PlayerStage'
import { calculatePlayerState } from '../player/state'
import { useEffect, useState } from 'react'
import { loadClip } from '../services/clips'
import type { ClipResult } from '../services/clips'

type Props = { onBack: () => void }

export default function ActualClipPreview({ onBack }: Props) {
  const [clipId, setClipId] = useState('clip-01')
  const [result, setResult] = useState<ClipResult | null>(null)
  const [error, setError] = useState('')
  const { audioRef, time, restart } = useAudioClock(result ? clipId + ':' + result.resultId : 'loading')
  const [retry, setRetry] = useState(0)
  const [sourceOpen, setSourceOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError('')
    loadClip(clipId, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setResult(data) })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '클립 연결 오류')
      })
    return () => controller.abort()
  }, [clipId, retry])

  let stage = null
  let stageError = ''
  if (result) {
    try { stage = calculatePlayerState(result.blueprint, result.captions, time) }
    catch (cause) { stageError = cause instanceof Error ? cause.message : '장면 계산 오류' }
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <button type="button" className="rounded-lg border px-4 py-2" onClick={onBack}>← 업로드 화면</button>
      <h1 className="mt-6 text-2xl font-bold">실제 클립 연결 확인</h1>
      <p className="mt-2 text-sm text-slate-600">저장된 실제 결과와 음성을 확인하는 개발 화면이에요. 텍스트·수식·격자·코드를 시간에 맞춰 표시해요. 가로 다이어그램·재귀 트리도 표시해요. 원본 그림의 확대·강조도 표시해요. 부드러운 움직임은 아직 연결 전입니다.</p>
      <p className="mt-2 text-xs text-slate-500">원본 그림은 저장소의 정식 samples 파일에 임시 연결했습니다. parts-test는 실제 설명 음성 대신 신호음을 사용합니다.</p>
      <label className="mt-6 block font-semibold" htmlFor="actual-clip">비교할 클립</label>
      <select id="actual-clip" value={clipId} onChange={(event) => { setResult(null); setClipId(event.target.value) }} className="mt-2 w-full rounded-lg border bg-white p-3">
        <option value="clip-01">A · Sonnet / Cedar</option>
        <option value="clip-01-b">B · Terra / Cedar</option>
        <option value="parts-test">부품 검사 · 신호음 샘플 (실제 TTS 아님)</option>
      </select>
      {error ? (
        <div className="mt-6 rounded-xl bg-red-50 p-4" role="alert">
          <p>{error}</p><p className="mt-2 text-sm">BE 서버가 실행 중인지 확인해 주세요. 새 생성 요청은 보내지 않습니다.</p>
          <button className="mt-3 rounded-lg border px-4 py-2" type="button" onClick={() => setRetry((value) => value + 1)}>다시 불러오기</button>
        </div>
      ) : !result ? <p role="status" className="mt-6">실제 클립을 불러오고 있어요…</p> : (
        <section className="mt-6" key={`${clipId}-${result.resultId}`}>
          <h2 className="text-xl font-bold">{result.blueprint.title}</h2>
          <p className="mt-2 break-all text-xs text-slate-500">{result.resultId} · {result.durationSec.toFixed(1)}초</p>
          <button type="button" className="source-page-toggle mt-4 rounded-lg border px-4 py-2" aria-expanded={sourceOpen} aria-controls="source-page-panel" onClick={() => setSourceOpen((open) => !open)}>
            {sourceOpen ? '원본 페이지 닫기' : '원본 페이지 보기'}
          </button>
          <div className={`actual-clip-layout${sourceOpen ? ' actual-clip-layout--with-source' : ''}`}>
          <div>
          {stageError ? <p role="alert" className="mt-5 text-red-700">{stageError}</p> : stage && <PlayerStage state={stage} pageUrl={(page) => samplePageUrl(clipId, page)} />}
          </div>
          {sourceOpen && (
            <aside id="source-page-panel" className="source-page-panel" aria-label="현재 장면의 원본 페이지">
              <h3 className="font-semibold">현재 장면의 원본</h3>
              {stageError ? <p className="mt-3 text-sm">장면을 확인할 수 없어 원본을 표시하지 못했어요.</p>
                : !stage?.sourcePages.length ? <p className="mt-3 text-sm">이 장면에는 연결된 원본 페이지가 없어요.</p>
                : stage.sourcePages.map((page) => <SourcePage key={`${clipId}-${page}`} clipId={clipId} page={page} />)}
            </aside>
          )}
          </div>
          <button type="button" className="mt-4 rounded-lg border px-4 py-2" onClick={restart}>처음부터</button>
          <audio className="mt-5 w-full" src={result.audioUrl} controls preload="metadata" loop ref={audioRef} onError={() => setError('음성을 불러오지 못했어요. BE의 미디어 제공 상태를 확인해 주세요.')} />
        </section>
      )}
    </main>
  )
}


function SourcePage({ clipId, page }: { clipId: string; page: number }) {
  const [failed, setFailed] = useState(false)
  const imageUrl = samplePageUrl(clipId, page)
  return (
    <figure className="mt-4">
      <figcaption className="mb-2 text-sm text-slate-600">원본 {page}쪽</figcaption>
      {!imageUrl || failed
        ? <p className="rounded-lg bg-slate-100 p-3 text-sm">이 페이지의 그림을 불러올 수 없어요.</p>
        : <img src={imageUrl} alt={`현재 장면의 근거 자료 ${page}쪽 전체`} className="w-full rounded-lg border" onError={() => setFailed(true)} />}
    </figure>
  )
}
