/**
 * With sounds.fallbackSoundfontUrl set, the browser requests only the pack host and the
 * configured soundfont host: nothing from gleitz.github.io / smpldsnds.github.io, no loop data.
 * The GM pack is CDP-blocked by fixtures.ts (blocked requests still emit `request`) and the
 * soundfont is answered 404, so the run is offline and the engine's retries are exercised.
 */
import { test, expect } from './fixtures'

// Same value as FIXTURE_SOUNDFONT in apps/studio/src/embed/EmbedFixture.tsx (duplicated: e2e has no tsconfig of its own).
const FIXTURE_SOUNDFONT = 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef'
const PACK_PREFIX = 'https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/'

test('with fallbackSoundfontUrl set, only the pack and soundfont hosts are requested', async ({ page, baseURL }) => {
  await page.route(`${FIXTURE_SOUNDFONT}/**`, (r) => r.fulfill({ status: 404, body: '' }))
  const urls: string[] = []
  page.on('request', (req) => urls.push(req.url()))

  await page.goto('/embed-fixture?sound-hosts')
  await page.waitForRequest(`${FIXTURE_SOUNDFONT}/MusyngKite/acoustic_grand_piano-mp3.js`, { timeout: 30_000 })
  await page.waitForTimeout(1500)   // let the retries settle

  const pageOrigin = new URL(baseURL!).origin
  const offenders = urls.filter((u) => {
    if (!/^https?:/.test(u)) return false
    return new URL(u).origin !== pageOrigin && !u.startsWith(PACK_PREFIX) && !u.startsWith(`${FIXTURE_SOUNDFONT}/`)
  })
  expect(offenders, `requests off the configured hosts:\n${offenders.join('\n')}`).toEqual([])
  expect(urls.filter((u) => u.includes('gleitz.github.io') || u.includes('smpldsnds.github.io'))).toEqual([])
})
