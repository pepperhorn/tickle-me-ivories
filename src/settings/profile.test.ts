import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  PROFILE_SCHEMA_VERSION, buildProfile, decodeProfile, encodeProfile,
  isCssColor, loadGlobals, loadProfile, mergeVoices, saveGlobals, saveProfile,
} from './profile'
import { DEFAULT_SETTINGS, DEFAULT_TEXT_STYLE } from './types'
import { MAX_TEMPO_SCALE, MIN_TEMPO_SCALE } from '../model/tempoMap'
import type { Voice } from '../model/types'

const voice = (id: string, patch: Partial<Voice> = {}): Voice => ({
  id, label: id, hue: 200, instrument: 'acoustic_grand_piano',
  visible: true, audible: true, volume: 1, ...patch,
})

const profile = () => buildProfile({
  song: { id: 'sha-1', name: 'demo.mid', format: 'midi' },
  voices: [voice('l', { hue: 300, label: 'Bass' })],
  tempo: { mode: 'scale', scale: 0.75 },
  mode: 'keyboard',
  fallSeconds: 4.5,
  settings: DEFAULT_SETTINGS,
})

describe('profile encode/decode', () => {
  it('round-trips every song-scoped field', () => {
    const p = decodeProfile(encodeProfile(profile()))
    expect(p.song.id).toBe('sha-1')
    expect(p.voices[0].hue).toBe(300)
    expect(p.tempo).toEqual({ mode: 'scale', scale: 0.75 })
    expect(p.display).toMatchObject({ mode: 'keyboard', fallSeconds: 4.5 })
  })

  it('round-trips the display settings (zoom, grid, flash, middle C)', () => {
    const display = { zoom: 'full' as const, showGrid: false, showFlash: false, flashScale: 0.4, showMiddleC: false }
    const p = decodeProfile(encodeProfile(buildProfile({
      song: { id: 'sha-1', name: 'demo.mid', format: 'midi' },
      voices: [], tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 3,
      settings: { ...DEFAULT_SETTINGS, display },
    })))
    expect(p.display.settings).toEqual(display)
  })

  it('carries the global block as a separate snapshot', () => {
    const p = decodeProfile(encodeProfile(profile()))
    expect(p.global.velocity).toEqual(DEFAULT_SETTINGS.velocity)
    expect(p.global.audio).toEqual(DEFAULT_SETTINGS.audio)
  })

  it('stamps the current schema version', () => {
    expect(profile().schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
  })

  it('refuses an unknown schema version rather than half-applying it', () => {
    const raw = JSON.stringify({ ...profile(), schemaVersion: 99 })
    expect(() => decodeProfile(raw)).toThrow(/version/i)
  })

  it('refuses malformed JSON', () => {
    expect(() => decodeProfile('{ not json')).toThrow()
  })

  it('refuses an object that is missing its song block', () => {
    expect(() => decodeProfile(JSON.stringify({ schemaVersion: 1 }))).toThrow()
  })

  it('refuses a v1 file missing theme, text or global, and clamps an out-of-range tempo', () => {
    for (const key of ['theme', 'text', 'global'] as const) {
      const raw: Record<string, unknown> = { ...profile() }
      delete raw[key]
      expect(() => decodeProfile(JSON.stringify(raw))).toThrow(/missing/i)
    }
    const zeroScale = decodeProfile(JSON.stringify({ ...profile(), tempo: { mode: 'scale', scale: 0 } }))
    expect(zeroScale.tempo).toEqual({ mode: 'scale', scale: MIN_TEMPO_SCALE })
    const hugeScale = decodeProfile(JSON.stringify({ ...profile(), tempo: { mode: 'scale', scale: 50 } }))
    expect(hugeScale.tempo).toEqual({ mode: 'scale', scale: MAX_TEMPO_SCALE })
    const zeroBpm = decodeProfile(JSON.stringify({ ...profile(), tempo: { mode: 'absolute', bpm: 0 } }))
    expect(zeroBpm.tempo).toEqual({ mode: 'absolute', bpm: 20 })
    const hugeBpm = decodeProfile(JSON.stringify({ ...profile(), tempo: { mode: 'absolute', bpm: 9000 } }))
    expect(hugeBpm.tempo).toEqual({ mode: 'absolute', bpm: 300 })
  })
})

/** A valid exported profile with one path replaced, re-encoded as the raw JSON an import would see. */
function tampered(edit: (p: Record<string, any>) => void): string {
  const p = JSON.parse(encodeProfile(profile())) as Record<string, any>
  edit(p)
  return JSON.stringify(p)
}

describe('decodeProfile validation of untrusted input', () => {
  it('refuses a gradient velocity scheme with no stops', () => {
    expect(() => decodeProfile(tampered((p) => { p.global.velocity = { kind: 'gradient' } }))).toThrow(/velocity/i)
  })

  it('refuses a gradient stop with a non-numeric position', () => {
    expect(() => decodeProfile(tampered((p) => {
      p.global.velocity = { kind: 'gradient', stops: [{ at: 0, color: '#000' }, { at: 'x', color: '#fff' }] }
    }))).toThrow(/velocity/i)
  })

  it('refuses a lightness scheme with a missing field', () => {
    expect(() => decodeProfile(tampered((p) => { p.global.velocity = { kind: 'lightness', lMax: 78 } }))).toThrow(/velocity/i)
  })

  it('refuses an unknown velocity kind', () => {
    expect(() => decodeProfile(tampered((p) => { p.global.velocity = { kind: 'rainbow' } }))).toThrow(/velocity/i)
  })

  it('accepts a valid gradient scheme', () => {
    const stops = [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }]
    const p = decodeProfile(tampered((x) => { x.global.velocity = { kind: 'gradient', stops } }))
    expect(p.global.velocity).toEqual({ kind: 'gradient', stops })
  })

  it('refuses an empty audio block', () => {
    expect(() => decodeProfile(tampered((p) => { p.global.audio = {} }))).toThrow(/audio/i)
  })

  it('refuses a non-numeric master volume', () => {
    expect(() => decodeProfile(tampered((p) => { p.global.audio.masterVolume = 'loud' }))).toThrow(/audio/i)
  })

  it('refuses a master volume outside 0-1', () => {
    expect(() => decodeProfile(tampered((p) => { p.global.audio.masterVolume = 5 }))).toThrow(/audio/i)
  })

  it('refuses a missing metronome volume', () => {
    expect(() => decodeProfile(tampered((p) => { delete p.global.audio.metronomeVolume }))).toThrow(/audio/i)
  })

  it('refuses an unknown theme name', () => {
    expect(() => decodeProfile(tampered((p) => { p.theme = { name: 'neon', stageBgOverride: null } }))).toThrow(/theme/i)
  })

  it('refuses a theme with a non-string, non-null stageBgOverride', () => {
    expect(() => decodeProfile(tampered((p) => { p.theme = { name: 'classic', stageBgOverride: 7 } }))).toThrow(/theme/i)
  })

  it('refuses a theme missing its name', () => {
    expect(() => decodeProfile(tampered((p) => { p.theme = { stageBgOverride: null } }))).toThrow(/theme/i)
  })

  it('accepts a valid theme, including a matte override colour', () => {
    const p = decodeProfile(tampered((x) => { x.theme = { name: 'contrast', stageBgOverride: '#00b140' } }))
    expect(p.theme).toEqual({ name: 'contrast', stageBgOverride: '#00b140' })
  })

  it('drops a stageBgOverride that is not a colour, keeping the theme', () => {
    // A junk string reaches --tmi-stage-bg, the canvas cannot parse it, and
    // keeps whatever fill it last had -- so it is dropped to the theme token.
    const p = decodeProfile(tampered((x) => { x.theme = { name: 'contrast', stageBgOverride: 'not a colour!' } }))
    expect(p.theme).toEqual({ name: 'contrast', stageBgOverride: null })
    const q = decodeProfile(tampered((x) => { x.theme = { name: 'classic', stageBgOverride: '' } }))
    expect(q.theme.stageBgOverride).toBeNull()
  })

  it('drops text colours that are not colours back to the defaults', () => {
    const p = decodeProfile(tampered((x) => {
      x.text.style.color = 'url(javascript:1)'
      x.text.style.strokeColor = '#12345'
    }))
    expect(p.text.style.color).toBe(DEFAULT_TEXT_STYLE.color)
    expect(p.text.style.strokeColor).toBe(DEFAULT_TEXT_STYLE.strokeColor)
  })

  it('keeps valid text colours', () => {
    const p = decodeProfile(tampered((x) => {
      x.text.style.color = 'rgb(255, 200, 0)'
      x.text.style.strokeColor = 'black'
    }))
    expect(p.text.style.color).toBe('rgb(255, 200, 0)')
    expect(p.text.style.strokeColor).toBe('black')
  })

  it('drops voice entries that are not objects with a string id', () => {
    const p = decodeProfile(tampered((x) => { x.voices = [null, 7, { hue: 3 }, { id: 5 }, { id: 'l', hue: 40 }] }))
    expect(p.voices).toEqual([{ id: 'l', hue: 40 }])
  })

  it('omits voice fields of the wrong type so the parsed value survives the merge', () => {
    const p = decodeProfile(tampered((x) => {
      x.voices = [{ id: 'l', volume: 'x', hue: null, visible: 'yes', audible: 1, label: 9, instrument: {} }]
    }))
    expect(p.voices).toEqual([{ id: 'l' }])
    expect(mergeVoices([voice('l')], p.voices)[0]).toEqual(voice('l'))
  })

  it('clamps voice volume to 0-1 and hue to 0-360', () => {
    const p = decodeProfile(tampered((x) => { x.voices = [{ id: 'l', volume: 4, hue: -20 }] }))
    expect(p.voices[0]).toEqual({ id: 'l', volume: 1, hue: 0 })
  })

  it('refuses an unknown display mode', () => {
    expect(() => decodeProfile(tampered((p) => { p.display.mode = 'notation' }))).toThrow(/display mode/i)
  })

  it('refuses a non-numeric fall time', () => {
    expect(() => decodeProfile(tampered((p) => { p.display.fallSeconds = 'slow' }))).toThrow(/fall/i)
  })

  it('clamps a zero or huge fall time to the slider range', () => {
    expect(decodeProfile(tampered((p) => { p.display.fallSeconds = 0 })).display.fallSeconds).toBe(0.5)
    expect(decodeProfile(tampered((p) => { p.display.fallSeconds = -3 })).display.fallSeconds).toBe(0.5)
    expect(decodeProfile(tampered((p) => { p.display.fallSeconds = 99 })).display.fallSeconds).toBe(8)
  })

  it('drops an invalid display settings block instead of applying it', () => {
    const p = decodeProfile(tampered((x) => { x.display.settings = {} }))
    expect(p.display.settings).toBeUndefined()
    expect(p.display.mode).toBe('keyboard')
  })

  it('drops display settings with an unknown zoom', () => {
    const p = decodeProfile(tampered((x) => { x.display.settings.zoom = 'huge' }))
    expect(p.display.settings).toBeUndefined()
  })

  // Task 8 review carry-forward: text.* now reaches the DOM overlay (labels,
  // placement, font), so the block is validated field by field, not just isObj.
  it('round-trips a valid text block unchanged', () => {
    const p = decodeProfile(encodeProfile(profile()))
    expect(p.text).toEqual(DEFAULT_SETTINGS.text)
  })

  it('refuses an unknown note-label mode or placement', () => {
    expect(() => decodeProfile(tampered((p) => { p.text.labels = 'solfege' }))).toThrow(/text/i)
    expect(() => decodeProfile(tampered((p) => { p.text.labelPlacement = 'inside' }))).toThrow(/text/i)
  })

  it('refuses an unknown chord display or placement, or a non-boolean alternates flag', () => {
    expect(() => decodeProfile(tampered((p) => { p.text.chord = 'tab' }))).toThrow(/text/i)
    expect(() => decodeProfile(tampered((p) => { p.text.chordPlacement = 'nowhere' }))).toThrow(/text/i)
    expect(() => decodeProfile(tampered((p) => { p.text.chordAlternates = 'yes' }))).toThrow(/text/i)
  })

  it('refuses a key override that is neither null nor a string', () => {
    expect(() => decodeProfile(tampered((p) => { p.text.keyOverride = 7 }))).toThrow(/text/i)
    expect(decodeProfile(tampered((p) => { p.text.keyOverride = 'Eb major' })).text.keyOverride).toBe('Eb major')
  })

  it('refuses a missing or wrongly-typed text style field', () => {
    expect(() => decodeProfile(tampered((p) => { delete p.text.style }))).toThrow(/text/i)
    expect(() => decodeProfile(tampered((p) => { p.text.style.family = 12 }))).toThrow(/text/i)
    expect(() => decodeProfile(tampered((p) => { p.text.style.weight = 'bold' }))).toThrow(/text/i)
    expect(() => decodeProfile(tampered((p) => { p.text.style.color = null }))).toThrow(/text/i)
    expect(() => decodeProfile(tampered((p) => { delete p.text.style.strokeColor }))).toThrow(/text/i)
    expect(() => decodeProfile(tampered((p) => { p.text.style.opacity = 'half' }))).toThrow(/text/i)
  })

  it('clamps out-of-range text numbers to the control ranges', () => {
    const p = decodeProfile(tampered((x) => {
      x.text.chordWindowMs = 0
      Object.assign(x.text.style, { weight: 5000, sizeRatio: -1, letterSpacing: 9, opacity: 3, strokeWidth: -2 })
    }))
    expect(p.text.chordWindowMs).toBe(100)
    expect(p.text.style).toMatchObject({ weight: 900, sizeRatio: 0.2, letterSpacing: 0.3, opacity: 1, strokeWidth: 0 })
  })

  it('does not carry unknown keys from the text block through', () => {
    const p = decodeProfile(tampered((x) => { x.text.evil = '<script>'; x.text.style.extra = 1 }))
    expect(p.text).not.toHaveProperty('evil')
    expect(p.text.style).not.toHaveProperty('extra')
  })
})

