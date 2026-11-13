import { loadStoredClip } from './clips'

const labels: Record<string, string> = {
  'algo-dc-review-c7': '알고리즘 · 피봇 분할',
  'algo-dc-review-c4': '알고리즘 · 합병 정렬 재귀',
  'algo-dc-review-c5': '알고리즘 · 합병 정렬 n log n',
  'se-arch-review-c2': '소프트웨어공학 · MVC',
  'nlp-transformer-review-c3': '트랜스포머 · 셀프 어텐션',
  'rl-mdp-review-c4': '강화학습 · 벨만 방정식',
  'py-basic-review-c2': '파이썬 · 팩토리얼',
}
const assets = import.meta.glob<string>([
  '../../../samples/eval/*/result-*.json',
  '../../../samples/eval/*/audio-*/audio.mp3',
  '../../../samples/eval/*/pages/*.png',
], { eager: true, query: '?url', import: 'default' })
// result-<이름>.json이 있으면 목록에 자동으로 나온다. id는 Terra면 '폴더', 모델·프롬프트 비교용은 '폴더@이름'.
export const evalClips = Object.keys(assets).flatMap((key) => {
  const m = key.match(/\/eval\/([^/]+)\/result-(.+)\.json$/)
  return m ? [{ id: m[2] === 'terra' ? m[1] : `${m[1]}@${m[2]}`, label: `${labels[m[1]] ?? m[1]} / ${m[2]}` }] : []
})
export function isEvalClip(id: string) { return evalClips.some((clip) => clip.id === id) }
function asset(id: string, file: string): string | undefined {
  return isEvalClip(id) ? assets[`../../../samples/eval/${id.split('@')[0]}/${file}`] : undefined
}
export function evalPageUrl(id: string, page: number) {
  return Number.isInteger(page) && page > 0 ? asset(id, `pages/page-${String(page).padStart(3, '0')}.png`) : undefined
}
export async function loadEvalClip(id: string, signal: AbortSignal) {
  const name = id.split('@')[1] ?? 'terra'
  const result = asset(id, `result-${name}.json`), audio = asset(id, `audio-${name}/audio.mp3`)
  if (!result || !audio) throw new Error('등록된 평가 결과와 음성을 찾지 못했어요.')
  return loadStoredClip(new URL(result, window.location.href).href, new URL(audio, window.location.href).href, signal)
}
