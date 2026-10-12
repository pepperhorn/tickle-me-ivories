import { test as base, expect } from '@playwright/test'

/** What /embed-fixture publishes on window (apps/studio/src/embed/EmbedFixture.tsx). */
interface FixtureHandle { play(): void; pause(): void; seek(t: number): void; readonly clock: { now(): number } }
interface FixtureNotation { seek(seconds: number): void; currentTime(): number }
declare global {
  interface Window {
    __ivoriesFixture?: {
      handles: Partial<Record<string, FixtureHandle>>
      notation: Partial<Record<string, FixtureNotation>>
    }
  }
}

/** Piano and metronome samples come from public CDNs. The smoke suite runs offline and
    deterministic: those requests are refused, so playback runs on the silent clock (spec §8). */
const SAMPLE_HOSTS = /smpldsnds\.github\.io|gleitz\.github\.io|\.(ogg|mp3|m4a)(\?|$)/

/** Every test fails on an uncaught page error, wherever it happened. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route(SAMPLE_HOSTS, (r) => r.abort())
    await use(errors)
    expect(errors, 'uncaught page errors').toEqual([])
  }, { auto: true }],
})

export { expect }
export type { Page } from '@playwright/test'
