import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme, initialTheme } from './theme'

// 첫 화면부터 저장된 테마로 그려 깜빡임을 막는다.
applyTheme(initialTheme())

const container = document.getElementById('app')

if (!container) {
  throw new Error('화면을 표시할 #app 요소가 없습니다.')
}

createRoot(container).render(<App />)