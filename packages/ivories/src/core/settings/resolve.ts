import { DEFAULT_SETTINGS } from './types'
import { applyLook } from '../platform/look'
import type { Settings, ThemeName } from './types'
import type { LookV1 } from '../platform/types'

/** Defaults, then a look, then explicit settings, then the theme shorthand. */
export function resolveSettings(o: { settings?: Partial<Settings>; look?: LookV1; theme?: ThemeName }): Settings {
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
  return s
}
