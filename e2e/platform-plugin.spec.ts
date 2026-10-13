/**
 * The hosted wiring, locally (Task 19): /tickle.config.json -> plugin bundle ->
 * mock gateway (the plugin repo's in-memory stand-in for apps.pepperhorn.com).
 * Run through `npm run test:e2e:plugin`, never on its own: it builds the plugin
 * against the mock and starts the mock as a Playwright webServer.
 */
import { mkdirSync } from 'node:fs'
import { test, expect } from './fixtures'
import type { Page } from './fixtures'

test.skip(process.env.TICKLE_PLUGIN_E2E !== '1', 'run through npm run test:e2e:plugin')

const CODE = '12345678' // the mock gateway's fixed code
const GW = `http://localhost:${process.env.E2E_GW_PORT ?? 8790}`
const SHOTS = '/tmp/plugin-e2e'
const SHARE_URL = /^http:\/\/localhost:\d+\/s\/([A-Za-z0-9]{10})$/

test.beforeAll(() => { mkdirSync(SHOTS, { recursive: true }) })

/** Signs in with the mock's fixed code; returns the handle the trigger shows. */
async function signIn(page: Page, email: string): Promise<string> {
  await page.locator('.account-menu-trigger--signed-out').click()
  await page.locator('.sign-in-email-input').fill(email)
  await page.locator('.btn-send-code').click()
  await page.locator('.otp-digit').first().focus()
  await page.keyboard.insertText(CODE)
  const trigger = page.locator('.account-menu-trigger--signed-in')
  await expect(trigger).toHaveText(/^@player-\d+$/)
  return (await trigger.textContent())!
}

async function loadDemo(page: Page) {
  await page.setInputFiles('#file-input', 'docs/demo.mid')
  await expect(page.locator('.layout-toolbar')).toBeVisible()
}

async function openScenes(page: Page) {
  await page.locator('.btn-settings').click()
  const toggle = page.locator('.settings-section--scenes .settings-section-toggle')
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
}

async function saveScene(page: Page, name: string) {
  await page.locator('.save-name-input').fill(name)
  await page.locator('.btn-save-scene').click()
  const row = page.locator('.scene-row--scene', { hasText: name })
  await expect(row).toBeVisible()
  return row
}

/** The share as the gateway serves it to anyone holding the link. */
async function resolveShare(page: Page, code: string) {
  const res = await page.request.get(`${GW}/ph/v1/shares/${code}?appSlug=tickle-me-ivories`)
  return { status: res.status(), body: res.ok() ? await res.text() : '' }
}

test('sign in, save to the account, share it, a guest previews and saves a copy, stop sharing', async ({ page, browser }) => {
  await page.goto('/')
  const handle = await signIn(page, 'ana@example.test')
  await loadDemo(page)
  await openScenes(page)
  const row = await saveScene(page, 'E2E scene')

  // The save went to the account (the gateway), not the browser fallback.
  await page.reload()
  await expect(page.locator('.account-menu-trigger--signed-in')).toHaveText(handle)
  await loadDemo(page)
  await openScenes(page)
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Share E2E scene' }).click()
  await row.locator('.btn-get-share-link').click()
  const url = await row.locator('.share-url').inputValue()
  expect(url).toMatch(SHARE_URL)
  await page.screenshot({ path: `${SHOTS}/owned-share-link.png` })

  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(new URL(url).pathname)
  await expect(guest.locator('.account-menu-trigger--signed-out')).toBeVisible()
  const banner = guest.locator('.shared-preview-banner')
  await expect(banner).toContainText('Shared scene')
  await expect(banner).toContainText(handle)
  await guest.screenshot({ path: `${SHOTS}/guest-preview.png` })
  await banner.locator('.btn-save-copy').click()
  await expect(banner.locator('.btn-save-copy')).toHaveText('Saved')
  await expect(banner.locator('.btn-save-copy')).toBeDisabled()
  // Signed out, the copy lands in the guest's browser saves.
  await guest.locator('.btn-open-scenes').click()
  await expect(guest.locator('.scenes-empty-card .scene-row--scene')).toHaveCount(1)
  await guest.screenshot({ path: `${SHOTS}/guest-saved-copy.png` })

  await guestContext.close()

  await row.locator('.btn-stop-sharing').click()
  await expect(page.locator('.scenes-panel')).toContainText('Sharing stopped for “E2E scene”')
  // A share the guest acted on is never re-offered, so check the dead link from a fresh browser.
  const lateContext = await browser.newContext()
  const late = await lateContext.newPage()
  await late.goto(new URL(url).pathname)
  await expect(late.locator('.shared-preview-banner--error')).toContainText('removed')
  await late.screenshot({ path: `${SHOTS}/link-after-stop.png` })
  await lateContext.close()
})

