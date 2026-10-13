import { defineConfig, devices } from '@playwright/test'

// test:e2e:notation runs on its own port so a reused dev server never serves a stale (pepperscore-less) graph.
const PORT = Number(process.env.IVORIES_E2E_PORT ?? 5190)

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
  webServer: {
    command: `npm run dev -w apps/studio -- --host 0.0.0.0 --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
