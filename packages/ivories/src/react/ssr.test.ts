// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'

describe('SSR safety (spec §4)', () => {
  it('imports both entries without touching window', async () => {
    expect(typeof window).toBe('undefined')
    await expect(import('../index')).resolves.toBeDefined()
    await expect(import('../core/index')).resolves.toBeDefined()
  })

  it('renders a provider to a string without running its effects', async () => {
    const { renderToString } = await import('react-dom/server')
    const { IvoriesProvider } = await import('../index')
    const html = renderToString(createElement(IvoriesProvider, { score: null }, createElement('b', null, 'x')))
    expect(html).toBe('')
  })

  // The provider renders nothing on the server, so the stage root's inline
  // style is covered where it is built: the decoded template tokens and the
  // validated stageBgOverride, both checked by isCssColor's node fallback.
  it('a template or stage matte cannot smuggle CSS declarations into the root style', async () => {
    expect((globalThis as { CSS?: unknown }).CSS).toBeUndefined()
    const evil = 'rgb(0;position:fixed;inset:0;z-index:9;x:)'
    const { decodeTemplate, resolveTemplate } = await import('../core/index')
    const { validTheme } = await import('../core/settings/profile')
    const tpl = decodeTemplate({ v: 1, kind: 'ivories-template', id: 'evil', name: 'Evil', stage: { bg: evil } })
    expect(tpl.stage?.bg).toBeUndefined()
    expect(JSON.stringify(resolveTemplate(tpl).tokens)).not.toContain('position')
    expect(validTheme({ name: 'classic', stageBgOverride: evil })?.stageBgOverride).toBeNull()
  })
})
