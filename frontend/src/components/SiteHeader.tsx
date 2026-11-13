type Props = { onHome: () => void; onExamples: () => void; examples?: boolean }
export default function SiteHeader({ onHome, onExamples, examples = false }: Props) {
  return <header className="brand-header"><nav aria-label="주 메뉴" className="brand-header-inner">
    <button type="button" className="brand-wordmark" onClick={onHome} aria-label="에이도스 홈">EIDOS<span>에이도스</span></button>
    <div className="brand-navigation"><button type="button" onClick={onHome} aria-current={examples ? undefined : 'page'}>PDF 업로드</button><button type="button" onClick={onExamples} aria-current={examples ? 'page' : undefined}>학습 예시</button></div>
    <button type="button" className="brand-header-action" onClick={examples ? onHome : onExamples}>{examples ? '내 강의로 시작' : '영상 둘러보기'}<span aria-hidden="true">↗</span></button>
  </nav></header>
}
