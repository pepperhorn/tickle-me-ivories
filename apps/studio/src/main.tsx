import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// index.css first: it declares the layer order (ivories above Tailwind's preflight).
import './index.css'
import 'ivories/style.css'
import App from './App.tsx'
import { DebugRoute } from './debug/DebugRoute'
import { EmbedFixture } from './embed/EmbedFixture'
import { startPlatform } from './platform/boot'

const path = window.location.pathname.replace(/\/+$/, '')
const isDebug = path === '/debug'
const isFixture = path === '/embed-fixture'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDebug ? <DebugRoute /> : isFixture ? <EmbedFixture /> : <App />}
  </StrictMode>,
)

void startPlatform(window.location.pathname)
