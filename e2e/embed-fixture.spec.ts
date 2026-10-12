/**
 * /embed-fixture smoke (spec §9): every preset embedded the way a host site would.
 * Without pepperscore 0.2 (the default; see notation-sync.spec.ts) the notation
 * presets show the notation-unavailable message and their sibling views keep playing.
 */
import { test, expect } from './fixtures'

const PRESETS = ['falling', 'keyboard', 'keyboard+notation', 'endless+falling', 'endless+keyboard']
const NO_PEPPERSCORE = /pepperscore 0\.2/

for (const preset of PRESETS) {
  test(`embed fixture renders ${preset}`, async ({ page }) => {
    await page.goto('/embed-fixture')
    const section = page.locator(`section[data-preset="${preset}"]`)
    const canvas = section.locator('canvas.ivories-canvas').first()
    await expect(canvas).toBeVisible({ timeout: 20_000 })   // a cold dev server optimises deps first
    expect((await canvas.boundingBox())!.width).toBeGreaterThan(100)
    await expect(section.locator('.ivories-transport')).toBeVisible()
    await expect(section.locator('.ivories-time')).not.toHaveText(/\/ 0:00$/)   // the score loaded
    if (preset.includes('notation') || preset.startsWith('endless')) {
      await expect(section.locator('.ivories-notation')).toBeVisible()
    }
  })
}

test('without pepperscore: notation-unavailable shows and the falling sibling keeps playing', async ({ page }) => {
  await page.goto('/embed-fixture')
  const section = page.locator('section[data-preset="endless+falling"]')
  const notation = section.locator('.ivories-notation')
  await expect(notation.locator('.ivories-message[role="alert"], :scope > :not(.ivories-message)').first()).toBeVisible({ timeout: 15_000 })
  const alert = notation.locator('.ivories-message[role="alert"]')
  test.skip(!(await alert.isVisible()), 'pepperscore 0.2 is installed: the unavailable path does not apply')
  await expect(alert).toHaveText(NO_PEPPERSCORE)

  await section.locator('.ivories-btn-play').click()
  const falling = section.locator('.ivories-falling')
  const t = async () => Number(await falling.getAttribute('data-t'))
  await expect.poll(t, { timeout: 10_000 }).toBeGreaterThan(0.5)
  const before = await t()
  await expect.poll(t, { timeout: 10_000 }).toBeGreaterThan(before + 0.5)
  await expect(section.locator('.ivories-time')).not.toHaveText(/^0:00 \//)
  await section.screenshot({ path: '/tmp/ivories-e2e/embed-notation-unavailable.png' })
})
