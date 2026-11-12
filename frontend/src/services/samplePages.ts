// BE 연동 안내의 공식 샘플 이미지 ID만 사용한다.
// A/B는 같은 원본 페이지를 공유하며, samples PNG를 FE 번들에 포함하지 않는다.
const partPages: Record<number, string> = {
  31: 'parts-test-page-031',
  32: 'parts-test-page-032',
  33: 'parts-test-page-033',
}
const clipPages: Record<number, string> = {
  18: 'clip-01-page-018',
  19: 'clip-01-page-019',
  20: 'clip-01-page-020',
}
export function samplePageUrl(clipId: string, page: number): string | undefined {
  if (!Number.isInteger(page)) return undefined
  const pages = clipId === 'parts-test' ? partPages
    : clipId === 'clip-01' || clipId === 'clip-01-b' ? clipPages : undefined
  const assetId = pages?.[page]
  if (typeof assetId !== 'string') return undefined
  const base = import.meta.env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  return new URL(`/assets/${assetId}`, base).href
}
