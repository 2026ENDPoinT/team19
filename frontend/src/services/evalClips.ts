import { loadStoredClip } from './clips'

export const evalClips = [
  { id: 'algo-dc-review-c7', label: '알고리즘 · 피봇 분할' },
  { id: 'se-arch-review-c2', label: '소프트웨어공학 · MVC' },
  { id: 'nlp-transformer-review-c3', label: '트랜스포머 · 셀프 어텐션' },
  { id: 'rl-mdp-review-c4', label: '강화학습 · 벨만 방정식' },
  { id: 'py-basic-review-c2', label: '파이썬 · 팩토리얼' },
]
const assets = import.meta.glob<string>([
  '../../../samples/eval/*/result-terra.json',
  '../../../samples/eval/*/audio-terra/audio.mp3',
  '../../../samples/eval/*/pages/*.png',
], { eager: true, query: '?url', import: 'default' })
export function isEvalClip(id: string) { return evalClips.some((clip) => clip.id === id) }
function asset(id: string, file: string): string | undefined {
  return isEvalClip(id) ? assets[`../../../samples/eval/${id}/${file}`] : undefined
}
export function evalPageUrl(id: string, page: number) {
  return Number.isInteger(page) && page > 0 ? asset(id, `pages/page-${String(page).padStart(3, '0')}.png`) : undefined
}
export async function loadEvalClip(id: string, signal: AbortSignal) {
  const result = asset(id, 'result-terra.json'), audio = asset(id, 'audio-terra/audio.mp3')
  if (!result || !audio) throw new Error('등록된 평가 결과와 음성을 찾지 못했어요.')
  return loadStoredClip(new URL(result, window.location.href).href, new URL(audio, window.location.href).href, signal)
}
