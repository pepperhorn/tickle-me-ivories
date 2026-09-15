#!/usr/bin/env node
// Regenerates docs/screenshots/*.png for the README.
//
// Starts a Vite dev server (unless one is already running at PORT), drives
// Chromium via Playwright, and captures five shots: the empty drop-zone
// state, the falling roll mid-playback, keyboard-only mode, the phone
// landscape layout, and the standalone strike-lab tool.
//
// Usage: node scripts/screenshots.mjs

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdirSync, existsSync, statSync, readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SHOTS_DIR = resolve(ROOT, 'docs/screenshots')
const PORT = 5183
const BASE_URL = `http://localhost:${PORT}`
const DEMO_MIDI = resolve(ROOT, 'docs/demo.mid')
const STRIKE_LAB = resolve(ROOT, 'tools/strike-lab.html')

mkdirSync(SHOTS_DIR, { recursive: true })

function log(...args) { console.log('[screenshots]', ...args) }

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status < 500) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Dev server at ${url} did not come up within ${timeoutMs}ms`)
}

async function alreadyRunning() {
  try {
    const res = await fetch(BASE_URL)
    return res.ok
  } catch {
    return false
  }
}

async function startDevServer() {
  log(`Starting dev server on port ${PORT}...`)
  const child = spawn(
    'npm', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let out = ''
  child.stdout.on('data', (d) => { out += d.toString() })
  child.stderr.on('data', (d) => { out += d.toString() })
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error('[screenshots] dev server exited early:\n' + out)
    }
  })
  await waitForServer(BASE_URL)
  log('Dev server is up.')
  return child
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function settle(page) {
  // Let layout/fonts/canvas settle before a screenshot.
  await page.waitForTimeout(150)
}

/** Reports [width, height] and bytes of a PNG on disk without extra deps. */
function pngInfo(path) {
  const buf = readFileSync(path)
  // PNG IHDR: width/height are big-endian uint32 at bytes 16-23.
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  return { width, height, bytes: statSync(path).size }
}

async function loadDemoAndPlay(page, { mode } = {}) {
  const fileInput = page.locator('#file-input')
  await fileInput.setInputFiles(DEMO_MIDI)
  // Score header / transport bar appears once the file is parsed.
  await page.locator('.btn-play').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.btn-play').click()
  if (mode) {
    const modeBtn = page.locator('.btn-mode', { hasText: mode })
    await modeBtn.click()
  }
}

async function main() {
  let devServerProc = null
  let startedServer = false
  if (!(await alreadyRunning())) {
    devServerProc = await startDevServer()
    startedServer = true
  } else {
    log('Reusing already-running dev server.')
  }

  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  })

  try {
    // --- 1. drop-zone.png ---------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 2 })
      const page = await context.newPage()
      await page.goto(BASE_URL, { waitUntil: 'load' })
      await page.locator('.file-drop').waitFor({ state: 'visible' })
      await settle(page)
      const path = resolve(SHOTS_DIR, 'drop-zone.png')
      await page.screenshot({ path })
      log('Captured', path)
      await context.close()
    }

    // --- 2. falling-roll.png -------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 2 })
      const page = await context.newPage()
      await page.goto(BASE_URL, { waitUntil: 'load' })
      await loadDemoAndPlay(page)
      await sleep(6000)
      await settle(page)
      const path = resolve(SHOTS_DIR, 'falling-roll.png')
      await page.screenshot({ path })
      log('Captured', path)
      await context.close()
    }

    // --- 3. keyboard-mode.png -------------------------------------------
    {
      // Keyboard height derives from key WIDTH, so at 1400px wide the keyboard is
      // ~156px tall no matter how tall the viewport is. A short viewport shows the
      // mode without a screen of dead space above it.
      const context = await browser.newContext({ viewport: { width: 1400, height: 360 }, deviceScaleFactor: 2 })
      const page = await context.newPage()
      await page.goto(BASE_URL, { waitUntil: 'load' })
      await loadDemoAndPlay(page)
      await sleep(2000)
      const modeBtn = page.locator('.btn-mode', { hasText: 'keyboard' })
      await modeBtn.click()
      await sleep(4000)
      await settle(page)
      const path = resolve(SHOTS_DIR, 'keyboard-mode.png')
      await page.screenshot({ path })
      log('Captured', path)
      await context.close()
    }

    // --- 4. phone-landscape.png -----------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 850, height: 390 }, deviceScaleFactor: 2 })
      const page = await context.newPage()
      await page.goto(BASE_URL, { waitUntil: 'load' })
      await loadDemoAndPlay(page)
      await sleep(6000)
      await settle(page)
      const path = resolve(SHOTS_DIR, 'phone-landscape.png')
      await page.screenshot({ path })
      log('Captured', path)
      await context.close()
    }

    // --- 5. strike-lab.png ------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })
      const page = await context.newPage()
      await page.goto(`file://${STRIKE_LAB}`, { waitUntil: 'load' })
      await page.locator('#stage').waitFor({ state: 'visible' })
      await sleep(4000)
      await settle(page)
      const path = resolve(SHOTS_DIR, 'strike-lab.png')
      await page.screenshot({ path })
      log('Captured', path)
      await context.close()
    }
  } finally {
    await browser.close()
    if (startedServer && devServerProc) {
      log('Stopping dev server...')
      devServerProc.kill('SIGTERM')
    }
  }

  // --- Report + sanity check -----------------------------------------
  const files = ['drop-zone.png', 'falling-roll.png', 'keyboard-mode.png', 'phone-landscape.png', 'strike-lab.png']
  log('Summary:')
  for (const f of files) {
    const p = resolve(SHOTS_DIR, f)
    if (!existsSync(p)) { console.error(`  MISSING: ${f}`); continue }
    const { width, height, bytes } = pngInfo(p)
    log(`  ${f}: ${width}x${height}, ${(bytes / 1024).toFixed(1)} KB`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
