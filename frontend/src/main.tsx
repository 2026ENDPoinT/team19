import { createRoot } from 'react-dom/client'
import App from './App'

const container = document.getElementById('app')

if (!container) {
  throw new Error('화면을 표시할 #app 요소가 없습니다.')
}

createRoot(container).render(<App />)