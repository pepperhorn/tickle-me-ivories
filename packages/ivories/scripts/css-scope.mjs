#!/usr/bin/env node
// Every library rule is scoped under .ivories (spec §2): no page selectors,
// viewport units, fixed positions, @font-face or unprefixed keyframes.
import { readFileSync } from 'node:fs'
import postcss from 'postcss'

const file = new URL('../src/style.css', import.meta.url)
const root = postcss.parse(readFileSync(file, 'utf8'), { from: 'src/style.css' })
const problems = []
// The whole sheet sits in ONE top-level `@layer ivories { … }` so a host's
// unlayered CSS (Tailwind utilities included) always wins over the defaults.
const top = root.nodes.filter((n) => n.type !== 'comment')
const layers = top.filter((n) => n.type === 'atrule' && n.name === 'layer' && n.params === 'ivories' && n.nodes)
if (layers.length !== 1) problems.push(`expected exactly one top-level @layer ivories block, found ${layers.length}`)
for (const n of top) {
  if (layers.includes(n)) continue
  const what = n.type === 'rule' ? `rule "${n.selector}"` : n.type === 'atrule' ? `@${n.name} ${n.params}` : n.type
  problems.push(`${what} sits outside @layer ivories`)
}
root.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return
  for (const selector of rule.selectors) {
    if (!/^\.ivories(?![\w-])/.test(selector)) problems.push(`unscoped selector "${selector}"`)
    if (/(^|[\s,>+~(])(html|body)(?![\w-])|:root/.test(selector)) problems.push(`page-level selector "${selector}"`)
    for (const m of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
      if (m[1] !== 'ivories' && !m[1].startsWith('ivories-')) problems.push(`class .${m[1]} is not prefixed ivories- in "${selector}"`)
    }
  }
})
root.walkAtRules((rule) => {
  if (/keyframes$/.test(rule.name) && !rule.params.startsWith('ivories-')) problems.push(`@keyframes ${rule.params} must start with ivories-`)
  if (rule.name === 'font-face') problems.push('@font-face is the host\'s job')
  if (rule.name === 'media' && /width|height|orientation|aspect/.test(rule.params)) problems.push(`viewport query @media ${rule.params}`)
})
root.walkDecls((decl) => {
  if (decl.prop === 'position' && decl.value === 'fixed') problems.push(`position:fixed in ${decl.parent.selector}`)
  if (/\d(d|s|l)?v(h|w|min|max)\b/.test(decl.value)) problems.push(`viewport unit in ${decl.parent.selector} { ${decl.prop}: ${decl.value} }`)
})
if (problems.length) {
  console.error(`CSS scope check failed:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log('CSS scope: one @layer ivories, every rule under .ivories, prefixed classes, no page selectors, viewport units or fixed positions')
