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
  const [time, setTime] = useState(0)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    setError('')
    setTime(0)
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
      <p className="mt-2 text-sm text-slate-600">저장된 실제 결과와 음성을 확인하는 개발 화면이에요. 텍스트·수식·격자·코드를 시간에 맞춰 표시해요. 다이어그램·원본 그림과 부드러운 움직임은 아직 연결 전입니다.</p>
      <label className="mt-6 block font-semibold" htmlFor="actual-clip">비교할 클립</label>
      <select id="actual-clip" value={clipId} onChange={(event) => { setResult(null); setTime(0); setClipId(event.target.value) }} className="mt-2 w-full rounded-lg border bg-white p-3">
        <option value="clip-01">A · Sonnet / Cedar</option>
        <option value="clip-01-b">B · Terra / Cedar</option>
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
          {stageError ? <p role="alert" className="mt-5 text-red-700">{stageError}</p> : stage && <PlayerStage state={stage} />}
          <audio className="mt-5 w-full" src={result.audioUrl} controls preload="metadata" loop onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onSeeked={(event) => setTime(event.currentTarget.currentTime)} onError={() => setError('음성을 불러오지 못했어요. BE의 미디어 제공 상태를 확인해 주세요.')} />
        </section>
      )}
    </main>
  )
}
