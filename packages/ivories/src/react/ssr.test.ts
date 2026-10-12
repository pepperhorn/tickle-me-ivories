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
})
