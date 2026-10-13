#!/usr/bin/env node
// Spec §2: the studio may import only the package's public entry points
// (ivories, ivories/core, ivories/style.css) and must never reach into
// packages/ivories/src. Also re-checks the "@pepperhorn never" rule.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STUDIO = join(ROOT, 'apps', 'studio')
const ALLOWED = new Set(['ivories', 'ivories/core', 'ivories/style.css'])
const NEEDLE = '@pepper' + 'horn'
const SPEC_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|vi\.(?:mock|doMock|importActual)\(\s*['"]([^'"]+)['"]/g

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue
    const f = join(dir, e)
    if (statSync(f).isDirectory()) walk(f, out)
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(e)) out.push(f)
  }
  return out
}

const problems = []
const viteCfg = join(STUDIO, 'vite.config.ts')
const files = [...walk(join(STUDIO, 'src')), viteCfg]
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)
  if (text.includes(NEEDLE) && !rel.endsWith('pepperhornScope.test.ts')) problems.push(`${rel}: mentions the PepperHorn scope`)
  for (const m of text.matchAll(SPEC_RE)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (spec.startsWith('.')) {
      const target = resolve(dirname(file), spec)
      if (!(target + sep).startsWith(STUDIO + sep)) problems.push(`${rel}: relative import leaves apps/studio: ${spec}`)
    } else if (spec === 'ivories' || spec.startsWith('ivories/')) {
      if (!ALLOWED.has(spec)) problems.push(`${rel}: deep import ${spec} (allowed: ${[...ALLOWED].join(', ')})`)
    } else if (spec.includes('packages/ivories')) {
      problems.push(`${rel}: path into packages/ivories: ${spec}`)
    }
  }
}
const viteCfgText = readFileSync(viteCfg, 'utf8')
if (/alias\s*:[\s\S]*?packages\/ivories/.test(viteCfgText)) problems.push('apps/studio/vite.config.ts: alias into the package')
for (const cfg of ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']) {
  const text = readFileSync(join(STUDIO, cfg), 'utf8')
  if (/"paths"\s*:/.test(text) || text.includes('packages/ivories')) problems.push(`apps/studio/${cfg}: must not alias into the package`)
}
if (problems.length) {
  console.error(`Public-entry import check failed:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`Public-entry import check: ${files.length} studio files import only ${[...ALLOWED].join(', ')}`)
