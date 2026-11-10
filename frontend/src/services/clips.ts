import type { Blueprint } from '../player/state'
export type Caption = {
  sceneId: string
  lineIndex: number
  text: string
  startSec: number
  endSec: number
}

export type ClipResult = {
  resultId: string
  durationSec: number
  audioUrl: string
  blueprint: Blueprint
  captions: Caption[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function loadClip(clipId: string, signal: AbortSignal): Promise<ClipResult> {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  const response = await fetch(new URL(`/clips/${encodeURIComponent(clipId)}`, base), { signal })
  if (!response.ok) throw new Error(`클립을 불러오지 못했어요 (${response.status})`)
  const payload: unknown = await response.json()
  if (!isRecord(payload) || payload.status !== 'completed' || !isRecord(payload.result)) {
    throw new Error('아직 재생 가능한 클립 결과가 없어요.')
  }
  const result = payload.result
  if (typeof result.resultId !== 'string' || typeof result.durationSec !== 'number' || !Number.isFinite(result.durationSec) || result.durationSec <= 0 || typeof result.audioUrl !== 'string' || !isRecord(result.blueprint) || typeof result.blueprint.title !== 'string' || result.blueprint.version !== 0 || result.blueprint.theme !== 'dark' || !Array.isArray(result.blueprint.scenes) || !Array.isArray(result.captions)) {
    throw new Error('클립 결과 형식을 확인해 주세요.')
  }
  let previousEnd = 0
  for (const caption of result.captions) {
    if (!isRecord(caption) || typeof caption.sceneId !== 'string' || !Number.isInteger(caption.lineIndex) || Number(caption.lineIndex) < 0 || typeof caption.text !== 'string' || typeof caption.startSec !== 'number' || typeof caption.endSec !== 'number' || !Number.isFinite(caption.startSec) || !Number.isFinite(caption.endSec) || caption.startSec < previousEnd || caption.endSec <= caption.startSec || caption.endSec > result.durationSec + 0.1) {
      throw new Error('자막 시간 형식을 확인해 주세요.')
    }
    previousEnd = caption.endSec
  }
  const audioUrl = new URL(result.audioUrl, base)
  if (!['http:', 'https:'].includes(audioUrl.protocol)) throw new Error('올바른 음성 주소가 아니에요.')
  // 설계도 세부 의미 검증은 서버의 공식 Python 검사기가 담당한다.
  return { ...result, audioUrl: audioUrl.href } as ClipResult
}
