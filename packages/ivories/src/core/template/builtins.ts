// The built-in style templates (spec table order). Deep-frozen: resolution
// copies, never mutates.
import type { BuiltinTemplateId, IvoriesTemplateV1 } from './types'

export const BUILTIN_TEMPLATE_IDS: readonly BuiltinTemplateId[] = Object.freeze([
  'classic', 'classic-crf', 'chord-cards', 'chord-cards-crf', 'outline', 'contrast', 'transparent',
] as const)

const base = (id: BuiltinTemplateId, name: string, rest: Partial<IvoriesTemplateV1> = {}): IvoriesTemplateV1 =>
  ({ v: 1, kind: 'ivories-template', id, name, ...rest })

const INK = '#231f20'

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

export const BUILTIN_TEMPLATES: Readonly<Record<BuiltinTemplateId, IvoriesTemplateV1>> = deepFreeze({
  classic: base('classic', 'Classic'),
  'classic-crf': base('classic-crf', 'Classic + CRF colours', {
    extends: 'classic', colour: { mode: 'pitch' }, flash: { tint: 'note' },
  }),
  'chord-cards': base('chord-cards', 'Chord cards', {
    stage: {
      bg: '#fbf8f1',
      gridLine: 'rgba(35,31,32,0.08)',
      gridLineC4: 'rgba(35,31,32,0.18)',
      beatLine: 'rgba(35,31,32,0.08)',
      barLine: 'rgba(35,31,32,0.2)',
      middleCMark: 'rgba(35,31,32,0.55)',
      progressTrack: 'rgba(35,31,32,0.08)',
      progressFill: INK,
      countInInk: 'rgba(35,31,32,0.3)',
    },
    keys: {
      white: '#fafafa', black: '#222222', border: 'transparent', borderWidth: 1, gap: 1,
      whiteRadius: 3, blackRadius: 2, outline: '#333333',
      raised: { enabled: true, shadowColor: INK, shadowDepth: 2, lipColor: '#4a4a4a', lipDepth: 6 },
      plate: { enabled: true, fill: '#ffffff', borderColor: INK, borderWidth: 2, shadowColor: INK, shadowDepth: 4, padding: 6 },
    },
    bars: { radius: 4, outlineColor: INK, outlineWidth: 1.5, shadowColor: INK, shadowDepth: 2, shading: 'flat' },
    colour: { mode: 'hand' },
    flash: { tint: 'note' },
  }),
  'chord-cards-crf': base('chord-cards-crf', 'Chord cards + CRF colours', {
    extends: 'chord-cards', colour: { mode: 'pitch' }, flash: { tint: 'note' },
  }),
  outline: base('outline', 'Outline'),
  contrast: base('contrast', 'High contrast'),
  transparent: base('transparent', 'Transparent'),
})

export function isBuiltinTemplateId(v: unknown): v is BuiltinTemplateId {
  return typeof v === 'string' && (BUILTIN_TEMPLATE_IDS as readonly string[]).includes(v)
}
