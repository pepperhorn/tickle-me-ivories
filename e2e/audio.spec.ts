/**
 * Sound, in a real browser (Chromium, autoplay allowed): ivories plays through pepperscore/audio.
 * Regression for the 0.1.1 silence (a Sampler that matched no note: every view Played, nothing
 * sounded, no error). Each test counts what actually reaches Web Audio: AudioBufferSourceNode
 * starts (sampled notes) and OscillatorNode starts (the synthesized count-in knock).
 *
 * /embed-fixture?audio has two keyboard-only players whose asset base is FIXTURE_SOUNDS_BASE, a host
 * that does not exist: page.route answers it with a one-instrument pack of tiny WAV samples, and 404s
 * everything else (TimGM6mb.sf2, the drum kit), so the run is offline and deterministic.
 */
import { test, expect } from './fixtures'
import type { Page } from './fixtures'

// Same value as FIXTURE_SOUNDS_BASE in apps/studio/src/embed/EmbedFixture.tsx (e2e has no tsconfig of its own).
const BASE = 'https://sounds.ivories.test/'
const DEFAULT_BASE = 'https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/'

/** A short mono 16-bit WAV (a sine), base64: what a pack sample decodes to. */
function wavBase64(hz: number, sec = 0.4, rate = 8000): string {
  const n = Math.round(sec * rate)
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), 44 + i * 2)
  return buf.toString('base64')
}

async function servePack(page: Page) {
  const samples: Record<string, string> = {}
  for (const key of [36, 48, 60, 72, 84]) samples[key] = wavBase64(440 * 2 ** ((key - 69) / 12))
  await page.route(`${BASE}**`, (route) => {
    const path = route.request().url().slice(BASE.length)
    if (path === 'pack.json') return route.fulfill({ json: { pack: 'core', fluidr3: ['acoustic_grand_piano'] }, headers: { 'access-control-allow-origin': '*' } })
    if (path === 'soundfonts/fluidr3/acoustic_grand_piano.json') {
      return route.fulfill({ json: { name: 'acoustic_grand_piano', samples }, headers: { 'access-control-allow-origin': '*' } })
    }
    return route.fulfill({ status: 404, body: '', headers: { 'access-control-allow-origin': '*' } })
  })
}

interface Probe { contexts: number; starts: { when: number; now: number; stopped: boolean }[]; oscillators: { when: number }[] }
declare global { interface Window { __probe?: Probe } }

/** Counts every sampled-note and synth start, on every AudioContext, before any page script runs. */
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: Probe = { contexts: 0, starts: [], oscillators: [] }
    window.__probe = probe
    const Ctx = window.AudioContext
    window.AudioContext = class extends Ctx { constructor(o?: AudioContextOptions) { super(o); probe.contexts++ } }
    const start = AudioBufferSourceNode.prototype.start
    const stop = AudioBufferSourceNode.prototype.stop
    const rec = new WeakMap<AudioBufferSourceNode, { stopped: boolean }>()
    AudioBufferSourceNode.prototype.start = function (when = 0, ...rest: number[]) {
      const r = { when, now: this.context.currentTime, stopped: false }
      probe.starts.push(r)
      rec.set(this, r)
      return start.call(this, when, ...rest)
    }
    // A stop() with no time (or a time before the start) is a cancel; pepperscore's own end-of-note stop has a time.
    AudioBufferSourceNode.prototype.stop = function (when?: number) {
      const r = rec.get(this)
      if (r && (when === undefined || when <= r.when)) r.stopped = true
      return stop.call(this, when)
    }
    const osc = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (when = 0) { probe.oscillators.push({ when }); return osc.call(this, when) }
  })
}

const probe = (page: Page) => page.evaluate(() => window.__probe!)
const section = (page: Page, id: string) => page.locator(`section[data-case="${id}"]`)

async function openAudioFixture(page: Page) {
  await installProbe(page)
  await servePack(page)
  await page.goto('/embed-fixture?audio')
  await expect(section(page, 'audio-a').getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 20_000 })
}

