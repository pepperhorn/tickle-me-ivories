/**
 * The GM piano path (R-G) in a real browser: a provider with sounds={{ pack: 'core' }}
 * (/embed-fixture?gm) loads its live keys from the pepperscore-sounds pack on jsDelivr,
 * decodes the samples and builds a smplr Sampler. This is the one test that goes to the
 * network; without it the test is skipped with the reason, never silently.
 */
import { test, expect } from './fixtures'
import { installFakeMidi, midiBound, noteOff, noteOn } from './fakeMidi'

const PACK = 'https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/'

test.use({ allowGmSounds: true })

test('GM piano: live keys load the pepperscore-sounds core pack into a Sampler, with no audio warning', async ({ page, request }) => {
  let reachable = false
  try { reachable = (await request.get(`${PACK}pack.json`, { timeout: 10_000 })).ok() } catch { /* offline */ }
  test.skip(!reachable, `network unavailable: ${PACK}pack.json is unreachable, so the GM path cannot be exercised`)

  const audioWarnings: string[] = []
  page.on('console', (m) => { if (m.text().includes('[ivories] audio:')) audioWarnings.push(m.text()) })
  await installFakeMidi(page)
  const sample = page.waitForResponse((r) => r.url() === `${PACK}soundfonts/fluidr3/acoustic_grand_piano.json`, { timeout: 30_000 })
  await page.goto('/embed-fixture?gm')

  const section = page.locator('section[data-case="gm-live"]')
  await expect(section.locator('.ivories-keyboard, canvas.ivories-canvas').first()).toBeVisible({ timeout: 20_000 })
  expect((await sample).status()).toBe(200)
  await expect(section.locator('.fixture-gm-probe')).toHaveAttribute('data-gm-live', 'true', { timeout: 30_000 })

  await expect.poll(() => midiBound(page), { timeout: 30_000 }).toBe(true)
  await noteOn(page, 60, 90)
  await page.waitForTimeout(400)
  await noteOff(page, 60)
  await page.waitForTimeout(200)
  expect(audioWarnings, 'no [ivories] audio: console warning').toEqual([])
})
