export interface Theme {
  stageBg: string
  keyWhite: string
  keyBlack: string
  keyBorder: string
  keyBorderWidth: number
  keyRadius: number
  keyGap: number
  middleCMark: string
  blackKeyTop: string
  gridLine: string
  gridLineC4: string
  gridLineWidth: number
  gridLineDash: number[]
  barRadius: number
  /** Bare "r, g, b" -- the flash's alpha is per-frame, so it cannot be baked in. */
  flashCoreRgb: string
  flashWarmRgb: string
  progressTrack: string
  progressFill: string
}

export const DEFAULT_THEME: Theme = {
  stageBg: '#000000',
  keyWhite: '#f6f2e4',
  keyBlack: '#0c0c10',
  keyBorder: 'rgba(255,255,255,0.16)',
  keyBorderWidth: 1,
  keyRadius: 0,
  keyGap: 1,
  middleCMark: 'rgba(0,0,0,0.55)',
  blackKeyTop: 'rgba(255,255,255,0.35)',
  gridLine: 'rgba(255,255,255,0.06)',
  gridLineC4: 'rgba(255,255,255,0.14)',
  gridLineWidth: 1,
  gridLineDash: [],
  barRadius: 4,
  flashCoreRgb: '255, 255, 255',
  flashWarmRgb: '255, 242, 214',
  progressTrack: 'rgba(255,255,255,0.06)',
  progressFill: '#e8384f',
}

export type StyleReader = (el: Element) => Pick<CSSStyleDeclaration, 'getPropertyValue'>

export function parsePx(value: string, fallback: number): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

/** Spec §14.1: solid -> [], dashed -> [6,4], dotted -> [1,3], scaled by width. */
export function lineDash(style: string, width: number): number[] {
  const w = width > 0 ? width : 1
  switch (style.trim()) {
    case 'dashed': return [6 * w, 4 * w]
    case 'dotted': return [1 * w, 3 * w]
    default: return []
  }
}

/** getComputedStyle normalises `transparent` to `rgba(0, 0, 0, 0)`, so both forms
    have to be recognised or §13.1's transparent stage silently paints black.
    F27: the modern `rgb(0 0 0 / 0)` form separates the alpha with a space before
    the slash, so splitting only on `,`/`/` leaves the last channel and the alpha
    fused together; splitting on any run of commas/slashes/whitespace fixes it. */
export function isTransparent(color: string): boolean {
  const c = color.trim().toLowerCase()
  if (c === 'transparent') return true
  const m = /^rgba?\(([^)]*)\)$/.exec(c)
  if (!m) return false
  const parts = m[1].split(/[\s,/]+/).map((s) => s.trim()).filter(Boolean)
  return parts.length === 4 && Number.parseFloat(parts[3]) === 0
}

/**
 * Resolves every --tmi-* token into a plain object. Call ONCE per layout or
 * theme change and cache it: getComputedStyle forces a style recalculation and
 * would cost more per frame than the drawing does.
 */
export function readTheme(
  el: Element | null,
  read: StyleReader = (e) => getComputedStyle(e),
): Theme {
  if (!el) return { ...DEFAULT_THEME }
  const style = read(el)
  const raw = (token: string) => style.getPropertyValue(token).trim()
  const str = (token: string, fallback: string) => raw(token) || fallback
  const num = (token: string, fallback: number) => parsePx(raw(token), fallback)

  const gridLineWidth = num('--tmi-grid-line-width', DEFAULT_THEME.gridLineWidth)

  return {
    stageBg: str('--tmi-stage-bg', DEFAULT_THEME.stageBg),
    keyWhite: str('--tmi-key-white', DEFAULT_THEME.keyWhite),
    keyBlack: str('--tmi-key-black', DEFAULT_THEME.keyBlack),
    keyBorder: str('--tmi-key-border', DEFAULT_THEME.keyBorder),
    keyBorderWidth: num('--tmi-key-border-width', DEFAULT_THEME.keyBorderWidth),
    keyRadius: num('--tmi-key-radius', DEFAULT_THEME.keyRadius),
    keyGap: num('--tmi-key-gap', DEFAULT_THEME.keyGap),
    middleCMark: str('--tmi-middle-c-mark', DEFAULT_THEME.middleCMark),
    blackKeyTop: str('--tmi-black-key-top', DEFAULT_THEME.blackKeyTop),
    gridLine: str('--tmi-grid-line', DEFAULT_THEME.gridLine),
    gridLineC4: str('--tmi-grid-line-c4', DEFAULT_THEME.gridLineC4),
    gridLineWidth,
    gridLineDash: lineDash(raw('--tmi-grid-line-style'), gridLineWidth),
    barRadius: num('--tmi-bar-radius', DEFAULT_THEME.barRadius),
    flashCoreRgb: str('--tmi-flash-core-rgb', DEFAULT_THEME.flashCoreRgb),
    flashWarmRgb: str('--tmi-flash-warm-rgb', DEFAULT_THEME.flashWarmRgb),
    progressTrack: str('--tmi-progress-track', DEFAULT_THEME.progressTrack),
    progressFill: str('--tmi-progress-fill', DEFAULT_THEME.progressFill),
  }
}
