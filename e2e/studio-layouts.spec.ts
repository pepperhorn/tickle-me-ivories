/**
 * Studio smoke (spec §9): every stage layout with a fake webcam, theme switching,
 * labels plus a mid-play tempo change, and the count-in inside a split/PIP keys slot.
 * Chromium's fake media stream stands in for the camera (playwright.config.ts).
 */
import { test, expect } from './fixtures'
import type { Page } from './fixtures'

const SHOTS = '/tmp/ivories-e2e'

async function loadDemo(page: Page) {
  await page.goto('/')
  await page.setInputFiles('#file-input', 'docs/demo.mid')
  await expect(page.locator('.layout-toolbar')).toBeVisible()
}

async function rect(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox()
  if (!b) throw new Error(`${selector} has no box`)
  return b
}

async function webcamPlaying(page: Page, slot: string) {
  const video = page.locator(`.ivories-slot-${slot} video.ivories-camera-video`)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
  expect(await video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0)
}

/** The falling view's last drawn time (data-t, written every frame). */
async function drawnTime(page: Page) {
  return Number(await page.locator('.ivories-falling').first().getAttribute('data-t'))
}

/** A cheap signature of what a canvas currently shows. */
async function canvasSignature(page: Page, selector: string) {
  return page.locator(selector).evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')!
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let h = 0
    for (let i = 0; i < data.length; i += 97) h = (h * 31 + data[i]) >>> 0
    return h
  })
}

/** Opens the Settings panel at one section (sections start collapsed, Tempo aside). */
async function openSettings(page: Page, section: string) {
  await page.getByRole('button', { name: 'Settings' }).click()
  const toggle = page.locator(`.settings-section--${section} .settings-section-toggle`)
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
}

/** The panel's scrim covers the page while it is open; a click on it closes the panel. */
async function closeSettings(page: Page) {
  await page.locator('.settings-scrim').click({ position: { x: 5, y: 5 } })
  await expect(page.locator('.settings-panel')).toHaveCount(0)
}

const inside = (inner: { x: number; y: number; width: number; height: number }, outer: typeof inner, slack = 1) =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack
  && inner.x + inner.width <= outer.x + outer.width + slack
  && inner.y + inner.height <= outer.y + outer.height + slack

test('single: one falling-keys slot fills the stage', async ({ page }) => {
  await loadDemo(page)
  await expect(page.locator('.ivories-slot')).toHaveCount(1)
  await expect(page.locator('.ivories-slot-main')).toHaveAttribute('data-source', 'falling')
  const stage = await rect(page, '.ivories-stage-box')
  const main = await rect(page, '.ivories-slot-main')
  expect(Math.abs(main.width - stage.width)).toBeLessThan(2)
  expect(Math.abs(main.height - stage.height)).toBeLessThan(2)
  await page.screenshot({ path: `${SHOTS}/layout-single.png` })
})

test('split: ivories top, webcam bottom, then swapped', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Layout', { exact: true }).selectOption('split')
  await page.getByLabel('Bottom source').selectOption('webcam')
  await webcamPlaying(page, 'bottom')
  const top = await rect(page, '.ivories-slot-top')
  const bottom = await rect(page, '.ivories-slot-bottom')
  expect(top.y).toBeLessThan(bottom.y)
  expect(Math.abs(top.height - bottom.height)).toBeLessThan(2)
  await page.screenshot({ path: `${SHOTS}/layout-split.png` })

  await page.getByRole('button', { name: 'Swap slots' }).click()
  await expect(page.locator('.ivories-slot-top')).toHaveAttribute('data-source', 'webcam')
  await expect(page.locator('.ivories-slot-bottom')).toHaveAttribute('data-source', 'falling')
  await webcamPlaying(page, 'top')
  await page.screenshot({ path: `${SHOTS}/layout-split-swapped.png` })
})

test('split divider follows the arrow keys', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Layout', { exact: true }).selectOption('split')
  const divider = page.getByRole('separator', { name: 'Split position' })
  await divider.focus()
  await page.keyboard.press('ArrowDown')
  await expect(divider).toHaveAttribute('aria-valuenow', '55')
})

test('pip: the inset sits in each of the four corners, then swaps', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Layout', { exact: true }).selectOption('pip')
  await page.getByLabel('Inset source').selectOption('webcam')
  await webcamPlaying(page, 'inset')
  const stage = await rect(page, '.ivories-stage-box')
  for (const [corner, right, below] of [['tl', false, false], ['tr', true, false], ['bl', false, true], ['br', true, true]] as const) {
    await page.getByLabel('Inset corner').selectOption(corner)
    await expect(page.locator('.ivories-slot-inset')).toHaveAttribute('data-corner', corner)
    const inset = await rect(page, '.ivories-slot-inset')
    expect(inset.x + inset.width / 2 - stage.x > stage.width / 2).toBe(right)
    expect(inset.y + inset.height / 2 - stage.y > stage.height / 2).toBe(below)
    await page.screenshot({ path: `${SHOTS}/layout-pip-${corner}.png` })
  }
  await page.getByRole('button', { name: 'Swap slots' }).click()
  await expect(page.locator('.ivories-slot-inset')).toHaveAttribute('data-source', 'falling')
  await expect(page.locator('.ivories-slot-main')).toHaveAttribute('data-source', 'webcam')
  await webcamPlaying(page, 'main')
  await page.screenshot({ path: `${SHOTS}/layout-pip-swapped.png` })
})

