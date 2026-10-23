#!/usr/bin/env node
// The published package: entries exist, only allowed bare imports remain,
// no Tailwind leaked into the CSS, no test tooling in the output, and both
// entries import under plain Node (no window at import time, spec §4 SSR).
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const dist = new URL('../dist/', import.meta.url)
const problems = []
for (const f of ['index.js', 'core.js', 'style.css', 'template.schema.json', 'types/index.d.ts', 'types/core/index.d.ts']) {
  if (!existsSync(new URL(f, dist))) problems.push(`missing dist/${f}`)
}
const ALLOWED = [/^react$/, /^react\/jsx-runtime$/, /^react-dom(\/.*)?$/, /^@tonejs\/midi$/, /^tonal$/, /^fflate$/, /^@noble\/hashes\//, /^pepperscore(\/audio)?$/]
for (const f of readdirSync(dist).filter((n) => n.endsWith('.js'))) {
  const text = readFileSync(new URL(f, dist), 'utf8')
  for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"'./][^"']*)["']/g)) {
    if (!ALLOWED.some((re) => re.test(m[1]))) problems.push(`dist/${f}: unexpected import "${m[1]}"`)
  }
}
// No test tooling in declarations or JS.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)])
for (const u of walk(new URL('types/', dist))) {
  if (/\.test(-helpers)?\.d\.ts$|test-setup|pepperscore\.stub/.test(u.pathname)) problems.push(`test file in declarations: ${u.pathname}`)
  if (/\bvitest\b/.test(readFileSync(u, 'utf8'))) problems.push(`vitest referenced in ${u.pathname}`)
}
for (const f of readdirSync(dist).filter((n) => n.endsWith('.js'))) {
  if (/\bvitest\b/.test(readFileSync(new URL(f, dist), 'utf8'))) problems.push(`vitest referenced in dist/${f}`)
}
// Development-only warnings are guarded by the literal `process.env.NODE_ENV`, the one
// spelling host bundlers replace (globalThis.process?.env would stay undefined in a browser
// production build, and the warning would ship).
const indexJs = readFileSync(new URL('index.js', dist), 'utf8')
if (!/process\.env\.NODE_ENV/.test(indexJs)) problems.push('dist/index.js: dev-only warnings must read the literal process.env.NODE_ENV')
if (/globalThis\.process/.test(indexJs)) problems.push('dist/index.js: reads globalThis.process (bundlers do not replace it)')
// The sheet lives in one @layer ivories (checked by css-scope.mjs); no Tailwind.
const css = readFileSync(new URL('style.css', dist), 'utf8')
if (/tailwind|@apply/.test(css)) problems.push('dist/style.css contains Tailwind')
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
await import(new URL('core.js', dist).href)
await import(new URL('index.js', dist).href)
console.log('dist check: entries present, externals allowed, CSS plain, SSR import ok')
