import { defineConfig } from 'vitest/config'

// One `npm test` at the root runs every workspace (spec §9).
export default defineConfig({
  test: { projects: ['packages/ivories', 'apps/studio'] },
})
