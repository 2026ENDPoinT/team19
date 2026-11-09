type HeaderProps = {
  onHome: () => void
  onReset: () => void
  canReset: boolean
}

export default function Header({ onHome, onReset, canReset }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <button className="brand-button" type="button" onClick={onHome} aria-label="강의 숏폼 업로드 화면으로 돌아가기">
          <span className="brand-mark" aria-hidden="true">▶</span>
          <span className="brand-name">강의 숏폼</span>
        </button>
        <button className="secondary-button" type="button" onClick={onReset} disabled={!canReset}>
          새 PDF로 시작
        </button>
      </div>
    </header>
  )
}
