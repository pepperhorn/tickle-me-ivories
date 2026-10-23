import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PlatformError as PlatformErrorFromTypes, isPlatformError as isPlatformErrorFromTypes } from './types'
import { PlatformError, isPlatformError } from './errors'

describe('platform/types.ts re-exports errors.ts (preflight F1)', () => {
  it('re-exports the same PlatformError class and isPlatformError function', () => {
    expect(PlatformErrorFromTypes).toBe(PlatformError)
    expect(isPlatformErrorFromTypes).toBe(isPlatformError)
  })
})

// preflight F4, updated 2026-10-13: the plugin type-checks this file through
// `ivories/core`'s emitted declarations, so types.ts (and everything it
// imports) must stay runtime-free. Checked by statically walking the
// relative-import graph rather than by shelling out to a second tsc build.
describe('platform/types.ts stays runtime-free (preflight F4)', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const srcRoot = resolve(here, '..')

  const IMPORT_RE =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g

  function specifiersIn(file: string): string[] {
    const text = readFileSync(file, 'utf8')
    const out: string[] = []
    for (const m of text.matchAll(IMPORT_RE)) out.push(m[1])
    return out
  }

  function resolveRelative(fromFile: string, spec: string): string {
    const base = resolve(dirname(fromFile), spec)
    return base.endsWith('.ts') || base.endsWith('.tsx') ? base : `${base}.ts`
  }

  function walk(entry: string, visited = new Set<string>(), bare = new Set<string>()) {
    if (visited.has(entry)) return { visited, bare }
    visited.add(entry)
    for (const spec of specifiersIn(entry)) {
      if (spec.startsWith('.')) walk(resolveRelative(entry, spec), visited, bare)
      else bare.add(spec)
    }
    return { visited, bare }
  }

  it('imports no bare package specifier, directly or transitively', () => {
    const { bare } = walk(join(srcRoot, 'platform', 'types.ts'))
    expect([...bare]).toEqual([])
  })

  it('never reaches settings/profile.ts, transport/useTransport.ts or io/parseMidi.ts', () => {
    const { visited } = walk(join(srcRoot, 'platform', 'types.ts'))
    const forbidden = [...visited].filter((f) =>
      f.endsWith(`${'settings'}/profile.ts`)
      || f.endsWith(`${'transport'}/useTransport.ts`)
      || f.endsWith(`${'io'}/parseMidi.ts`))
    expect(forbidden).toEqual([])
  })

  it('resolves only through settings/types.ts, model/types.ts, layout/types.ts, template/types.ts and platform/errors.ts', () => {
    const { visited } = walk(join(srcRoot, 'platform', 'types.ts'))
    const relative = [...visited].map((f) => f.slice(srcRoot.length + 1))
    // template/types.ts is type-only and import-free; it joins the graph once
    // settings/types.ts imports it, so it is allowed rather than required.
    const allowed = ['layout/types.ts', 'model/types.ts', 'platform/errors.ts', 'platform/types.ts', 'settings/types.ts']
    if (relative.includes('template/types.ts')) allowed.push('template/types.ts')
    expect(relative.sort()).toEqual(allowed.sort())
  })
})