describe('mergeVoices', () => {
  it('adopts the saved fields for voices matched by id', () => {
    const merged = mergeVoices([voice('l'), voice('r')], [voice('r', { hue: 12, label: 'Top', volume: 0.3 })])
    expect(merged[1]).toMatchObject({ id: 'r', hue: 12, label: 'Top', volume: 0.3 })
  })

  it('leaves unmatched parsed voices at their parsed defaults', () => {
    const merged = mergeVoices([voice('l'), voice('r')], [voice('r', { hue: 12 })])
    expect(merged[0].hue).toBe(200)
  })

  it('ignores saved voices that no longer exist in the file', () => {
    const merged = mergeVoices([voice('l')], [voice('ghost', { hue: 9 })])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('l')
  })

  it('never lets a saved profile change a voice id', () => {
    const merged = mergeVoices([voice('l')], [{ ...voice('l'), id: 'tampered' } as Voice])
    expect(merged[0].id).toBe('l')
  })
})

describe('localStorage persistence', () => {
  beforeEach(() => { localStorage.clear() })

  it('saves and reloads a profile by song hash', () => {
    saveProfile(profile())
    expect(loadProfile('sha-1')!.voices[0].label).toBe('Bass')
  })

  it('returns null for a song it has never seen', () => {
    expect(loadProfile('nothing')).toBeNull()
  })

  it('returns null rather than throwing on a corrupt stored value', () => {
    localStorage.setItem('tmi.profile.broken', '{{{')
    expect(loadProfile('broken')).toBeNull()
  })

  it('returns null for stored globals with an invalid velocity scheme', () => {
    localStorage.setItem('tmi.globals', JSON.stringify({ velocity: { kind: 'gradient' }, audio: DEFAULT_SETTINGS.audio }))
    expect(loadGlobals()).toBeNull()
  })

  it('returns null for stored globals with invalid audio values', () => {
    localStorage.setItem('tmi.globals', JSON.stringify({ velocity: DEFAULT_SETTINGS.velocity, audio: { masterVolume: 'x' } }))
    expect(loadGlobals()).toBeNull()
  })

  it('stores globals under their own key, independent of any song', () => {
    saveGlobals({ velocity: DEFAULT_SETTINGS.velocity, audio: { ...DEFAULT_SETTINGS.audio, masterVolume: 0.2 } })
    expect(loadGlobals()!.audio.masterVolume).toBe(0.2)
    expect(loadProfile('sha-1')).toBeNull()
  })
})

describe('isCssColor', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("defers to the browser's CSS.supports when it has one", () => {
    const supports = vi.fn((_p: string, v: string) => v === 'rebeccapurple')
    vi.stubGlobal('CSS', { supports })
    expect(isCssColor('rebeccapurple')).toBe(true)
    expect(isCssColor('#fff')).toBe(false)
    expect(supports).toHaveBeenCalledWith('color', 'rebeccapurple')
  })

  it('falls back to a syntax check where CSS.supports is missing (jsdom)', () => {
    vi.stubGlobal('CSS', undefined)
    for (const v of ['#fff', '#00b140', '#00b14080', 'rgba(0,0,0,0.35)', 'hsl(210 50% 40%)', 'black', 'transparent'])
      expect(isCssColor(v), v).toBe(true)
    for (const v of ['', ' ', '#12345', '#ggg', 'not a colour!', 'url(javascript:1)', 'red; background: x', 'rgb(1,2'])
      expect(isCssColor(v), v).toBe(false)
  })
})
