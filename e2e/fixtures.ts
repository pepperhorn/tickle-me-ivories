import { test as base, expect } from '@playwright/test'

/** What /embed-fixture publishes on window (apps/studio/src/embed/EmbedFixture.tsx). */
interface FixtureHandle { play(): void; pause(): void; seek(t: number): void; readonly clock: { now(): number } }
interface FixtureNotation { seek(seconds: number): void; currentTime(): number }
declare global {
  interface Window {
    __ivoriesFixture?: {
      handles: Partial<Record<string, FixtureHandle>>
      notation: Partial<Record<string, FixtureNotation>>
      cases: Partial<Record<string, FixtureHandle>>
    }
  }
}

/**
 * Piano and metronome samples come from public CDNs. The smoke suite runs offline and
 * deterministic: those requests are refused, so playback runs on the silent clock (spec §8).
 * They are refused in the browser (CDP Network.setBlockedURLs, Chromium only), not with
 * page.route: the falling/keyboard providers ask for thousands of sample files, and a
 * page.route round trip per request kept the page unresponsive for 10-25 s after load.
 */
const SAMPLE_URLS = ['*smpldsnds.github.io/*', '*gleitz.github.io/*', '*.ogg', '*.ogg?*', '*.mp3', '*.mp3?*', '*.m4a', '*.m4a?*']
/** The pepperscore-sounds GM packs (R-G): refused too, unless a test opts in with allowGmSounds. */
const GM_SOUND_URLS = ['*cdn.jsdelivr.net/npm/pepperscore-sounds-*']

export const test = base.extend<{ allowGmSounds: boolean; pageErrors: string[] }>({
  allowGmSounds: [false, { option: true }],
  /** Every test fails on an uncaught page error, wherever it happened. */
  pageErrors: [async ({ page, allowGmSounds }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setBlockedURLs', { urls: allowGmSounds ? SAMPLE_URLS : [...SAMPLE_URLS, ...GM_SOUND_URLS] })
    await use(errors)
    expect(errors, 'uncaught page errors').toEqual([])
  }, { auto: true }],
})

export { expect }
export type { Page } from '@playwright/test'
