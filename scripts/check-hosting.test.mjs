import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (env = {}) => spawnSync(process.execPath, ['scripts/check-hosting.mjs'], { encoding: 'utf8', env: { ...process.env, ...env } })

test('the committed config passes', () => {
  const r = run()
  assert.equal(r.status, 0, r.stderr)
})

test('a location that sets headers without the snippet fails (Review Focus 4)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nginx-'))
  const conf = readFileSync('deploy/nginx.conf', 'utf8').replace(
    /location \/assets\/ \{[^}]*\}/,
    'location /assets/ {\n    add_header Cache-Control "public, max-age=31536000, immutable" always;\n  }',
  )
  writeFileSync(join(dir, 'nginx.conf'), conf)
  const r = run({ NGINX_CONF: join(dir, 'nginx.conf') })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /location \/assets\/ does not include the security headers/)
})

test('a CSP without the smplr sample hosts fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nginx-'))
  writeFileSync(join(dir, 'h.conf'), readFileSync('deploy/security-headers.conf', 'utf8').replace(' https://goldst.dev', ''))
  const r = run({ NGINX_HEADERS: join(dir, 'h.conf') })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /connect-src lacks https:\/\/goldst\.dev/)
})

test('a Permissions-Policy that blocks midi fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nginx-'))
  writeFileSync(join(dir, 'h.conf'), readFileSync('deploy/security-headers.conf', 'utf8').replace('midi=(self)', 'midi=()'))
  const r = run({ NGINX_HEADERS: join(dir, 'h.conf') })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /Permissions-Policy must allow midi=\(self\)/)
})
