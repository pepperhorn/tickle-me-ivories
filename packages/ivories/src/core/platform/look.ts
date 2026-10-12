// The look codec (spec §8.1, §8.5, §9.1). Pure: no DOM, no storage.
//
// A look is the song-independent half of a scene: theme, display, on-stage
// text and the velocity colours. It never carries voices, tempo, keyOverride
// (song-specific) or audio (a per-device preference).

import type { LookV1 } from './types'
import { invalidPayload, isObj, readEnvelope } from './codec'
import {
  validDisplayMode, validDisplaySettings, validFallSeconds, validText, validTheme, validVelocity,
} from '../settings/profile'
import type { DisplayMode } from '../model/types'
import type { DisplaySettings, Settings, TextSettings, ThemeSettings, VelocityScheme } from '../settings/types'

export type { LookV1 } from './types'

/** Spec §8.5: a look serializes to at most 16 KiB. */
export const MAX_LOOK_BYTES = 16 * 1024

export function lookFromSettings(s: Settings, mode: DisplayMode, fallSeconds: number): LookV1 {
  const { keyOverride: _keyOverride, ...text } = s.text
  return structuredClone({
    v: 1, kind: 'look',
    theme: s.theme,
    display: { mode, fallSeconds, settings: s.display },
    text,
    velocity: s.velocity,
  })
}

/**
 * Decodes an untrusted look (a parsed value or its JSON string). Throws a
 * PlatformError -- see codec.ts for the contract. Every block goes through the
 * same validators a profile import uses (no copies), and unknown keys, any
 * keyOverride and any audio are dropped.
 */
export function decodeLook(u: unknown): LookV1 {
  const o = readEnvelope(u, 'look', MAX_LOOK_BYTES)
  const theme = validTheme(o.theme)
  if (!theme) throw invalidPayload('look', 'invalid theme')
  if (!isObj(o.display)) throw invalidPayload('look', 'missing display block')
  const mode = validDisplayMode(o.display.mode)
  if (!mode) throw invalidPayload('look', 'invalid display mode')
  const fallSeconds = validFallSeconds(o.display.fallSeconds)
  if (fallSeconds === null) throw invalidPayload('look', 'invalid fall time')
  const settings = validDisplaySettings(o.display.settings)
  if (!settings) throw invalidPayload('look', 'invalid display settings')
  const text = validText(o.text, { keyOverride: false })
  if (!text) throw invalidPayload('look', 'invalid on-stage text settings')
  const velocity = validVelocity(o.velocity)
  if (!velocity) throw invalidPayload('look', 'invalid velocity colour scheme')
  return { v: 1, kind: 'look', theme, display: { mode, fallSeconds, settings }, text, velocity }
}

/**
 * What applying a look changes (preflight F10b). `text` has no keyOverride:
 * the caller merges in the current song's keyOverride. There is no audio.
 */
export interface LookApply {
  theme: ThemeSettings
  display: DisplaySettings
  velocity: VelocityScheme
  text: Omit<TextSettings, 'keyOverride'>
  mode: DisplayMode
  fallSeconds: number
}

export function applyLook(l: LookV1): LookApply {
  return structuredClone({
    theme: l.theme,
    display: l.display.settings,
    velocity: l.velocity,
    text: l.text,
    mode: l.display.mode,
    fallSeconds: l.display.fallSeconds,
  })
}
