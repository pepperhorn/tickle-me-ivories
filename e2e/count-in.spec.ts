/**
 * Count-in, note-name bars, transport beat ticks and the grand-staff notation
 * panel (user request 2026-10-22). Single-preset pages (?only=) keep five
 * pianos from loading at once.
 */
import { join } from 'node:path'
import { test, expect } from './fixtures'
import type { Locator } from '@playwright/test'

const SHOTS = join(import.meta.dirname, '..', '.superpowers', 'shots')
const COLD = { timeout: 20_000 }
const drawnT = async (view: Locator) => Number(await view.getAttribute('data-t'))

/** Brightest pixel along a canvas row `cssY` px from the top. */
const rowMax = (canvas: Locator, cssY: number) => canvas.evaluate((c: HTMLCanvasElement, y: number) => {
  const px = c.width / Math.max(1, c.clientWidth)
  const d = c.getContext('2d')!.getImageData(0, Math.round(y * px), c.width, 1).data
  let max = 0
  for (let i = 0; i < d.length; i += 4) max = Math.max(max, (d[i] + d[i + 1] + d[i + 2]) / 3)
  return max
}, cssY)

test('falling: Play from the top counts in, and no bar touches the keys as it starts', async ({ page }) => {
  await page.goto('/embed-fixture?only=falling')
  const section = page.locator('section[data-preset="falling"]')
  const view = section.locator('.ivories-falling')
  const canvas = view.locator('canvas.ivories-canvas')
  await expect(canvas).toBeVisible(COLD)
  await expect(section.locator('.ivories-time')).not.toHaveText(/\/ 0:00$/, COLD)
  await expect(section.locator('.ivories-count-in-select')).toHaveValue('1')
  await section.locator('.ivories-btn-play').click()
  const overlay = section.locator('.ivories-count-in-overlay')
  await expect(overlay).toHaveAttribute('data-count', /[12]/, { timeout: 10_000 })
  expect(await drawnT(view)).toBeLessThan(0)
  // The row just above the key line is bare stage: every bar is still falling toward it.
  const keyboardPx = await overlay.evaluate((e) => parseFloat((e as HTMLElement).style.bottom))
  const h = (await canvas.boundingBox())!.height
  expect(await rowMax(canvas, h - keyboardPx - 2)).toBeLessThan(80)
  await section.screenshot({ path: `${SHOTS}/falling-count-in.png` })
  await expect(overlay).toHaveAttribute('data-count', '4', { timeout: 10_000 })
  await expect.poll(() => drawnT(view), { timeout: 10_000 }).toBeGreaterThan(0.6)
  await section.screenshot({ path: `${SHOTS}/falling-labels-playing.png` })
})

test('transport: the seek track breaks at every beat and marks the bar lines', async ({ page }) => {
  await page.goto('/embed-fixture?only=falling')
  const transport = page.locator('section[data-preset="falling"] .ivories-transport')
  await expect(transport).toBeVisible(COLD)
  const track = transport.locator('.ivories-seek-track')
  await expect.poll(async () => Number(await track.getAttribute('data-beat-ticks')), COLD).toBeGreaterThan(4)
  await expect(transport.locator('.ivories-seek-bar-marks')).toHaveCount(1)
  // The count-in select sits beside the track, not over it.
  const seek = (await transport.locator('.ivories-seek-wrap').boundingBox())!
  const sel = (await transport.locator('.ivories-count-in-field').boundingBox())!
  expect(sel.x >= seek.x + seek.width || sel.y >= seek.y + seek.height).toBe(true)
  await transport.screenshot({ path: `${SHOTS}/transport-beat-ticks.png` })
})

for (const preset of ['keyboard+notation', 'endless+keyboard']) {
  test(`${preset}: a whole grand staff fits the notation panel`, async ({ page }) => {
    await page.goto(`/embed-fixture?only=${encodeURIComponent(preset)}`)
    const section = page.locator(`section[data-preset="${preset}"]`)
    const notation = section.locator('.ivories-notation')
    const alert = notation.locator('.ivories-message[role="alert"]')
    const system = notation.locator('.score-system:not(.is-pending)').first()
    await expect(alert.or(system).first()).toBeVisible({ timeout: 30_000 })
    test.skip(await alert.isVisible() && !process.env.PEPPERSCORE_REQUIRED, 'pepperscore 0.2 is not installed (R9)')
    // The fit settles over a couple of re-engraves.
    await expect.poll(async () => {
      const box = (await notation.boundingBox())!
      const bottoms = await notation.locator('.score-system:not(.is-pending)').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom))
      return Math.max(...bottoms) <= box.y + box.height + 0.5
    }, { timeout: 20_000 }).toBe(true)
    await page.waitForTimeout(600)
    await section.screenshot({ path: `${SHOTS}/${preset.replace('+', '-')}-grand-staff.png` })
  })
}
