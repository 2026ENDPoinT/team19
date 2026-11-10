// D-34 부품 확인용 실제 정식 샘플 파일. API 이미지 제공 전 임시 URL 매핑이다.
// 샘플 원본은 복사하거나 수정하지 않는다.
const partPages: Record<number, string> = {
  31: new URL('../../../samples/parts-test/pages/page-031.png', import.meta.url).href,
  32: new URL('../../../samples/parts-test/pages/page-032.png', import.meta.url).href,
  33: new URL('../../../samples/parts-test/pages/page-033.png', import.meta.url).href,
}
const clipPages: Record<number, string> = {
  18: new URL('../../../samples/clip-01/pages/page-018.png', import.meta.url).href,
  19: new URL('../../../samples/clip-01/pages/page-019.png', import.meta.url).href,
  20: new URL('../../../samples/clip-01/pages/page-020.png', import.meta.url).href,
}
export function samplePageUrl(clipId: string, page: number): string | undefined {
  if (clipId === 'parts-test') return partPages[page]
  if (clipId === 'clip-01' || clipId === 'clip-01-b') return clipPages[page]
  return undefined
}
