/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Spec §16 / preflight F26: tools/strike-lab.html (repo root) is the single
// authority for the tuning rig. apps/studio/public/strike-lab.html is a served
// copy that must never silently diverge from it.
const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

describe('strike-lab rig sync', () => {
  it('keeps apps/studio/public/strike-lab.html byte-equal to tools/strike-lab.html', () => {
    const source = readFileSync(at('../../../../tools/strike-lab.html'))
    const served = readFileSync(at('../../public/strike-lab.html'))
    expect(served.equals(source)).toBe(true)
  })
})
