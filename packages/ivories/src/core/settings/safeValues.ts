// Checks for strings that end up in CSS or on a canvas. Kept apart from
// profile.ts so the template decoder can use them without an import cycle.

/** Spec §8.5: a colour string is at most 64 characters. */
const MAX_COLOR_CHARS = 64

/** Hex (#rgb, #rgba, #rrggbb, #rrggbbaa), a colour function with balanced
    parentheses, or a bare keyword. Only the fallback where the browser cannot
    be asked (jsdom has no CSS.supports); it is a shape check, not a parser. */
const COLOR_SYNTAX =
  /^(#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|[a-z]+)$/i

/**
 * Whether a string is a colour the browser will actually paint. A string that
 * is not (say `'not a colour!'`) is silently ignored by both CSS and the
 * canvas's fillStyle, which then keeps its PREVIOUS fill -- so an imported junk
 * stage colour renders as whatever was drawn last. Asks the browser via
 * CSS.supports where it exists, and falls back to a syntax check otherwise.
 */
export function isCssColor(v: string): boolean {
  // Spec §8.5 caps colours at 64 characters; nothing a colour picker makes
  // comes close, and it bounds what an untrusted payload can hand the browser.
  if (v.length > MAX_COLOR_CHARS) return false
  const css = (globalThis as { CSS?: { supports?: (prop: string, value: string) => boolean } }).CSS
  if (typeof css?.supports === 'function') return css.supports('color', v)
  return COLOR_SYNTAX.test(v.trim())
}

/**
 * A Google Fonts family name: letters, digits and spaces only, starting with
 * an alphanumeric, up to 64 characters. Spec §8.5. Anything else can break out
 * of the `font-family` CSS declaration (a quote, a `;`, a `url(...)`), so a
 * family that fails this is never trusted verbatim.
 */
export const FONT_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$/

export function isSafeFontFamily(s: string): boolean {
  return FONT_FAMILY_RE.test(s)
}
