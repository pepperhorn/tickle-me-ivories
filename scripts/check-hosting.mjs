#!/usr/bin/env node
// Hosting guard (runbook §3.7): the CSP keeps audio, fonts and the gateway
// working, every nginx location re-includes the security headers, the SPA
// fallback exists, and the plugin config/bundle 404 instead of falling back.
import { readFileSync } from 'node:fs'

const conf = readFileSync(process.env.NGINX_CONF ?? 'deploy/nginx.conf', 'utf8')
const headers = readFileSync(process.env.NGINX_HEADERS ?? 'deploy/security-headers.conf', 'utf8')
const problems = []

const csp = /Content-Security-Policy "([^"]+)"/.exec(headers)?.[1]
if (!csp) problems.push('security-headers.conf has no Content-Security-Policy')
const directive = (name) =>
  (csp ?? '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `))?.split(/\s+/).slice(1) ?? []

const need = {
  'connect-src': ["'self'", 'https://apps.pepperhorn.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com',
    'https://smpldsnds.github.io', 'https://gleitz.github.io', 'https://goldst.dev'],
  'script-src': ["'self'"],
  'style-src': ['https://fonts.googleapis.com'],
  'font-src': ['https://fonts.gstatic.com'],
  'worker-src': ['blob:'],
  'object-src': ["'none'"],
}
for (const [d, values] of Object.entries(need)) {
  for (const v of values) if (!directive(d).includes(v)) problems.push(`CSP ${d} lacks ${v}`)
}
if (directive('script-src').some((v) => v.includes('unsafe'))) problems.push("CSP script-src must not allow 'unsafe-*'")

const pp = /Permissions-Policy "([^"]+)"/.exec(headers)?.[1] ?? ''
for (const f of ['camera', 'microphone', 'midi']) {
  if (!new RegExp(`(^|,\\s*)${f}=\\(self\\)(,|$)`).test(pp)) problems.push(`Permissions-Policy must allow ${f}=(self)`)
}

for (const m of conf.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)) {
  if (!m[2].includes('include /etc/nginx/snippets/security-headers.conf;')) {
    problems.push(`location ${m[1].trim()} does not include the security headers`)
  }
}
if (!/try_files \$uri \$uri\/ \/index\.html;/.test(conf)) problems.push('SPA fallback missing: /s/<code> needs index.html')
if (!/location = \/tickle\.config\.json\s*\{[^}]*try_files \$uri =404;/.test(conf)) problems.push('/tickle.config.json must 404 when absent')
if (!/location \/plugins\/\s*\{[^}]*try_files \$uri =404;/.test(conf)) problems.push('/plugins/ must 404 when absent')

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('hosting config ok')
