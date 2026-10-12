import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DebugRoute } from './debug/DebugRoute'

const isDebug = window.location.pathname.replace(/\/+$/, '') === '/debug'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDebug ? <DebugRoute /> : <App />}
  </StrictMode>,
)
