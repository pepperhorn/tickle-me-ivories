/**
 * Style templates e2e: the default look is unchanged by the template feature, and
 * chord-cards-crf draws in falling, rising (both orientations) and keyboard-only.
 * The cases live behind /embed-fixture?templates.
 */
import { test, expect } from './fixtures'
import type { Page } from './fixtures'
import type { Locator } from '@playwright/test'
import { join } from 'node:path'

const SHOTS = '/tmp/ivories-e2e'
/** Review screenshots (gitignored). */
const SUPER_SHOTS = join(import.meta.dirname, '..', '.superpowers', 'shots')
const FIXTURE = '/embed-fixture?templates'
const COLD = { timeout: 20_000 }
const caseOf = (page: Page, id: string) => page.locator(`section[data-case="${id}"]`)
const frames = (page: Page, n = 2) => page.evaluate(async (k) => { for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r)) }, n)

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

/** The pixel at CSS (x, y), as [r, g, b]. */
const pixelAt = (canvas: Locator, x: number, y: number) => canvas.evaluate((c: HTMLCanvasElement, [cx, cy]) => {
  const px = c.width / Math.max(1, c.clientWidth)
  const d = c.getContext('2d')!.getImageData(Math.round(cx * px), Math.round(cy * px), 1, 1).data
  return [d[0], d[1], d[2]]
}, [x, y])

const near = (got: number[], want: number[], tol: number) => got.every((v, i) => Math.abs(v - want[i]) <= tol)

const CRF = ['#f86e6e', '#f58841', '#ffbc57', '#b8a334', '#fff56d', '#b3f888', '#93d154', '#6bc6a0', '#7ee8df', '#88a7f8', '#cc97e8', '#e277b1']
  .map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))

/** True when any sampled pixel in the upper 70% of the canvas is within tol of a CRF palette colour. */
const hasCrfPixel = (canvas: Locator, tol: number) => canvas.evaluate((c: HTMLCanvasElement, [palette, t]) => {
  const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, Math.floor(c.height * 0.7))
  for (let i = 0; i < data.length; i += 4 * 3) {
    for (const p of palette) {
      if (Math.abs(data[i] - p[0]) <= t && Math.abs(data[i + 1] - p[1]) <= t && Math.abs(data[i + 2] - p[2]) <= t) return true
    }
  }
  return false
}, [CRF, tol] as [number[][], number])

async function ready(page: Page, id: string) {
  const section = caseOf(page, id)
  const canvas = section.locator('canvas.ivories-canvas').first()
  await expect(canvas).toBeVisible(COLD)
  await page.waitForFunction((i) => !!window.__ivoriesFixture?.cases[i], id, COLD)
  return { section, canvas }
}
const seek = async (page: Page, id: string, t: number) => {
  await page.evaluate(([i, s]) => { const h = window.__ivoriesFixture!.cases[i as string]!; h.pause(); h.seek(s as number) }, [id, t])
  await frames(page)
}

test('the default look is unchanged: no template and template="classic" draw the same pixels', async ({ page }) => {
  await page.goto(FIXTURE)
  const a = await ready(page, 'tpl-default')
  const b = await ready(page, 'tpl-classic')
  await seek(page, 'tpl-default', 2)
  await seek(page, 'tpl-classic', 2)
  await frames(page)
  expect(await signature(a.canvas)).toBe(await signature(b.canvas))
  const inline = await a.section.locator('.ivories-view').first().evaluate((el: HTMLElement) => el.style.getPropertyValue('--ivories-key-white'))
  expect(inline).toBe('')
})

test('chord-cards-crf, falling: paper stage, plate, pitch-coloured bars', async ({ page }) => {
  await page.goto(FIXTURE)
  const { section, canvas } = await ready(page, 'tpl-cc-falling')
  await expect(section.locator('.ivories-view').first()).toHaveAttribute('data-ivories-template', 'chord-cards-crf')
  await seek(page, 'tpl-cc-falling', 2)
  expect(near(await pixelAt(canvas, 10, 10), [251, 248, 241], 3)).toBe(true)
  expect(await hasCrfPixel(canvas, 6)).toBe(true)
  await section.screenshot({ path: `${SHOTS}/tpl-cc-falling.png` })
  await section.screenshot({ path: `${SUPER_SHOTS}/tpl-cc-falling.png` })
})

test('chord-cards-crf, rising vertical and horizontal: same checks, horizontal keyboard on the left', async ({ page }) => {
  await page.goto(FIXTURE)
  const v = await ready(page, 'tpl-cc-rising')
  await expect(v.section.locator('.ivories-view').first()).toHaveAttribute('data-ivories-template', 'chord-cards-crf')
  await seek(page, 'tpl-cc-rising', 2)
  expect(near(await pixelAt(v.canvas, 10, 10), [251, 248, 241], 3)).toBe(true)
  expect(await hasCrfPixel(v.canvas, 6)).toBe(true)
  await v.section.screenshot({ path: `${SHOTS}/tpl-cc-rising.png` })
  await v.section.screenshot({ path: `${SUPER_SHOTS}/tpl-cc-rising.png` })

  const h = await ready(page, 'tpl-cc-rising-h')
  await expect(h.section.locator('.ivories-view').first()).toHaveAttribute('data-ivories-template', 'chord-cards-crf')
  await seek(page, 'tpl-cc-rising-h', 2)
  const e = await edges(h.canvas)
  // The stage is paper (~247), so the keyboard band on the left reads darker (ink key outlines and black keys), not brighter.
  expect(e.right).toBeGreaterThan(240)
  expect(e.right - e.left).toBeGreaterThan(15)
  expect(await hasCrfPixel(h.canvas, 6)).toBe(true)
  await h.section.screenshot({ path: `${SHOTS}/tpl-cc-rising-h.png` })
  await h.section.screenshot({ path: `${SUPER_SHOTS}/tpl-cc-rising-h.png` })
})

test('chord-cards-crf, keyboard only: plate and raised keys draw', async ({ page }) => {
  await page.goto(FIXTURE)
  const { section, canvas } = await ready(page, 'tpl-cc-keyboard')
  await seek(page, 'tpl-cc-keyboard', 2)
  // The plate's hard ink shadow is a band flush with the canvas bottom: measure the run of ink pixels
  // upward from the last row, in three columns. Black keys never reach the bottom, so only the plate can make this run.
  const runs = await canvas.evaluate((c: HTMLCanvasElement) => {
    const px = c.width / Math.max(1, c.clientWidth)
    const ctx = c.getContext('2d')!
    const ink = (d: Uint8ClampedArray) => Math.abs(d[0] - 35) <= 8 && Math.abs(d[1] - 31) <= 8 && Math.abs(d[2] - 32) <= 8
    return [0.25, 0.5, 0.75].map((f) => {
      const x = Math.round(c.width * f)
      let n = 0
      for (let y = c.height - 1; y > c.height * 0.5; y--) {
        if (!ink(ctx.getImageData(x, y, 1, 1).data)) break
        n++
      }
      return n / px
    })
  })
  for (const cssPx of runs) {
    expect(cssPx).toBeGreaterThanOrEqual(2)
    expect(cssPx).toBeLessThanOrEqual(10)
  }
  await section.screenshot({ path: `${SHOTS}/tpl-cc-keyboard.png` })
  await section.screenshot({ path: `${SUPER_SHOTS}/tpl-cc-keyboard.png` })
})
