/** Studio "Play live" (R-S): rising view on the live clock, toolbar BPM, horizontal toggle, back to a score. */
import { test, expect } from './fixtures'
import { installFakeMidi, midiBound, noteOff, noteOn } from './fakeMidi'

test('studio Play live: live notes rise, the BPM control drives the view, the roll turns horizontal', async ({ page }) => {
  await installFakeMidi(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Play live', exact: true }).click({ timeout: 20_000 })
  const toolbar = page.locator('.layout-toolbar')
  await expect(toolbar).toBeVisible()
  await expect(page.locator('.live-session-bar')).toBeVisible()
  const view = page.locator('.studio-stage .ivories-rising')
  await expect(view).toBeVisible()

  const bpm = toolbar.getByLabel('BPM', { exact: true })
  await bpm.fill('132')
  await bpm.blur()
  await expect(view).toHaveAttribute('data-bpm', '132')

  await expect.poll(() => midiBound(page), { timeout: 30_000 }).toBe(true)
  await noteOn(page, 64)
  await expect.poll(async () => Number(await view.getAttribute('data-t')), { timeout: 10_000 }).toBeGreaterThan(0.3)
  await noteOff(page, 64)

  await toolbar.getByLabel('Main orientation').selectOption('horizontal')
  await expect(view).toHaveAttribute('data-orientation', 'horizontal')
  await page.screenshot({ path: '/tmp/ivories-e2e/studio-live-horizontal.png' })

  await page.getByRole('button', { name: 'Load a score' }).click()
  await expect(page.locator('#file-input')).toBeAttached()
  await expect(page.locator('.live-session-bar')).toHaveCount(0)
})
