// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { peerDependencies: Record<string, string> }

describe('package.json', () => {
  it('pins the pepperscore peer to 0.3.x: ivories leans on pepperscore/audio contracts a 0.4 may change', () => {
    expect(pkg.peerDependencies.pepperscore).toBe('^0.3.0')
  })
})