test('signed out, a look share is an anonymous link; Stop sharing uses the stored revoke key', async ({ page, browser }) => {
  await page.goto('/')
  await expect(page.locator('.account-menu-trigger--signed-out')).toBeVisible()
  await loadDemo(page)
  await openScenes(page)
  await page.locator('.btn-copy-share--look').click()
  const field = page.locator('.share-panel .share-url')
  await expect(field).toHaveValue(SHARE_URL)
  const code = SHARE_URL.exec(await field.inputValue())![1]

  // The revoke key is kept in this browser only, keyed by the share code.
  const storedKey = () => page.evaluate((c) => localStorage.getItem(`tmi.shareRevoke.${c}`), code)
  expect(JSON.parse((await storedKey())!)).toMatchObject({ key: expect.any(String) })
  expect((await resolveShare(page, code)).status).toBe(200)

  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(`/s/${code}`)
  await expect(guest.locator('.shared-preview-banner')).toContainText('Shared look')

  await page.screenshot({ path: `${SHOTS}/anonymous-share.png` })
  await page.locator('.btn-stop-sharing--anonymous').click()
  await expect(page.locator('.share-panel .share-status')).toContainText('Sharing stopped')
  await expect(field).toHaveCount(0)
  expect(await storedKey()).toBeNull()
  expect((await resolveShare(page, code)).status).toBe(404)

  await guest.reload()
  await expect(guest.locator('.shared-preview-banner--error')).toContainText('removed')
  await guestContext.close()
})

test('a webcam scene keeps its camera in the account but the shared link drops it', async ({ page }) => {
  await page.goto('/')
  await signIn(page, 'cam@example.test')
  await loadDemo(page)
  await page.getByLabel('Layout', { exact: true }).selectOption('split')
  await page.getByLabel('Bottom source').selectOption('webcam')
  // Pin the fake camera, so the scene carries a deviceId.
  const camera = page.getByLabel('Bottom camera')
  await expect(camera.locator('option')).not.toHaveCount(1)
  const deviceId = await camera.locator('option').nth(1).getAttribute('value')
  expect(deviceId).toBeTruthy()
  await camera.selectOption(deviceId!)
  const video = page.locator('.ivories-slot-bottom video.ivories-camera-video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 10_000 }).toBeGreaterThanOrEqual(2)

  await openScenes(page)
  // The account save keeps the deviceId: the note below appears only when sharing would strip one.
  const row = await saveScene(page, 'Cam scene')
  await row.getByRole('button', { name: 'Share Cam scene' }).click()
  await expect(row.locator('.share-camera-note')).toContainText('removes this browser’s camera choice')
  await page.screenshot({ path: `${SHOTS}/webcam-camera-note.png` })
  await row.locator('.btn-get-share-link').click()
  const code = SHARE_URL.exec(await row.locator('.share-url').inputValue())![1]
  await expect(row.locator('.share-camera-note')).toHaveCount(0)

  const shared = await resolveShare(page, code)
  expect(shared.status).toBe(200)
  expect(shared.body).toContain('webcam')
  expect(shared.body).not.toContain(deviceId!)
  expect(shared.body).not.toContain('deviceId')
})

test('a second sign-in shows two devices, and one can be signed out', async ({ page, browser }) => {
  await page.goto('/')
  await signIn(page, 'dev@example.test')
  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  await other.goto('/')
  await signIn(other, 'dev@example.test')

  await page.locator('.account-menu-trigger--signed-in').click()
  await page.locator('.btn-show-devices').click()
  await expect(page.locator('.account-device')).toHaveCount(2)
  await page.screenshot({ path: `${SHOTS}/devices.png` })
  await page.locator('.account-device', { hasNotText: '(this device)' }).locator('.btn-revoke-device').click()
  await expect(page.locator('.account-device')).toHaveCount(1)
  await other.reload()
  await expect(other.locator('.account-menu-trigger--signed-out')).toBeVisible()
  await otherContext.close()
})