test('a keyboard-only view with `sounds` sounds: Play starts sampled voices on one shared AudioContext', async ({ page }) => {
  await openAudioFixture(page)
  await section(page, 'audio-a').getByRole('button', { name: 'Play' }).click()
  await expect.poll(async () => (await probe(page)).starts.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(8)
  const p = await probe(page)
  expect(p.contexts, 'one AudioContext for every player (pepperscore getSharedAudio)').toBe(1)
  // Handed over ahead of time (the scheduler's lookahead), never in the past.
  expect(p.starts.every((s) => s.when >= s.now - 1e-3)).toBe(true)
})

test('Stop cancels the queued notes: nothing starts after Pause, and what was scheduled ahead is stopped', async ({ page }) => {
  await openAudioFixture(page)
  const a = section(page, 'audio-a')
  await a.getByRole('button', { name: 'Play' }).click()
  await expect.poll(async () => (await probe(page)).starts.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(4)
  await a.getByRole('button', { name: 'Pause' }).click()
  const atPause = await page.evaluate(() => ({ n: window.__probe!.starts.length, now: (window.__probe!.starts.at(-1)?.now ?? 0) }))
  await page.waitForTimeout(800)
  const p = await probe(page)
  expect(p.starts.length, 'no note handed over after Pause').toBe(atPause.n)
  const queued = p.starts.filter((s) => s.when > atPause.now + 0.05)
  expect(queued.every((s) => s.stopped), 'every note scheduled ahead of the pause was cancelled').toBe(true)
})

test('two players on one page never double-play: starting one stops the other', async ({ page }) => {
  await openAudioFixture(page)
  const a = section(page, 'audio-a')
  const b = section(page, 'audio-b')
  await a.getByRole('button', { name: 'Play' }).click()
  await expect.poll(async () => (await probe(page)).starts.length, { timeout: 10_000 }).toBeGreaterThan(0)
  await b.getByRole('button', { name: 'Play' }).click()
  await expect(a.getByRole('button', { name: 'Play' }), 'A was stopped by B starting').toBeVisible()
  await expect(b.getByRole('button', { name: 'Pause' })).toBeVisible()
  const before = (await probe(page)).starts.length
  await expect.poll(async () => (await probe(page)).starts.length, { timeout: 10_000 }).toBeGreaterThan(before)
  // Pausing B leaves the page silent: had A kept playing, notes would still be starting.
  await b.getByRole('button', { name: 'Pause' }).click()
  const n = (await probe(page)).starts.length
  await page.waitForTimeout(800)
  expect((await probe(page)).starts.length).toBe(n)
})

test('the count-in clicks before the first note (the woodblock\'s kit is missing here, so pepperscore knocks)', async ({ page }) => {
  await openAudioFixture(page)
  const warnings: string[] = []
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()) })
  await section(page, 'audio-b').getByRole('button', { name: 'Play' }).click()
  await expect.poll(async () => (await probe(page)).starts.length, { timeout: 15_000 }).toBeGreaterThan(0)
  const p = await probe(page)
  const firstNote = Math.min(...p.starts.map((s) => s.when))
  // demo.mid is 4/4: four count-in beats, each a synthesized knock, all before the first note.
  expect(p.oscillators.filter((o) => o.when < firstNote - 1e-3).length).toBe(4)
  expect(warnings.some((w) => w.includes('metronome'))).toBe(true)
})

test('host confinement: with sounds.assetBaseUrl set, the only other host asked for anything is the asset base', async ({ page, baseURL }) => {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await openAudioFixture(page)
  await section(page, 'audio-b').getByRole('button', { name: 'Play' }).click()   // instruments and the metronome's kit
  await expect.poll(async () => (await probe(page)).starts.length, { timeout: 15_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  const origin = new URL(baseURL!).origin
  const offHost = urls.filter((u) => /^https?:/.test(u) && new URL(u).origin !== origin && !u.startsWith(BASE))
  expect(offHost, `requests off the asset base:\n${offHost.join('\n')}`).toEqual([])
  expect(urls.some((u) => u === `${BASE}soundfonts/fluidr3/acoustic_grand_piano.json`)).toBe(true)
  expect(urls.some((u) => u === `${BASE}soundfonts/TimGM6mb.sf2` || u.startsWith(`${BASE}soundfonts/perfect-drums/`)), 'the metronome asks the same base').toBe(true)
})

test.describe('pepperscore\'s default asset base (network)', () => {
  test.use({ allowGmSounds: true })

  test('with no sounds prop the piano comes from pepperscore-sounds-core on jsDelivr, and Play sounds it', async ({ page, request, baseURL }) => {
    let reachable = false
    try { reachable = (await request.get(`${DEFAULT_BASE}pack.json`, { timeout: 10_000 })).ok() } catch { /* offline */ }
    test.skip(!reachable, `network unavailable: ${DEFAULT_BASE}pack.json is unreachable`)
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url()))
    await installProbe(page)
    const sample = page.waitForResponse((r) => r.url() === `${DEFAULT_BASE}soundfonts/fluidr3/acoustic_grand_piano.json`, { timeout: 30_000 })
    await page.goto('/embed-fixture?default-sounds')
    expect((await sample).status()).toBe(200)
    const play = section(page, 'default-sounds').getByRole('button', { name: 'Play' })
    await expect(play).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500)   // decode the 88 notes
    await play.click()
    await expect.poll(async () => (await probe(page)).starts.length, { timeout: 15_000 }).toBeGreaterThan(4)
    const origin = new URL(baseURL!).origin
    const offHost = urls.filter((u) => /^https?:/.test(u) && new URL(u).origin !== origin && !u.startsWith(DEFAULT_BASE))
    expect(offHost).toEqual([])
  })
})
