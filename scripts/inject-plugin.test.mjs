import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { injectPlugin } from './inject-plugin.mjs'

const dist = () => mkdtempSync(join(tmpdir(), 'inject-'))
const sha = (b) => createHash('sha256').update(b).digest('hex')

test('empty args leave an open build untouched', async () => {
  const d = dist()
  assert.deepEqual(await injectPlugin({ distDir: d, url: '', sha256: '' }), { injected: false })
  assert.equal(existsSync(join(d, 'tickle.config.json')), false)
})

test('one arg without the other is refused', async () => {
  await assert.rejects(injectPlugin({ distDir: dist(), url: 'https://x.test/p.js', sha256: '' }), /set together/)
  await assert.rejects(injectPlugin({ distDir: dist(), url: '', sha256: 'a'.repeat(64) }), /set together/)
})

test('a file: bundle with the right hash is installed with its config', async () => {
  const src = join(dist(), 'bundle.js')
  writeFileSync(src, 'export default () => ({})\n')
  const d = dist()
  const r = await injectPlugin({ distDir: d, url: pathToFileURL(src).href, sha256: sha(readFileSync(src)) })
  assert.equal(r.injected, true)
  assert.equal(readFileSync(join(d, 'plugins', 'tickle-ph-plugin.js'), 'utf8'), 'export default () => ({})\n')
  assert.deepEqual(JSON.parse(readFileSync(join(d, 'tickle.config.json'), 'utf8')), { plugins: ['/plugins/tickle-ph-plugin.js'] })
})

test('a hash mismatch writes nothing', async () => {
  const src = join(dist(), 'bundle.js')
  writeFileSync(src, 'tampered')
  const d = dist()
  await assert.rejects(injectPlugin({ distDir: d, url: pathToFileURL(src).href, sha256: 'b'.repeat(64) }), /sha256 mismatch/)
  assert.equal(existsSync(join(d, 'tickle.config.json')), false)
})

test('plain http and failed downloads are refused', async () => {
  await assert.rejects(injectPlugin({ distDir: dist(), url: 'http://x.test/p.js', sha256: 'a'.repeat(64) }), /https:\/\/ or file:/)
  const fetchImpl = async () => new Response('no', { status: 404 })
  await assert.rejects(injectPlugin({ distDir: dist(), url: 'https://x.test/p.js', sha256: 'a'.repeat(64), fetchImpl }), /HTTP 404/)
})
