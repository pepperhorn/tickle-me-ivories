import { DEFAULT_SETTINGS } from './types'
import { applyLook } from '../platform/look'
import type { Settings, ThemeName } from './types'
import type { LookV1 } from '../platform/types'
import type { TemplateRef } from '../template/types'

/** Defaults, then a look, then explicit settings, then the theme shorthand. */
export function resolveSettings(o: { settings?: Partial<Settings>; look?: LookV1; theme?: ThemeName; template?: TemplateRef }): Settings {
  const s: Settings = structuredClone(DEFAULT_SETTINGS)
  if (o.look) {
    const a = applyLook(o.look)
    s.theme = a.theme
    s.display = a.display
    s.velocity = a.velocity
    s.text = { ...a.text, keyOverride: null }
  }
  if (o.settings) Object.assign(s, structuredClone(o.settings))
  if (o.theme) s.theme = { ...s.theme, name: o.theme }
  // An explicit theme preset replaces a template carried by a look or settings;
  // an explicit template prop wins over both (trusted like `theme`).
  if (o.theme && !o.template) delete s.theme.template
  if (o.template) s.theme = { ...s.theme, template: o.template }
  return s
}
