import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'ivories/style.css'
import './index.css'
import App from './App.tsx'
import { DebugRoute } from './debug/DebugRoute'
import { EmbedFixture } from './embed/EmbedFixture'

const path = window.location.pathname.replace(/\/+$/, '')
const isDebug = path === '/debug'
const isFixture = path === '/embed-fixture'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDebug ? <DebugRoute /> : isFixture ? <EmbedFixture /> : <App />}
  </StrictMode>,
)
