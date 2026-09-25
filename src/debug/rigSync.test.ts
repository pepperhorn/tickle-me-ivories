/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Spec §16 / preflight F26: tools/strike-lab.html is the single authority for
// the tuning rig. public/strike-lab.html is a served copy that must never
// silently diverge from it, so this check fails npm test if the two drift.
describe('strike-lab rig sync', () => {
  it('keeps public/strike-lab.html byte-equal to tools/strike-lab.html', () => {
    const source = readFileSync(resolve(process.cwd(), 'tools/strike-lab.html'))
    const served = readFileSync(resolve(process.cwd(), 'public/strike-lab.html'))
    expect(served.equals(source)).toBe(true)
  })
})
