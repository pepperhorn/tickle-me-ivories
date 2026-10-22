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

test('notation themes: paper card by default, inverted ink with ink-on-dark; transport survives preflight', async ({ page }) => {
  await page.goto('/embed-fixture?notation-themes')
  const paper = page.locator('section[data-preset="keyboard+notation"] .ivories-notation')
  const dark = page.locator('section[data-case="notation-ink-on-dark"] .ivories-notation')
  await expect(paper).toHaveAttribute('data-notation-theme', 'paper')
  await expect(dark).toHaveAttribute('data-notation-theme', 'ink-on-dark')
  expect(await paper.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)')
  expect(await dark.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgb(255, 255, 255)')
  // Before any engraving: the play button keeps its green pill under Tailwind's preflight.
  const play = page.locator('section[data-preset="keyboard+notation"] .ivories-transport-play')
  await expect(play).toHaveAccessibleName('Play')
  expect(await play.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(52, 86, 66)')
  const score = dark.locator('.ivories-notation-score')
  if (process.env.PEPPERSCORE_REQUIRED) await score.waitFor({ timeout: 20_000 })
  test.skip(!(await score.count()), 'pepperscore 0.2 is not installed: no engraving to invert')
  expect(await score.evaluate((e) => getComputedStyle(e).filter)).toContain('invert(1)')
})
