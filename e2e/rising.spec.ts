/**
 * Rising roll e2e (rising-roll spec §4): live MIDI through a fake MIDIAccess,
 * a score, both rolls horizontal, and the Transport BPM field. The cases live
 * behind /embed-fixture?rising so the default fixture page stays light.
 */
import { test, expect } from './fixtures'
import type { Page } from './fixtures'
import type { Locator } from '@playwright/test'
import { installFakeMidi, midiBound, noteOff, noteOn } from './fakeMidi'

const SHOTS = '/tmp/ivories-e2e'
const FIXTURE = '/embed-fixture?rising'
// Nine providers share this page: it can be unresponsive for several seconds after load,
// so the first waits get the cold-load budget the fixture already uses (preflight T9-1).
const COLD = { timeout: 20_000 }
const caseOf = (page: Page, id: string) => page.locator(`section[data-case="${id}"]`)
const drawnT = async (view: Locator) => Number(await view.getAttribute('data-t'))

/** A cheap signature of what a canvas currently shows. */
const signature = (canvas: Locator) => canvas.evaluate((c: HTMLCanvasElement) => {
  const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  let h = 0
  for (let i = 0; i < data.length; i += 97) h = (h * 31 + data[i]) >>> 0
  return h
})

/** Mean brightness of a pixel column 8 CSS px in from the left and right edges. */
const edges = (canvas: Locator) => canvas.evaluate((c: HTMLCanvasElement) => {
  const ctx = c.getContext('2d')!
  const px = c.width / Math.max(1, c.clientWidth)
  const mean = (x: number) => {
    let sum = 0, n = 0
    for (let y = Math.floor(c.height * 0.1); y < c.height * 0.9; y += 2) {
      const d = ctx.getImageData(Math.round(x), y, 1, 1).data
      sum += (d[0] + d[1] + d[2]) / 3
      n++
    }
    return sum / n
  }
  return { left: mean(8 * px), right: mean(c.width - 8 * px) }
})

test.beforeEach(async ({ page }) => { await installFakeMidi(page) })

test('rising, live MIDI: the first note starts the live clock and the note rises', async ({ page }) => {
  await page.goto(FIXTURE)
  const section = caseOf(page, 'rising-live')
  const view = section.locator('.ivories-rising')
  await expect(view).toBeVisible(COLD)
  await expect(section.locator('.ivories-bpm-input')).toHaveValue('100', COLD)
  await expect.poll(() => midiBound(page), { timeout: 30_000 }).toBe(true)
  expect(await drawnT(view)).toBe(0)
  await noteOn(page, 60)
  await expect.poll(() => drawnT(view), { timeout: 10_000 }).toBeGreaterThan(0.3)
  const canvas = view.locator('canvas.ivories-canvas')
  const before = await signature(canvas)
  await page.waitForTimeout(300)
  expect(await signature(canvas)).not.toBe(before)
  await noteOff(page, 60)
  await section.screenshot({ path: `${SHOTS}/rising-live.png` })
})

test('rising, live MIDI: the Transport BPM field sets the view BPM', async ({ page }) => {
  await page.goto(FIXTURE)
  const section = caseOf(page, 'rising-live')
  const field = section.locator('.ivories-bpm-input')
  await expect(field).toBeVisible(COLD)
  await expect(field).toHaveValue('100', COLD)
  await field.fill('120')
  await expect(section.locator('.ivories-rising')).toHaveAttribute('data-bpm', '120')
})

test('rising with a score runs on the score clock and has no BPM field', async ({ page }) => {
  await page.goto(FIXTURE)
  const section = caseOf(page, 'rising-score')
  const view = section.locator('.ivories-rising')
  await expect(view).toBeVisible(COLD)
  await expect(section.locator('.ivories-time')).not.toHaveText(/\/ 0:00$/, COLD)
  await expect(section.locator('.ivories-bpm')).toHaveCount(0)
  await section.locator('.ivories-btn-play').click()
  await expect.poll(() => drawnT(view), { timeout: 10_000 }).toBeGreaterThan(0.5)
  // The registry handle drives the same clock the view draws from.
  expect(await page.evaluate(() => window.__ivoriesFixture!.cases['rising-score']!.clock.now())).toBeGreaterThan(0.5)
  await section.screenshot({ path: `${SHOTS}/rising-score.png` })
})

for (const id of ['falling-horizontal', 'rising-horizontal']) {
  test(`${id}: the keyboard stands on the left edge`, async ({ page }) => {
    await page.goto(FIXTURE)
    const section = caseOf(page, id)
    const view = section.locator('.ivories-view')
    await expect(view).toHaveAttribute('data-orientation', 'horizontal', COLD)
    await expect(section.locator('.ivories-time')).not.toHaveText(/\/ 0:00$/, COLD)
    const canvas = view.locator('canvas.ivories-canvas')
    await expect.poll(async () => (await edges(canvas)).left, { timeout: 20_000 }).toBeGreaterThan(150)
    expect((await edges(canvas)).right).toBeLessThan(100)
    await section.screenshot({ path: `${SHOTS}/${id}.png` })
  })
}