test('pip: dragging the inset snaps it to the nearest corner', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Layout', { exact: true }).selectOption('pip')
  const stage = await rect(page, '.ivories-stage-box')
  const inset = await rect(page, '.ivories-slot-inset')
  await page.mouse.move(inset.x + inset.width / 2, inset.y + inset.height / 2)
  await page.mouse.down()
  await page.mouse.move(stage.x + 60, stage.y + 60, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.ivories-slot-inset')).toHaveAttribute('data-corner', 'tl')
})

test('9:16 letterboxes the stage box', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Aspect', { exact: true }).selectOption('9:16')
  const box = await rect(page, '.ivories-stage-box')
  expect(box.width / box.height).toBeCloseTo(9 / 16, 2)
})

test('all four themes repaint the stage', async ({ page }) => {
  await loadDemo(page)
  await openSettings(page, 'theme')
  const view = page.locator('.ivories-falling')
  const canvas = '.ivories-falling canvas.ivories-canvas'
  const seen = new Map<string, { bg: string; sig: number }>()
  for (const theme of ['classic', 'outline', 'contrast', 'transparent']) {
    await page.getByLabel('Keyboard theme').selectOption(theme)
    await expect(view).toHaveClass(new RegExp(`\\bivories-theme-${theme}\\b`))
    const bg = await view.evaluate((el) => getComputedStyle(el).getPropertyValue('--ivories-stage-bg').trim())
    // The renderer re-reads the tokens on a theme change; wait for the new frame.
    let sig = 0
    await expect.poll(async () => {
      sig = await canvasSignature(page, canvas)
      return [...seen.values()].some((s) => s.sig === sig)
    }, { message: `${theme} paints a frame no other theme painted` }).toBe(false)
    seen.set(theme, { bg, sig })
    await page.screenshot({ path: `${SHOTS}/theme-${theme}.png` })
  }
  expect(seen.get('classic')!.bg).toBe('#0e1511')
  expect(seen.get('transparent')!.bg).toBe('transparent')
  // A transparent stage leaves the roll area see-through.
  const alpha = await page.locator(canvas).evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(2, 2, 1, 1).data[3])
  expect(alpha).toBe(0)
})

test('note labels on and a mid-play tempo change keep playing', async ({ page }) => {
  await loadDemo(page)
  await openSettings(page, 'text')
  await page.getByLabel('Note labels').selectOption('pitch')
  await closeSettings(page)
  await page.getByRole('button', { name: 'Play' }).click()
  await expect.poll(() => drawnTime(page), { timeout: 10_000 }).toBeGreaterThan(1)
  await expect(page.locator('.ivories-note-label').first()).toBeVisible({ timeout: 10_000 })

  await openSettings(page, 'tempo')
  await page.getByLabel('Tempo scale').fill('0.75')
  await expect(page.locator('.tempo-scale-value')).toHaveText('75%')
  await closeSettings(page)
  const before = await drawnTime(page)
  await expect.poll(() => drawnTime(page), { timeout: 10_000 }).toBeGreaterThan(before + 1)
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/labels-tempo.png` })
})

/** Plays from the top and returns the count-in number's box while the lead-in shows it. */
async function countInBox(page: Page) {
  await page.getByRole('button', { name: 'Play' }).click()
  const number = page.locator('.count-in-number')
  await expect(number).toBeVisible({ timeout: 10_000 })
  return { layer: await rect(page, '.count-in-layer'), number: await rect(page, '.count-in-number') }
}

for (const [name, setup, keysSlot] of [
  ['split, keys on top', async (page: Page) => {
    await page.getByLabel('Layout', { exact: true }).selectOption('split')
    await page.getByLabel('Bottom source').selectOption('webcam')
  }, 'top'],
  ['split, keys at the bottom', async (page: Page) => {
    await page.getByLabel('Layout', { exact: true }).selectOption('split')
    await page.getByLabel('Bottom source').selectOption('webcam')
    await page.getByRole('button', { name: 'Swap slots' }).click()
  }, 'bottom'],
  ['pip, keys in the inset', async (page: Page) => {
    await page.getByLabel('Layout', { exact: true }).selectOption('pip')
    await page.getByLabel('Inset source').selectOption('webcam')
    await page.getByRole('button', { name: 'Swap slots' }).click()
    await page.getByLabel('Inset corner').selectOption('tr')
  }, 'inset'],
] as const) {
  test(`count-in sits inside the keys slot (${name})`, async ({ page }) => {
    await loadDemo(page)
    await setup(page)
    await expect(page.locator(`.ivories-slot-${keysSlot}`)).toHaveAttribute('data-source', 'falling')
    const slot = await rect(page, `.ivories-slot-${keysSlot}`)
    const { layer, number } = await countInBox(page)
    expect(inside(layer, slot), `count-in layer ${JSON.stringify(layer)} inside ${keysSlot} ${JSON.stringify(slot)}`).toBe(true)
    const cx = number.x + number.width / 2, cy = number.y + number.height / 2
    expect(cx > slot.x && cx < slot.x + slot.width && cy > slot.y && cy < slot.y + slot.height).toBe(true)
    await page.screenshot({ path: `${SHOTS}/count-in-${keysSlot}.png` })
  })
}
