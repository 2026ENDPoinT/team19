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

  const caption = result?.captions.find((line) => time >= line.startSec && time < line.endSec)

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <button type="button" className="rounded-lg border px-4 py-2" onClick={onBack}>← 업로드 화면</button>
      <h1 className="mt-6 text-2xl font-bold">실제 클립 연결 확인</h1>
      <p className="mt-2 text-sm text-slate-600">저장된 실제 결과와 음성을 확인하는 개발 화면이에요. 시각화 동작은 아직 연결 전입니다.</p>
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
          <div className="mx-auto mt-5 flex aspect-[9/16] w-full max-w-xs flex-col justify-between rounded-2xl bg-slate-950 p-6 text-white">
            <p>학습 시각화 연결 예정</p>
            <p className="text-sm text-slate-300">장면: {caption?.sceneId ?? '대기'}</p>
            <p aria-label="현재 자막" className="rounded-lg bg-white/10 p-3 leading-relaxed">{caption?.text ?? '재생 버튼을 누르면 음성과 자막을 확인할 수 있어요.'}</p>
          </div>
          <audio className="mt-5 w-full" src={result.audioUrl} controls preload="metadata" loop onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onSeeked={(event) => setTime(event.currentTarget.currentTime)} onError={() => setError('음성을 불러오지 못했어요. BE의 미디어 제공 상태를 확인해 주세요.')} />
        </section>
      )}
    </main>
  )
}
