// Which CSS theme preset each built-in template sits on. Internal: not
// re-exported from core/index.ts.
import type { ThemeName } from '../settings/types'
import type { BuiltinTemplateId } from './types'

export const CSS_THEME_OF: Readonly<Record<BuiltinTemplateId, ThemeName>> = Object.freeze({
  classic: 'classic',
  'classic-crf': 'classic',
  'chord-cards': 'classic',
  'chord-cards-crf': 'classic',
  outline: 'outline',
  contrast: 'contrast',
  transparent: 'transparent',
})
