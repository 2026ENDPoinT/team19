// 라이트/다크 화면 전환. 처음엔 컴퓨터 설정을 따르고, 사용자가 바꾸면 브라우저에 기억한다.
export type Theme = 'light' | 'dark'
const KEY = 'eidos-theme'

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* 저장소를 못 쓰면 시스템 설정을 따른다 */ }
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme, remember = false) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  if (remember) try { localStorage.setItem(KEY, theme) } catch { /* 위와 같음 */ }
}
