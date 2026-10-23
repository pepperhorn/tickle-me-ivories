import { useEffect, useState } from 'react'
import { ensureGoogleFont } from './googleFont'
import { isSafeFontFamily } from '../../core/settings/safeValues'

const DEFAULT_CANVAS_FONT = 'Poppins, sans-serif'

/**
 * The CSS font-family list a canvas should draw with. This is the only way a
 * label family reaches `ctx.font`: an unsafe family becomes Poppins, a safe one
 * is quoted. Poppins is hosted by the page, so it returns at once; any other
 * family is requested from Google Fonts and the hook answers 'sans-serif'
 * until `document.fonts.load` settles, then swaps to the family once (the next
 * frame redraws). Without `document.fonts` (jsdom, old engines) it answers
 * the family at once.
 */
export function useCanvasFont(family: string, weight: number): string {
  const name = family.trim() !== '' && isSafeFontFamily(family.trim()) ? family.trim() : 'Poppins'
  const external = name !== 'Poppins'
  const key = `${weight} ${name}`
  const [loaded, setLoaded] = useState<string | null>(null)
  const hasFonts = typeof document !== 'undefined' && typeof document.fonts?.load === 'function'

  useEffect(() => {
    if (!external) return
    ensureGoogleFont(name, [weight])
    if (!hasFonts) return
    let live = true
    const settle = () => { if (live) setLoaded(key) }
    document.fonts.load(`${weight} 16px "${name}"`).then(settle, settle)
    return () => { live = false }
  }, [external, name, weight, key, hasFonts])

  if (!external) return DEFAULT_CANVAS_FONT
  if (!hasFonts) return `"${name}", sans-serif`
  return loaded === key ? `"${name}", sans-serif` : 'sans-serif'
}
