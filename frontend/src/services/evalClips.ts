import { loadStoredClip } from './clips'

const labels: Record<string, string> = {
  'dc3-intro-01': '분할정복 입문 1 · 큰 문제를 작게 나누어 해결하기',
  'dc3-intro-02': '분할정복 입문 2 · 합병 정렬: 나누고 차례대로 합치기',
  'dc3-intro-03': '분할정복 입문 3 · 퀵 정렬: 기준값으로 양쪽 나누기',
  'dc3-intro-04': '분할정복 입문 4 · 합병 정렬과 퀵 정렬의 선택 기준',
  'dc3-review-01': '분할정복 기본 1 · 분할 정복의 세 단계와 종료 조건',
  'dc3-review-02': '분할정복 기본 2 · 재귀 깊이와 부분문제 유형 읽기',
  'dc3-review-03': '분할정복 기본 3 · 예시: 두 정렬 배열 합병하기',
  'dc3-review-04': '분할정복 기본 4 · 합병 정렬의 재귀와 구현 따라가기',
  'dc3-review-05': '분할정복 기본 5 · 합병 정렬의 시간복잡도 유도',
  'dc3-review-06': '분할정복 기본 6 · 퀵 정렬의 피봇과 재귀 범위',
  'dc3-review-07': '분할정복 기본 7 · 예시: 피봇 8로 제자리 분할하기',
  'dc3-review-08': '분할정복 기본 8 · 퀵 정렬의 최악·최선·평균 분석',
  'dc3-review-09': '분할정복 기본 9 · 피봇 선택과 작은 구간 성능 개선',
  'dc3-review-10': '분할정복 기본 10 · 합병 정렬과 퀵 정렬 선택하기',
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
}).sort((a, b) => Number(!a.id.startsWith('dc3-')) - Number(!b.id.startsWith('dc3-'))) // 공개 페이지(D-69)는 분할정복 강의 클립을 먼저 보여 준다
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
  return loadStoredClip(new URL(result, window.location.href).href, new URL(audio, window.location.href).href, signal, `audio-${name}/audio.mp3`)
}
