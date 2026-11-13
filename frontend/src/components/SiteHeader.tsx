type Props = { onHome: () => void; onExamples: () => void; onLibrary: () => void; examples?: boolean; library?: boolean }
export default function SiteHeader({ onHome, onExamples, onLibrary, examples = false, library = false }: Props) {
  return <header className="brand-header"><nav aria-label="주 메뉴" className="brand-header-inner">
    <button type="button" className="brand-wordmark" onClick={onHome} aria-label="에이도스 홈"><img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" />EIDOS<span>에이도스</span></button>
    <div className="brand-navigation"><button type="button" onClick={onHome} aria-current={examples || library ? undefined : 'page'}>PDF 업로드</button><button type="button" onClick={onExamples} aria-current={examples ? 'page' : undefined}>학습 예시</button><button type="button" onClick={onLibrary} aria-current={library ? 'page' : undefined}>내 강의함</button></div>
  </nav></header>
}
