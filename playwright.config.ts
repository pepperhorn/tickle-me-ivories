import { defineConfig, devices } from '@playwright/test'
import { join, resolve } from 'node:path'

// test:e2e:notation runs on its own port so a reused dev server never serves a stale (pepperscore-less) graph.
const PORT = Number(process.env.IVORIES_E2E_PORT ?? 5190)

const studio = {
  command: `npm run dev -w apps/studio -- --host 0.0.0.0 --port ${PORT} --strictPort`,
  url: `http://localhost:${PORT}`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
}

// test:e2e:plugin (scripts/e2e-plugin.mjs) only: the plugin repo's in-memory mock
// gateway runs as a foreground webServer child, so Playwright owns its lifetime
// and every run starts from an empty gateway (never reused). A taken port makes
// it exit at once, which fails the run instead of talking to another server.
const PLUGIN_E2E = process.env.TICKLE_PLUGIN_E2E === '1'
const GW_PORT = Number(process.env.E2E_GW_PORT ?? 8790)
const mockGateway = {
  command: 'npm run mock-gateway',
  cwd: resolve(process.env.PLUGIN_REPO ?? join(import.meta.dirname, '..', 'tickle-ph-plugin')),
  port: GW_PORT,
  env: { PORT: String(GW_PORT), SHARE_ORIGIN: `http://localhost:${PORT}` },
  reuseExistingServer: false,
  timeout: 30_000,
  stdout: 'pipe' as const,
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: false,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    permissions: ['camera'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: PLUGIN_E2E ? [{ ...studio, reuseExistingServer: false }, mockGateway] : studio,
})
