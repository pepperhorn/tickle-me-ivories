/**
 * Notation sync (spec §9): pepperscore's cursor and the falling roll follow one clock.
 *
 * pepperscore 0.2 is not published (R9), so the default `npm run test:e2e` skips this
 * spec: the studio resolves a missing pepperscore to a module that throws and <Notation>
 * shows "...needs pepperscore 0.3 or later...". To run it for real against a local build:
 *
 *   (cd /path/to/pepperscore-clock && npm run build && npm pack -w pepperscore)
 *   PEPPERSCORE_TARBALL=/path/to/pepperscore-0.2.0.tgz npm run test:e2e:notation
 *
 * scripts/e2e-notation.mjs installs the tarball with `npm install --no-save`, runs this
 * spec plus the embed smoke, then restores package-lock.json and node_modules, so no
 * local path is ever committed.
 */
import { test, expect } from './fixtures'

const PRESET = 'endless+falling'
const TOLERANCE = 0.05

test('notation and falling keys stay in sync after a seek (spec §9)', async ({ page }) => {
  await page.goto('/embed-fixture')
  const section = page.locator(`section[data-preset="${PRESET}"]`)
  const notation = section.locator('.ivories-notation')
  const alert = notation.locator('.ivories-message[role="alert"]')
  const score = notation.locator(':scope > :not(.ivories-message)')
  await expect(alert.or(score).first()).toBeVisible({ timeout: 15_000 })
  if (await alert.isVisible()) {
    const text = (await alert.textContent()) ?? ''
    // test:e2e:notation sets PEPPERSCORE_REQUIRED: there a missing pepperscore is a failure.
    test.skip(!process.env.PEPPERSCORE_REQUIRED && /pepperscore 0\.3 or later/.test(text), 'pepperscore 0.2 is not installed (R9)')
    throw new Error(`notation failed for another reason: ${text}`)
  }

  await page.waitForFunction((p) => {
    const f = window.__ivoriesFixture
    return !!(f?.handles[p] && f?.notation[p])
  }, PRESET)
  // The endless view drew something.
  await expect.poll(() => score.evaluate((el) => el.querySelectorAll('svg, canvas').length), { timeout: 15_000 }).toBeGreaterThan(0)
  await section.scrollIntoViewIfNeeded()
  await section.screenshot({ path: '/tmp/ivories-e2e/notation-endless.png' })

  const readAll = () => page.evaluate((p) => {
    const f = window.__ivoriesFixture!
    const key = p
    const roll = document.querySelector<HTMLElement>(`section[data-preset="${p}"] .ivories-falling`)
    return { clock: f.handles[key]!.clock.now(), cursor: f.notation[key]!.currentTime(), roll: Number(roll?.dataset.t) }
  }, PRESET)
  const inSync = async (target: number) => {
    await expect.poll(async () => {
      const s = await readAll()
      return Math.abs(s.clock - target) < 1e-6 && Math.abs(s.cursor - s.clock) < TOLERANCE && Math.abs(s.roll - s.clock) < TOLERANCE
    }, { message: `notation cursor and roll at ${target}s`, timeout: 5_000 }).toBe(true)
    return readAll()
  }

  // A host seek moves both views.
  await page.evaluate((p) => window.__ivoriesFixture!.handles[p]!.seek(5), PRESET)
  const afterSeek = await inSync(5)
  console.log(`[notation-sync] host seek 5s -> ${JSON.stringify(afterSeek)}`)

  // A seek through pepperscore's handle reports back through onSeek and moves the provider clock.
  await page.evaluate((p) => window.__ivoriesFixture!.notation[p]!.seek(2), PRESET)
  const afterHandle = await inSync(2)
  console.log(`[notation-sync] notation handle seek 2s -> ${JSON.stringify(afterHandle)}`)

  // Clicking a note in the endless view seeks the clock.
  const before = (await readAll()).clock
  const note = score.locator('[data-note-id], .note, g.vf-stavenote, .vf-stavenote').nth(6)
  await note.click({ force: true })
  await expect.poll(async () => (await readAll()).clock, { message: 'a note click seeks the clock', timeout: 5_000 }).not.toBeCloseTo(before, 3)
  const clicked = (await readAll()).clock
  const afterClick = await inSync(clicked)
  console.log(`[notation-sync] note click -> ${JSON.stringify(afterClick)}`)
  await section.screenshot({ path: '/tmp/ivories-e2e/notation-after-click.png' })
})
