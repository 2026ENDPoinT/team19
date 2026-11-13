import { useState } from 'react'
import { applyTheme, initialTheme } from '../theme'

type Props = { onHome: () => void; onExamples: () => void; onLibrary: () => void; examples?: boolean; library?: boolean }
export default function SiteHeader({ onHome, onExamples, onLibrary, examples = false, library = false }: Props) {
  const [theme, setTheme] = useState(initialTheme)
  const toggle = () => { const next = theme === 'dark' ? 'light' : 'dark'; applyTheme(next, true); setTheme(next) }
  return <header className="brand-header"><nav aria-label="주 메뉴" className="brand-header-inner">
    <button type="button" className="brand-wordmark" onClick={onHome} aria-label="에이도스 홈">EIDOS<span>에이도스</span></button>
    <div className="brand-navigation"><button type="button" onClick={onHome} aria-current={examples || library ? undefined : 'page'}>PDF 업로드</button><button type="button" onClick={onExamples} aria-current={examples ? 'page' : undefined}>학습 예시</button><button type="button" onClick={onLibrary} aria-current={library ? 'page' : undefined}>내 강의함</button></div>
    <button type="button" className="brand-theme-toggle" role="switch" aria-checked={theme === 'dark'} aria-label="어두운 화면" onClick={toggle}><span aria-hidden="true" data-on={theme === 'light'}>☀</span><span aria-hidden="true" data-on={theme === 'dark'}>☾</span></button>
    <button type="button" className="brand-header-action" onClick={examples ? onHome : onExamples}>{examples ? '내 강의로 시작' : '영상 둘러보기'}<span aria-hidden="true">↗</span></button>
  </nav></header>
}
