import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// implementer-common.md: the core app must never import the PepperHorn scoped
// package (see task-2.2-brief.md's grep check) and must work offline.
//
// preflight F5: writing the scope literal anywhere in this file, even in a
// comment, would make this check match itself and always fail. So the needle
// is built from two halves, and nothing else in this file spells it out.
const NEEDLE = '@pepper' + 'horn'

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) collectSourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('the core app never imports the PepperHorn scoped package', () => {
  it('contains no occurrence of the literal anywhere under src', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const srcRoot = resolve(here, '..')
    const offenders = collectSourceFiles(srcRoot)
      .filter((f) => readFileSync(f, 'utf8').includes(NEEDLE))
      .map((f) => f.slice(srcRoot.length + 1))
    expect(offenders).toEqual([])
  })
})
