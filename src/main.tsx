import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()

// 仅在 https（或 localhost）的生产环境注册离线壳，file:// 与开发环境跳过
if (process.env.NODE_ENV !== 'development' && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
