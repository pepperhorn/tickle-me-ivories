# Settings, Voices and Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the shipped playback engine into a configurable instrument — master tempo, per-voice colour/instrument/volume, velocity schemes, keyboard zoom, saved profiles — and make the stage compositable over live video with a CSS token theme system, note labels, chord symbols and roman numerals.

**Architecture:** Two Zustand stores, no duplication: `useTransport` keeps what it already owns (score, clock, tempo, fall speed, display mode); a new `useSettings` owns everything else and is the single serialisable surface the profile writes. Theming reaches the canvas through CSS custom properties resolved **once per layout or theme change** by `readTheme(el)` into a plain `Theme` object that rides on `RenderState` — the renderers stay pure functions of `(ctx, state, t)`. On-stage text is real DOM in an overlay positioned from the same `computeLayout` geometry the canvas uses. Audio gains a per-voice `GainNode` bus so volume is level, not timbre.

**Tech Stack:** The shipped stack — Vite, React 19, TypeScript, Tailwind v4, Zustand, Canvas 2D, `@tonejs/midi`, `smplr`, `@fontsource/poppins`, Vitest — plus **`tonal` ^6.4.3** for chord identification and roman numerals.

**Spec:** `docs/superpowers/specs/2026-09-12-piano-visualizer-design.md` (§7 colour, §8 zoom, §9 settings, §10 persistence, §13 transparency, §14 theming, §15 on-stage text, §16 debug mode)

**Handover carried in:** `docs/superpowers/handover/2026-09-12-core-playback-engine-handover.md`

## Global Constraints

- **Verify with `npm run build`, never `npx tsc --noEmit`.** The latter reads the root `tsconfig.json` and skips `tsconfig.app.json`, which is where `strict` and `erasableSyntaxOnly` live. A build breakage hid behind exactly that gap during plan 1.
- **Typography:** Poppins for all *UI* chrome, self-hosted via `@fontsource/poppins`. The on-stage *text overlay* (§15) is the one place a Google Fonts `<link>` is allowed, because the font is a user setting chosen at runtime.
- **CSS:** Tailwind utilities, and **every element carries a contextual semantic class name alongside them** — `className="voice-row flex items-center gap-3"`. Non-negotiable.
- **Dev server:** always `npm run dev -- --host 0.0.0.0`.
- **Per-voice volume must NOT fold into velocity.** On a velocity-layered sampled piano, velocity selects the sample *layer*, so folding volume into it changes timbre: a quiet voice would sound gently struck rather than quieter. Task 3 replaces `foldVelocity` with a real gain bus. This is the single most important carry-forward from plan 1.
- **`setTempo` must be paired with `engine.stopAll()`,** exactly as `seek` and `pause` already are in `App.tsx`. Notes already handed to smplr at old times keep sounding across a tempo change otherwise.
- **`LOOKAHEAD_SEC` (0.15) must stay below smplr's internal 200 ms scheduler lookahead.** Below it, every note handed over becomes a live voice almost immediately, which is *why* `engine.stopAll()` can cancel pending notes. Raise it past 200 ms and `stopAll()` silently stops cancelling.
- **Tempo scale keeps its 25% minimum.** `ticksToSec` guards with `Math.max(0.01, scale)`, but a scale of 0 must never reach it from the UI.
- **The canvas render path stays a pure function of `t`.** No stored frame state, no allocation in the draw loop. Layout and theme are both cached by identity in `App.tsx` for exactly this reason — follow that pattern for anything new.
- **`readTheme` runs once per layout or theme change, never per frame.** `getComputedStyle` forces a style recalculation and would cost more than the drawing does.
- **Keyboard geometry constants are fixed** and must not be adjusted: `blackWRatio` 0.5652, `aspect` 5.8, `blackLenRatio` 0.655, black-key offsets C# `-b/6`, D# `+b/6`, F# `-b/4`, G# `0`, A# `+b/4`.
- **Reference rig:** `tools/strike-lab.html` is the authority on visual constants. If code and spec disagree, the rig is right.

## Out of scope for this plan

- **§13.3 alpha-preserving export.** The spec deliberately does not bundle it: `MediaRecorder`'s alpha support in WebM is uneven and the PNG-sequence fallback is an offline renderer, not a feature. §13.1's transparent stage is composited natively by an OBS browser source, which is what the driving use case actually needs.
- MusicXML, Verovio notation, live MIDI input — plans 3 and 4.

---

## File Structure

```
src/
  App.tsx                    MODIFIED by nearly every task: it owns the wiring
  index.css                  MODIFIED: --tmi-* tokens and the theme classes

  settings/
    types.ts                 Settings, VelocityScheme, TextSettings, ThemeName...
    useSettings.ts           Zustand store: the serialisable settings surface
    profile.ts               profile JSON encode/decode + localStorage autosave

  music/
    spell.ts                 MIDI number -> spelled note name, key-aware
    chords.ts                rolling-window pitch set -> chord symbol (tonal)
    romanNumerals.ts         chord symbol + key -> roman numeral (tonal)
    keyOf.ts                 score key signature -> tonal key string

  model/
    search.ts                lowerBoundByStart, shared by the roll and the chords
    types.ts                 MODIFIED: beatsPerBar, keySignature on ScoreDocument
    tempoMap.ts              MODIFIED: effectiveBpmAt + the scale bounds

  render/
    theme.ts                 Theme interface, DEFAULT_THEME, readTheme(el)
    shapes.ts                roundRect, shared by the keyboard and the roll
    geometry.ts              MODIFIED: pitch-range zoom + ensureFullBlackKeyGroups
    colors.ts                MODIFIED: VelocityScheme-aware noteColor
    keyboard.ts              MODIFIED: consumes Theme, no colour literals
    pianoRoll.ts             MODIFIED: consumes Theme, transparent stage, flash scale

  audio/
    engine.ts                MODIFIED: per-voice GainNode bus, shared SampleLoader
    metronome.ts             tempo-map-driven click on the shared clock

  ui/
    SettingsPanel.tsx        the dropdown shell + section primitives
    TempoControl.tsx         scale% / absolute BPM, effective-BPM readout
    VoicePanel.tsx           per-voice colour, label, instrument, mute, volume
    VelocityEditor.tsx       scheme selector, lightness range, gradient stops
    DisplaySettings.tsx      fall speed, zoom, grid, flash, middle C
    ThemeSettings.tsx        preset picker, stage background, key style
    TextSettings.tsx         labels, chord readout, roman numerals, typography
    ProfileSettings.tsx      export / import / reset
    StageText.tsx            the DOM overlay: per-pitch note labels
    ChordReadout.tsx         the DOM overlay: chord symbol and roman numeral
    googleFont.ts            idempotent Google Fonts <link> injection
    TransportBar.tsx         MODIFIED: settings trigger, effective-BPM readout

  debug/
    DebugRoute.tsx           /debug -> the strike-lab rig
```

**Boundaries.** `src/music/*` is pure and has no React or canvas dependency — it is the most-tested directory in this plan, and it must never import from `src/render/`. `render/theme.ts` is the only file that touches `getComputedStyle`. `settings/profile.ts` is the only file that touches `localStorage`. `ui/googleFont.ts` is the only file that injects a CDN font link.

**Task order.** Part A (Tasks 1–9) is the settings tranche, Part B (Tasks 10–16) the compositing and theming tranche, and Task 17 closes the test gaps the plan 1 handover parked; each part ships working software on its own, and Part B can be deferred without leaving Part A half-built. The one cross-tranche dependency runs forward: Task 1 defines the **whole** settings shape, including the theme and text blocks that have no UI until Part B, so Task 9's profile serialiser covers everything at schema version 1 and no migration is needed later.

---

## Part A — Settings, voices and profiles

### Task 1: Settings store and panel shell

The whole settings shape is defined here, in one file, even though most fields have
no UI until later tasks. That is deliberate: the profile serialiser in Task 9 needs a
stable shape, and every later task consumes these types rather than inventing its own.

**Files:**
- Create: `src/settings/types.ts`, `src/settings/useSettings.ts`, `src/ui/SettingsPanel.tsx`
- Test: `src/settings/useSettings.test.ts`
- Modify: `src/ui/TransportBar.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type ThemeName = 'classic' | 'outline' | 'contrast' | 'transparent'`
  - `type ZoomMode = 'full' | 'fit'`
  - `type NoteLabelContent = 'off' | 'pitch' | 'midi' | 'both'`
  - `type NoteLabelPlacement = 'above' | 'below'`
  - `type ChordDisplay = 'off' | 'symbol' | 'numeral' | 'both'`
  - `type ChordPlacement = 'stage-left' | 'stage-centre' | 'above-keys'`
  - `interface GradientStop { at: number; color: string }`
  - `type VelocityScheme = { kind: 'lightness'; lMax: number; lMin: number; sat: number } | { kind: 'gradient'; stops: GradientStop[] }`
  - `interface TextStyle { family, weight, sizeRatio, letterSpacing, color, opacity, strokeWidth, strokeColor }`
  - `interface DisplaySettings { zoom, showGrid, showFlash, flashScale, showMiddleC }`
  - `interface TextSettings { labels, labelPlacement, chord, chordPlacement, chordAlternates, chordWindowMs, keyOverride, style }`
  - `interface AudioSettings { masterVolume, metronome, metronomeVolume }`
  - `interface ThemeSettings { name: ThemeName; stageBgOverride: string | null }`
  - `interface Settings { theme, display, velocity, text, audio }`
  - `const DEFAULT_SETTINGS: Settings`
  - `useSettings` — Zustand store of `Settings & SettingsActions`
  - `SettingsActions`: `setTheme`, `setDisplay`, `setVelocity`, `setText`, `setTextStyle`, `setAudio`, `replaceAll(s: Settings)`, `reset()`
  - `SettingsPanel` React component, `SettingsSection` React component

- [ ] **Step 1: Write the settings types**

`src/settings/types.ts`:

```ts
export type ThemeName = 'classic' | 'outline' | 'contrast' | 'transparent'
export type ZoomMode = 'full' | 'fit'
export type NoteLabelContent = 'off' | 'pitch' | 'midi' | 'both'
export type NoteLabelPlacement = 'above' | 'below'
export type ChordDisplay = 'off' | 'symbol' | 'numeral' | 'both'
export type ChordPlacement = 'stage-left' | 'stage-centre' | 'above-keys'

/** A stop in the multi-stop velocity gradient. `at` is normalised velocity 0-1. */
export interface GradientStop { at: number; color: string }

export type VelocityScheme =
  | { kind: 'lightness'; lMax: number; lMin: number; sat: number }
  | { kind: 'gradient'; stops: GradientStop[] }

export interface TextStyle {
  family: string          // Google Font family name, e.g. 'Poppins'
  weight: number          // 400-900
  sizeRatio: number       // multiple of whiteW, so text scales with the keyboard
  letterSpacing: number   // em
  color: string
  opacity: number         // 0-1
  strokeWidth: number     // px; 0 turns the dark outline off
  strokeColor: string
}

export interface DisplaySettings {
  zoom: ZoomMode
  showGrid: boolean
  showFlash: boolean
  flashScale: number      // 0-1.5 multiplier on flash intensity
  showMiddleC: boolean
}

export interface TextSettings {
  labels: NoteLabelContent
  labelPlacement: NoteLabelPlacement
  chord: ChordDisplay
  chordPlacement: ChordPlacement
  chordAlternates: boolean
  chordWindowMs: number   // rolling window so arpeggios resolve to one chord
  /** Overrides the file's key signature. `null` = file, then C major. */
  keyOverride: string | null
  style: TextStyle
}

export interface AudioSettings {
  masterVolume: number    // 0-1
  metronome: boolean
  metronomeVolume: number // 0-1
}

export interface ThemeSettings {
  name: ThemeName
  /** Flat matte colour for keyed workflows (§13.2). `null` = use the theme token. */
  stageBgOverride: string | null
}

export interface Settings {
  theme: ThemeSettings
  display: DisplaySettings
  velocity: VelocityScheme
  text: TextSettings
  audio: AudioSettings
}

/** The default gradient: blue -> green -> yellow -> red, per spec §7. */
export const DEFAULT_GRADIENT: GradientStop[] = [
  { at: 0, color: '#4a7cff' },
  { at: 0.4, color: '#38d17a' },
  { at: 0.7, color: '#f5c542' },
  { at: 1, color: '#e8384f' },
]

export const DEFAULT_TEXT_STYLE: TextStyle = {
  family: 'Poppins',
  weight: 600,
  sizeRatio: 0.55,
  letterSpacing: 0,
  color: '#ffffff',
  opacity: 1,
  strokeWidth: 3,
  strokeColor: 'rgba(0,0,0,0.35)',
}

export const DEFAULT_SETTINGS: Settings = {
  theme: { name: 'classic', stageBgOverride: null },
  display: { zoom: 'full', showGrid: true, showFlash: true, flashScale: 1, showMiddleC: true },
  velocity: { kind: 'lightness', lMax: 78, lMin: 38, sat: 85 },
  text: {
    labels: 'off',
    labelPlacement: 'above',
    chord: 'off',
    chordPlacement: 'stage-left',
    chordAlternates: false,
    chordWindowMs: 600,
    keyOverride: null,
    style: DEFAULT_TEXT_STYLE,
  },
  audio: { masterVolume: 0.8, metronome: false, metronomeVolume: 0.5 },
}
```

- [ ] **Step 2: Write the failing store tests**

`src/settings/useSettings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useSettings } from './useSettings'
import { DEFAULT_SETTINGS } from './types'

const get = () => useSettings.getState()

describe('useSettings', () => {
  beforeEach(() => { get().reset() })

  it('starts at the documented defaults', () => {
    expect(get().velocity).toEqual({ kind: 'lightness', lMax: 78, lMin: 38, sat: 85 })
    expect(get().theme.name).toBe('classic')
    expect(get().text.chordWindowMs).toBe(600)
  })

  it('patches one display field without disturbing its siblings', () => {
    get().setDisplay({ showGrid: false })
    expect(get().display.showGrid).toBe(false)
    expect(get().display.flashScale).toBe(1)
    expect(get().display.zoom).toBe('full')
  })

  it('patches the nested text style without replacing the whole text block', () => {
    get().setTextStyle({ family: 'Inter' })
    expect(get().text.style.family).toBe('Inter')
    expect(get().text.style.weight).toBe(600)
    expect(get().text.chord).toBe('off')
  })

  it('replaces a whole velocity scheme rather than merging it', () => {
    get().setVelocity({ kind: 'gradient', stops: [{ at: 0, color: '#000' }] })
    expect(get().velocity).toEqual({ kind: 'gradient', stops: [{ at: 0, color: '#000' }] })
    // A merge would have left lMax behind and produced an impossible union value.
    expect('lMax' in get().velocity).toBe(false)
  })

  it('replaceAll adopts an entire settings object, for profile import', () => {
    get().replaceAll({
      ...DEFAULT_SETTINGS,
      theme: { name: 'transparent', stageBgOverride: '#00b140' },
    })
    expect(get().theme).toEqual({ name: 'transparent', stageBgOverride: '#00b140' })
  })

  it('reset returns every section to defaults', () => {
    get().setDisplay({ showGrid: false })
    get().setAudio({ masterVolume: 0.1 })
    get().reset()
    expect(get().display).toEqual(DEFAULT_SETTINGS.display)
    expect(get().audio).toEqual(DEFAULT_SETTINGS.audio)
  })

  it('does not share mutable default sub-objects with DEFAULT_SETTINGS', () => {
    get().setTextStyle({ family: 'Inter' })
    expect(DEFAULT_SETTINGS.text.style.family).toBe('Poppins')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/settings/useSettings.test.ts`
Expected: FAIL — `Failed to resolve import "./useSettings"`.

- [ ] **Step 4: Write the store**

`src/settings/useSettings.ts`:

```ts
import { create } from 'zustand'
import { DEFAULT_SETTINGS } from './types'
import type {
  AudioSettings, DisplaySettings, Settings, TextSettings, TextStyle,
  ThemeSettings, VelocityScheme,
} from './types'

export interface SettingsActions {
  setTheme: (patch: Partial<ThemeSettings>) => void
  setDisplay: (patch: Partial<DisplaySettings>) => void
  /** Replaced whole, never merged: the two scheme kinds are a discriminated union. */
  setVelocity: (scheme: VelocityScheme) => void
  setText: (patch: Partial<TextSettings>) => void
  setTextStyle: (patch: Partial<TextStyle>) => void
  setAudio: (patch: Partial<AudioSettings>) => void
  replaceAll: (s: Settings) => void
  reset: () => void
}

/** Deep-ish clone of the defaults so no store ever aliases the shared constant. */
function freshDefaults(): Settings {
  return structuredClone(DEFAULT_SETTINGS)
}

export const useSettings = create<Settings & SettingsActions>((set) => ({
  ...freshDefaults(),

  setTheme: (patch) => set((s) => ({ theme: { ...s.theme, ...patch } })),
  setDisplay: (patch) => set((s) => ({ display: { ...s.display, ...patch } })),
  setVelocity: (velocity) => set({ velocity }),
  setText: (patch) => set((s) => ({ text: { ...s.text, ...patch } })),
  setTextStyle: (patch) => set((s) => ({ text: { ...s.text, style: { ...s.text.style, ...patch } } })),
  setAudio: (patch) => set((s) => ({ audio: { ...s.audio, ...patch } })),

  replaceAll: (s) => set(structuredClone(s)),
  reset: () => set(freshDefaults()),
}))

/** The plain serialisable slice, with the actions stripped. Used by the profile. */
export function currentSettings(): Settings {
  const { theme, display, velocity, text, audio } = useSettings.getState()
  return structuredClone({ theme, display, velocity, text, audio })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/settings/useSettings.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Write the panel shell**

`src/ui/SettingsPanel.tsx`. Sections are collapsible and each later task hangs its
control group off one of them. Every section renders its children only when open, so
the panel costs nothing while closed.

```tsx
import { useState } from 'react'

export function SettingsSection(props: {
  id: string
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  return (
    <div className={`settings-section settings-section--${props.id} border-b border-[var(--line)]`}>
      <button
        type="button"
        aria-expanded={open}
        className="settings-section-toggle flex w-full items-center justify-between px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-dim)]"
        onClick={() => setOpen((v) => !v)}
      >
        {props.title}
        <span className="settings-section-chevron" aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="settings-section-body px-4 pb-3">{props.children}</div>}
    </div>
  )
}

/** Row primitive: a label on the left, a control on the right. */
export function SettingsRow(props: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row flex items-center justify-between gap-3 py-1.5">
      <label htmlFor={props.htmlFor} className="settings-row-label text-xs text-[var(--ink-dim)]">
        {props.label}
      </label>
      <div className="settings-row-control flex items-center gap-2">{props.children}</div>
    </div>
  )
}

export function SettingsPanel(props: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null
  return (
    <>
      <div
        className="settings-scrim fixed inset-0 z-10"
        onClick={props.onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Settings"
        className="settings-panel absolute bottom-full right-4 z-20 mb-2 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-2xl"
      >
        {props.children}
      </div>
    </>
  )
}
```

- [ ] **Step 7: Mount the panel from the transport bar**

In `src/ui/TransportBar.tsx`, add a `settings` render-prop so the bar stays a dumb
component and `App.tsx` keeps owning what goes inside the panel. Add to the props
interface:

```ts
  settings?: React.ReactNode
```

and render it as the last child, after the load-another button, wrapped so the
absolutely-positioned panel anchors to it:

```tsx
      {props.settings && (
        <div className="settings-anchor relative">{props.settings}</div>
      )}
```

The `transport-bar` div must gain `relative` for that anchor to resolve against the
bar rather than the page: change its className to start `transport-bar relative flex`.

- [ ] **Step 8: Wire an empty panel into the app**

In `src/App.tsx`, add the open state and pass the trigger plus panel through:

```tsx
import { SettingsPanel, SettingsSection } from './ui/SettingsPanel'
```

```tsx
  const [settingsOpen, setSettingsOpen] = useState(false)
```

and in the `<TransportBar ... />` call add:

```tsx
          settings={
            <>
              <button
                type="button"
                aria-label="Settings"
                aria-expanded={settingsOpen}
                className="btn-settings rounded-md border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink-dim)]"
                onClick={() => setSettingsOpen((v) => !v)}
              >
                Settings
              </button>
              <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <SettingsSection id="placeholder" title="Settings" defaultOpen>
                  <p className="settings-placeholder text-xs text-[var(--ink-dim)]">
                    Controls arrive in the following tasks.
                  </p>
                </SettingsSection>
              </SettingsPanel>
            </>
          }
```

Each later task replaces one placeholder section with its real control group.

- [ ] **Step 9: Verify the build and the whole suite**

Run: `npm test && npm run build`
Expected: all tests pass (94 existing + 7 new = 101), build clean.

- [ ] **Step 10: Commit**

```bash
git add src/settings src/ui/SettingsPanel.tsx src/ui/TransportBar.tsx src/App.tsx
git commit -m "feat: settings store and collapsible settings panel shell"
```

---

### Task 2: Master BPM control

**Files:**
- Modify: `src/model/tempoMap.ts`, `src/App.tsx`, `src/ui/TransportBar.tsx`
- Create: `src/ui/TempoControl.tsx`
- Test: `src/model/tempoMap.test.ts` (append)

**Interfaces:**
- Consumes: `TempoSetting`, `TempoEvent` from `src/model/types.ts`; `SettingsSection`, `SettingsRow` from Task 1
- Produces:
  - `effectiveBpmAt(map: TempoEvent[], sec: number, setting: TempoSetting): number` — the BPM actually sounding at playhead second `sec`
  - `const MIN_TEMPO_SCALE = 0.25`, `const MAX_TEMPO_SCALE = 3`
  - `TempoControl` React component, props `{ tempo: TempoSetting; onChange: (t: TempoSetting) => void }`

- [ ] **Step 1: Write the failing tests**

Append to `src/model/tempoMap.test.ts`:

```ts
import { buildTempoMap, effectiveBpmAt } from './tempoMap'

describe('effectiveBpmAt', () => {
  const ppq = 480
  // 120bpm from the start, dropping to 60bpm at tick 960 (= 2 beats = 1.0s).
  const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }], ppq)

  it('reports the notated tempo at scale 1', () => {
    expect(effectiveBpmAt(map, 0.5, { mode: 'scale', scale: 1 })).toBeCloseTo(120, 6)
    expect(effectiveBpmAt(map, 1.5, { mode: 'scale', scale: 1 })).toBeCloseTo(60, 6)
  })

  it('multiplies the notated tempo by the scale', () => {
    expect(effectiveBpmAt(map, 0.25, { mode: 'scale', scale: 0.5 })).toBeCloseTo(60, 6)
    expect(effectiveBpmAt(map, 0.2, { mode: 'scale', scale: 2 })).toBeCloseTo(240, 6)
  })

  it('crosses the tempo change at the scaled playhead, not the notated one', () => {
    // At scale 2 the 1.0s change lands at playhead 0.5s. Before it: 120*2.
    expect(effectiveBpmAt(map, 0.4, { mode: 'scale', scale: 2 })).toBeCloseTo(240, 6)
    // After it: 60*2.
    expect(effectiveBpmAt(map, 0.6, { mode: 'scale', scale: 2 })).toBeCloseTo(120, 6)
  })

  it('reports a flat tempo in absolute mode, ignoring the map entirely', () => {
    expect(effectiveBpmAt(map, 0.5, { mode: 'absolute', bpm: 90 })).toBe(90)
    expect(effectiveBpmAt(map, 5, { mode: 'absolute', bpm: 90 })).toBe(90)
  })

  it('does not divide by zero if a scale of 0 ever reaches it', () => {
    expect(Number.isFinite(effectiveBpmAt(map, 1, { mode: 'scale', scale: 0 }))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/model/tempoMap.test.ts`
Expected: FAIL — `effectiveBpmAt is not a function`.

- [ ] **Step 3: Add `effectiveBpmAt` to the tempo map**

In `src/model/tempoMap.ts`, add the bounds and the function. `segmentAtSec` already
exists in this file and stays private.

```ts
/** The tempo slider's bounds. 0 must never reach ticksToSec's divisor. */
export const MIN_TEMPO_SCALE = 0.25
export const MAX_TEMPO_SCALE = 3

/**
 * The BPM actually sounding at playhead second `sec`. In scale mode the playhead
 * is converted back to the file's own timeline before the segment is looked up,
 * so the readout crosses a ritardando at the moment the listener hears it.
 */
export function effectiveBpmAt(
  map: TempoEvent[], sec: number, setting: TempoSetting,
): number {
  if (setting.mode === 'absolute') return setting.bpm
  const scale = Math.max(0.01, setting.scale)
  return segmentAtSec(map, sec * scale).bpm * scale
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/model/tempoMap.test.ts`
Expected: PASS — the 5 new tests plus the existing ones.

- [ ] **Step 5: Write the tempo control**

`src/ui/TempoControl.tsx`:

```tsx
import { MAX_TEMPO_SCALE, MIN_TEMPO_SCALE } from '../model/tempoMap'
import { SettingsRow } from './SettingsPanel'
import type { TempoSetting } from '../model/types'

export function TempoControl(props: {
  tempo: TempoSetting
  effectiveBpm: number
  onChange: (t: TempoSetting) => void
}) {
  const { tempo, effectiveBpm, onChange } = props
  const scale = tempo.mode === 'scale' ? tempo.scale : 1
  const bpm = tempo.mode === 'absolute' ? tempo.bpm : Math.round(effectiveBpm)

  return (
    <div className="tempo-control">
      <SettingsRow label="Tempo mode">
        <div className="tempo-mode-switch flex gap-1">
          {(['scale', 'absolute'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={tempo.mode === m}
              className={`btn-tempo-mode rounded-md border px-2 py-0.5 text-[11px] capitalize ${
                tempo.mode === m
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() =>
                onChange(m === 'scale' ? { mode: 'scale', scale } : { mode: 'absolute', bpm })
              }
            >
              {m === 'scale' ? 'Scale %' : 'Absolute'}
            </button>
          ))}
        </div>
      </SettingsRow>

      {tempo.mode === 'scale' ? (
        <SettingsRow label="Tempo scale" htmlFor="tempo-scale">
          <input
            id="tempo-scale"
            type="range"
            aria-label="Tempo scale"
            className="tempo-scale-slider h-1 w-36 accent-[var(--accent)]"
            min={MIN_TEMPO_SCALE}
            max={MAX_TEMPO_SCALE}
            step={0.01}
            value={scale}
            onChange={(e) => onChange({ mode: 'scale', scale: Number(e.target.value) })}
          />
          <span className="tempo-scale-value w-12 text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">
            {Math.round(scale * 100)}%
          </span>
        </SettingsRow>
      ) : (
        <SettingsRow label="Absolute BPM" htmlFor="tempo-bpm">
          <input
            id="tempo-bpm"
            type="number"
            aria-label="Absolute BPM"
            className="tempo-bpm-input w-20 rounded border border-[var(--line)] bg-transparent px-2 py-0.5 text-right font-mono text-[11px] tabular-nums"
            min={20}
            max={300}
            step={1}
            value={bpm}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v >= 20 && v <= 300) onChange({ mode: 'absolute', bpm: v })
            }}
          />
        </SettingsRow>
      )}

      <p className="tempo-note text-[11px] leading-snug text-[var(--ink-dim)]">
        {tempo.mode === 'scale'
          ? 'Scales the file’s own tempo map, so ritardandos survive.'
          : 'Flattens the file’s tempo map to one constant tempo.'}
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Show the effective BPM in the transport bar**

Add to the `TransportBar` props interface:

```ts
  effectiveBpm: number
```

and render it beside the time readout, immediately after the `transport-time` span:

```tsx
      <span className="transport-bpm font-mono text-xs tabular-nums text-[var(--ink-dim)]">
        {Math.round(effectiveBpm)} BPM
      </span>
```

destructuring `effectiveBpm` alongside the existing props at the top of the component.

- [ ] **Step 7: Wire tempo changes in the app, WITH the stopAll pairing**

In `src/App.tsx`, add the imports:

```tsx
import { effectiveBpmAt } from './model/tempoMap'
import { TempoControl } from './ui/TempoControl'
import type { TempoSetting } from './model/types'
```

and the callback:

```tsx
  // setTempo replaces score.notes, so the score-identity effect above rebuilds
  // and re-seats the scheduler on its own. What it CANNOT undo is the notes
  // already handed to smplr at their old times -- those keep sounding across
  // the change unless we cancel them here, exactly as seek and pause do.
  const changeTempo = useCallback((setting: TempoSetting) => {
    const now = engine.currentTime
    useTransport.getState().setTempo(setting, now)
    engine.stopAll()
  }, [engine])
```

Compute the readout from the throttled playhead (not per frame):

```tsx
  const effectiveBpm = t.score ? effectiveBpmAt(t.score.tempoMap, playhead, t.tempo) : 120
```

Pass `effectiveBpm={effectiveBpm}` to `<TransportBar>`, and replace the placeholder
section inside `SettingsPanel` with:

```tsx
                <SettingsSection id="tempo" title="Tempo" defaultOpen>
                  <TempoControl tempo={t.tempo} effectiveBpm={effectiveBpm} onChange={changeTempo} />
                </SettingsSection>
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 9: Manual check**

Run: `npm run dev -- --host 0.0.0.0`, load `docs/demo.mid`, press play, and drag the
tempo scale slider while it is playing. Confirm: the music changes speed, the playhead
does **not** jump, nothing keeps sounding at the old speed, and the BPM readout tracks
the slider.

- [ ] **Step 10: Commit**

```bash
git add src/model/tempoMap.ts src/model/tempoMap.test.ts src/ui/TempoControl.tsx src/ui/TransportBar.tsx src/App.tsx
git commit -m "feat: master tempo control with scale% and absolute BPM modes"
```

---

### Task 3: Per-voice gain bus in the audio engine

**This is the carry-forward from plan 1 and the one task that must not be shortcut.**
`foldVelocity(velocity, volume)` currently multiplies voice volume into MIDI velocity.
On a velocity-layered sampled piano, velocity selects the sample **layer**, so that
changes timbre, not level: a voice turned down to 0.5 sounds *gently struck*, not
*quieter*. It is deleted here.

**The mechanism, verified against `node_modules/smplr/dist/index.d.ts`:**

- Every instrument factory is `InstrumentFactory<O> = (ctx, options?: O & Partial<SmplrOptions>) => …` (`index.d.ts:437`), so **both** the factory's own config **and** `SmplrOptions` are accepted.
- `SmplrOptions.destination?: AudioNode` (`index.d.ts:307`) routes an instrument's output at construction.
- `SmplrOptions.loader?: SampleLoader` — *"Shared SampleLoader instance. If omitted, a private one is created."* (`index.d.ts:317`), and `SampleLoader.load` is *"Internally cached by resolved URL, so repeated calls with the same baseUrl/format/path do not re-fetch."* (`index.d.ts:246`).
- `Smplr.dispose()` (`index.d.ts:373`) — *"Stop all voices, dispose the output channel, and stop the scheduler."*

So: **one instrument instance per voice, each routed to that voice's own `GainNode`, all sharing one `SampleLoader`.** Two voices on the grand piano cost one fetch and one decode between them, and can still be at different volumes. That is what the old cache-by-instrument-id design could not do.

The engine also gains constructor injection for its `AudioContext` and instrument
factory, so it becomes unit-testable in jsdom — it was the only file in plan 1 with no
automated tests.

**Files:**
- Modify: `src/audio/engine.ts`, `src/audio/engine.test.ts`, `src/App.tsx`
- Modify: `src/model/types.ts` (no shape change; `Voice.volume` is already there)

**Interfaces:**
- Consumes: `Voice` from `src/model/types.ts`, `ScheduledNote` from `src/audio/scheduler.ts`
- Produces:
  - `volumeToGain(volume: number): number` — 0-1 in, linear gain out
  - `clampToNow(when: number, now: number): number` — unchanged
  - `type InstrumentFactoryFn = (ctx: BaseAudioContext, id: string, destination: AudioNode, loader: unknown) => Promise<Instrument>`
  - `interface AudioEngineDeps { makeContext?: () => AudioContext; makeInstrument?: InstrumentFactoryFn }`
  - `class AudioEngine` with `currentTime`, `resume()`, `loadVoice(v: Voice)`, `retainVoices(ids: string[])`, `setVoiceVolume(id, v)`, `setMasterVolume(v)`, `play(s, voice, originSec)`, `stopAll()`, `dispose()`
  - `foldVelocity` is **removed**. Any remaining import of it is a bug.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/audio/engine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioEngine, clampToNow, volumeToGain } from './engine'
import type { Voice } from '../model/types'
import type { ScheduledNote } from './scheduler'

const voice = (id: string, patch: Partial<Voice> = {}): Voice => ({
  id, label: id, hue: 200, instrument: 'acoustic_grand_piano',
  visible: true, audible: true, volume: 1, ...patch,
})

const sched = (pitch: number, atSec: number, velocity = 100): ScheduledNote => ({
  atSec,
  note: {
    id: pitch, pitch, startTicks: 0, durTicks: 480,
    startSec: atSec, endSec: atSec + 1, velocity, voiceId: 'v1',
  },
})

/** Minimal AudioContext stand-in: jsdom has no Web Audio. */
function fakeGain() {
  return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }
}
function fakeContext() {
  return {
    currentTime: 10,
    state: 'running' as AudioContextState,
    destination: { id: 'dest' },
    createGain: vi.fn(fakeGain),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }
}

type FakeInstrument = { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; destination: AudioNode; id: string }

function harness() {
  const ctx = fakeContext()
  const made: FakeInstrument[] = []
  const makeInstrument = vi.fn(async (_c: BaseAudioContext, id: string, destination: AudioNode) => {
    const inst = { id, destination, start: vi.fn(), stop: vi.fn(), dispose: vi.fn() }
    made.push(inst)
    return inst as never
  })
  const engine = new AudioEngine({
    makeContext: () => ctx as unknown as AudioContext,
    makeInstrument,
  })
  return { ctx, made, makeInstrument, engine }
}

describe('volumeToGain', () => {
  it('maps the ends of the range exactly', () => {
    expect(volumeToGain(0)).toBe(0)
    expect(volumeToGain(1)).toBe(1)
  })

  it('is a perceptual (square) curve, not linear', () => {
    expect(volumeToGain(0.5)).toBeCloseTo(0.25, 9)
  })

  it('rises monotonically and clamps out-of-range input', () => {
    let prev = -1
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const g = volumeToGain(v)
      expect(g).toBeGreaterThanOrEqual(prev)
      prev = g
    }
    expect(volumeToGain(-3)).toBe(0)
    expect(volumeToGain(9)).toBe(1)
  })
})

describe('clampToNow', () => {
  it('never schedules in the past', () => {
    expect(clampToNow(5, 10)).toBe(10)
    expect(clampToNow(12, 10)).toBe(12)
  })
})

describe('AudioEngine voice bus', () => {
  let h: ReturnType<typeof harness>
  beforeEach(() => { h = harness() })

  it('gives two voices on the SAME instrument two instances with different destinations', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v2'))
    expect(h.made).toHaveLength(2)
    expect(h.made[0].destination).not.toBe(h.made[1].destination)
  })

  it('passes raw velocity to smplr -- volume must NOT fold into it', async () => {
    await h.engine.loadVoice(voice('v1', { volume: 0.25 }))
    h.engine.play(sched(60, 0.5, 100), voice('v1', { volume: 0.25 }), 0)
    expect(h.made[0].start).toHaveBeenCalledWith(
      expect.objectContaining({ note: 60, velocity: 100 }),
    )
  })

  it('applies volume to the voice gain node instead', async () => {
    await h.engine.loadVoice(voice('v1', { volume: 0.5 }))
    h.engine.setVoiceVolume('v1', 0.5)
    const gain = (h.made[0].destination as unknown as { gain: { value: number } }).gain
    expect(gain.value).toBeCloseTo(0.25, 9)
  })

  it('changes one voice volume without touching another', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v2'))
    h.engine.setVoiceVolume('v1', 0)
    const g1 = (h.made[0].destination as unknown as { gain: { value: number } }).gain
    const g2 = (h.made[1].destination as unknown as { gain: { value: number } }).gain
    expect(g1.value).toBe(0)
    expect(g2.value).toBe(1)
  })

  it('schedules against the voice its own instrument, at the exact clock time', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v2'))
    h.engine.play(sched(60, 2), voice('v2'), 20)
    expect(h.made[0].start).not.toHaveBeenCalled()
    expect(h.made[1].start).toHaveBeenCalledWith(expect.objectContaining({ time: 22 }))
  })

  it('disposes the old instance when a voice changes instrument', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v1', { instrument: 'harpsichord' }))
    expect(h.made[0].dispose).toHaveBeenCalled()
    expect(h.made).toHaveLength(2)
    expect(h.made[1].id).toBe('harpsichord')
  })

  it('does not rebuild an instance when the instrument is unchanged', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v1', { volume: 0.3 }))
    expect(h.made).toHaveLength(1)
    expect(h.made[0].dispose).not.toHaveBeenCalled()
  })

  it('retainVoices disposes and disconnects voices no longer in the score', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v2'))
    h.engine.retainVoices(['v2'])
    expect(h.made[0].dispose).toHaveBeenCalled()
    expect(h.made[1].dispose).not.toHaveBeenCalled()
    h.engine.play(sched(60, 0), voice('v1'), 0)
    expect(h.made[0].start).not.toHaveBeenCalled()
  })

  it('is a silent no-op for an unloaded or muted voice', async () => {
    h.engine.play(sched(60, 0), voice('ghost'), 0)      // never loaded
    await h.engine.loadVoice(voice('v1', { audible: false }))
    h.engine.play(sched(60, 0), voice('v1', { audible: false }), 0)
    expect(h.made[0].start).not.toHaveBeenCalled()
  })

  it('falls back to the grand piano when an instrument fails twice', async () => {
    const ctx = fakeContext()
    let calls = 0
    const engine = new AudioEngine({
      makeContext: () => ctx as unknown as AudioContext,
      makeInstrument: async (_c, id) => {
        calls++
        if (id !== 'acoustic_grand_piano') throw new Error('404')
        return { id, start: vi.fn(), stop: vi.fn(), dispose: vi.fn() } as never
      },
    })
    await engine.loadVoice(voice('v1', { instrument: 'broken_instrument' }))
    // two attempts at the requested instrument, then one at the fallback
    expect(calls).toBe(3)
    engine.play(sched(60, 0), voice('v1', { instrument: 'broken_instrument' }), 0)
    // it sounds -- a missing soundfont must never block playback
    expect(() => engine.stopAll()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/audio/engine.test.ts`
Expected: FAIL — `volumeToGain is not exported`, and `AudioEngine` constructor takes no deps.

- [ ] **Step 3: Rewrite the engine**

Replace the whole of `src/audio/engine.ts`:

```ts
import { SampleLoader, Soundfont, SplendidGrandPiano } from 'smplr'
import type { Voice } from '../model/types'
import type { ScheduledNote } from './scheduler'

const GRAND_PIANO_ID = 'acoustic_grand_piano'

/** The instance type produced by either smplr instrument factory we use. */
type Instrument = ReturnType<typeof SplendidGrandPiano> | ReturnType<typeof Soundfont>

/** Never schedule in the past -- after a seek, originSec + atSec can be behind the clock. */
export function clampToNow(when: number, now: number): number {
  return Math.max(when, now)
}

/**
 * Voice volume is LEVEL, not velocity. On a velocity-layered sampled piano,
 * velocity selects the sample layer, so folding volume into it would make a
 * quiet voice sound gently struck rather than quieter. Volume therefore lives
 * on a GainNode and velocity is passed through untouched.
 *
 * Square curve: a linear gain slider feels top-heavy because loudness is
 * roughly logarithmic. x^2 is the cheap approximation, exact at both ends.
 */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume))
  return v * v
}

export type InstrumentFactoryFn = (
  ctx: BaseAudioContext, id: string, destination: AudioNode, loader: unknown,
) => Promise<Instrument>

export interface AudioEngineDeps {
  makeContext?: () => AudioContext
  makeInstrument?: InstrumentFactoryFn
}

/**
 * smplr's factories take `O & Partial<SmplrOptions>`, so `destination` and the
 * shared `loader` are both accepted alongside each factory's own config.
 * Sharing one SampleLoader is what makes per-voice instances affordable: its
 * load() is cached by resolved URL, so N voices on the grand piano cost one
 * fetch and one decode between them.
 */
const defaultMakeInstrument: InstrumentFactoryFn = async (ctx, id, destination, loader) => {
  const opts = { destination, loader } as never
  const inst = id === GRAND_PIANO_ID
    ? SplendidGrandPiano(ctx, opts)
    : Soundfont(ctx, { instrument: id, ...(opts as object) } as never)
  await inst.ready
  return inst
}

interface VoiceBus {
  gain: GainNode
  instrumentId: string
  instrument: Instrument | null
}

/**
 * Owns the AudioContext and one instrument + gain node per VOICE.
 * AudioContext.currentTime is the app's single clock.
 *
 * Graph:  instrument -> voiceGain -> masterGain -> destination
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private loader: unknown = null
  private buses = new Map<string, VoiceBus>()
  private loading = new Map<string, Promise<void>>()
  private masterVolume = 0.8
  private readonly makeContext: () => AudioContext
  private readonly makeInstrument: InstrumentFactoryFn

  constructor(deps: AudioEngineDeps = {}) {
    this.makeContext = deps.makeContext ?? (() => new AudioContext())
    this.makeInstrument = deps.makeInstrument ?? defaultMakeInstrument
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.makeContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = volumeToGain(this.masterVolume)
      this.master.connect(this.ctx.destination)
      this.loader = SampleLoader(this.ctx)
    }
    return this.ctx
  }

  get currentTime(): number {
    return this.context().currentTime
  }

  get ready(): boolean {
    return [...this.buses.values()].some((b) => b.instrument !== null)
  }

  /** Browsers require a user gesture before audio will sound. */
  async resume(): Promise<void> {
    const ctx = this.context()
    if (ctx.state === 'suspended') await ctx.resume()
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = volume
    if (this.master) this.master.gain.value = volumeToGain(volume)
  }

  setVoiceVolume(voiceId: string, volume: number): void {
    const bus = this.buses.get(voiceId)
    if (bus) bus.gain.gain.value = volumeToGain(volume)
  }

  private bus(voice: Voice): VoiceBus {
    const existing = this.buses.get(voice.id)
    if (existing) return existing
    const ctx = this.context()
    const gain = ctx.createGain()
    gain.gain.value = volumeToGain(voice.volume)
    gain.connect(this.master!)
    const created: VoiceBus = { gain, instrumentId: '', instrument: null }
    this.buses.set(voice.id, created)
    return created
  }

  /** One retry of the same instrument before the caller gives up on it. */
  private async createWithRetry(id: string, destination: AudioNode): Promise<Instrument> {
    try {
      return await this.makeInstrument(this.context(), id, destination, this.loader)
    } catch {
      return await this.makeInstrument(this.context(), id, destination, this.loader)
    }
  }

  /**
   * Ensures this voice has a gain node and an instrument instance of its own.
   * Called on load and whenever the voice's instrument changes. Volume changes
   * must go through setVoiceVolume, which does not rebuild anything.
   */
  async loadVoice(voice: Voice): Promise<void> {
    const bus = this.bus(voice)
    bus.gain.gain.value = volumeToGain(voice.volume)
    if (bus.instrumentId === voice.instrument && bus.instrument) return

    const pending = this.loading.get(voice.id)
    if (pending) await pending

    const task = (async () => {
      const previous = bus.instrument
      try {
        bus.instrument = await this.createWithRetry(voice.instrument, bus.gain)
        bus.instrumentId = voice.instrument
      } catch {
        // Retry-once on the requested instrument already failed twice; fall
        // back to the grand piano so a missing soundfont never blocks playback
        // or the visuals.
        if (voice.instrument === GRAND_PIANO_ID) return
        try {
          bus.instrument = await this.createWithRetry(GRAND_PIANO_ID, bus.gain)
          bus.instrumentId = GRAND_PIANO_ID
        } catch {
          /* leave the voice silent; play() becomes a no-op for it */
        }
      } finally {
        if (previous && previous !== bus.instrument) previous.dispose()
      }
    })().finally(() => this.loading.delete(voice.id))

    this.loading.set(voice.id, task)
    return task
  }

  /** Disposes every voice bus not in `ids`. Called when a score is replaced. */
  retainVoices(ids: string[]): void {
    const keep = new Set(ids)
    for (const [id, bus] of this.buses) {
      if (keep.has(id)) continue
      bus.instrument?.dispose()
      bus.gain.disconnect()
      this.buses.delete(id)
    }
  }

  /**
   * Schedules one note at an exact AudioContext time. originSec is the context
   * time corresponding to playhead zero, so atSec (a score time) becomes an
   * absolute context time. Velocity is passed THROUGH -- see volumeToGain.
   */
  play(s: ScheduledNote, voice: Voice, originSec: number): void {
    if (!voice.audible) return
    const inst = this.buses.get(voice.id)?.instrument
    if (!inst) return

    inst.start({
      note: s.note.pitch,
      time: clampToNow(originSec + s.atSec, this.currentTime),
      duration: Math.max(0.02, s.note.endSec - s.note.startSec),
      velocity: s.note.velocity,
    })
  }

  stopAll(): void {
    for (const bus of this.buses.values()) {
      try {
        bus.instrument?.stop()
      } catch {
        /* smplr throws if nothing is sounding */
      }
    }
  }

  dispose(): void {
    this.retainVoices([])
    this.master?.disconnect()
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/audio/engine.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Switch the app over to per-voice loading**

In `src/App.tsx`, replace the instrument-loading block inside `loadFile`:

```tsx
    try {
      await engine.resume()
      await Promise.all(score.voices.map((v) => engine.loadVoice(v)))
      engine.retainVoices(score.voices.map((v) => v.id))
    } catch (e) {
      // The score is loaded and visible; only sound is affected.
      setError(`${file.name} is loaded, but audio could not start: ${(e as Error).message}`)
    }
```

and in `loadAnother`, release the buses after clearing the model:

```tsx
    state.clearScore()
    engine.retainVoices([])
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean. Confirm `foldVelocity` is gone:

```bash
grep -rn "foldVelocity" src/ && echo "STILL PRESENT -- fix before committing" || echo "clean"
```

- [ ] **Step 7: Manual check**

Run: `npm run dev -- --host 0.0.0.0`, load `docs/demo.mid` and play it. Both hands must
still sound, at the same level as before. This task changes no audible behaviour — it
only makes per-voice volume possible.

- [ ] **Step 8: Commit**

```bash
git add src/audio/engine.ts src/audio/engine.test.ts src/App.tsx
git commit -m "feat: per-voice gain bus so volume is level, not timbre"
```

---

### Task 4: Voice panel — colour, label, instrument, mute, volume

**Files:**
- Create: `src/ui/VoicePanel.tsx`, `src/ui/VoicePanel.test.tsx`
- Modify: `src/transport/useTransport.ts`, `src/transport/useTransport.test.ts`, `src/App.tsx`

**Interfaces:**
- Consumes: `Voice` from `src/model/types.ts`; `AudioEngine.loadVoice` / `setVoiceVolume` from Task 3; `SettingsRow` from Task 1
- Produces:
  - `useTransport` action `updateVoice: (id: string, patch: Partial<Voice>) => void`
  - `const INSTRUMENT_OPTIONS: string[]` (exported from `VoicePanel.tsx`)
  - `VoicePanel` React component, props `{ voices: Voice[]; onChange: (id: string, patch: Partial<Voice>) => void }`

- [ ] **Step 1: Write the failing store test**

Append to `src/transport/useTransport.test.ts`:

```ts
describe('updateVoice', () => {
  it('patches one voice and leaves its siblings alone', () => {
    const s = makeScore()               // existing helper in this file
    useTransport.getState().loadScore(s)
    const before = useTransport.getState().score!.voices[1]

    useTransport.getState().updateVoice(before.id === 'a' ? 'b' : before.id, { hue: 300 })
    const after = useTransport.getState().score!.voices
    expect(after[1].hue).toBe(300)
    expect(after[0]).toEqual(useTransport.getState().score!.voices[0])
  })

  it('keeps the SAME notes array reference, so the scheduler is not rebuilt', () => {
    const s = makeScore()
    useTransport.getState().loadScore(s)
    const notesBefore = useTransport.getState().score!.notes
    useTransport.getState().updateVoice(notesBefore[0].voiceId, { label: 'Melody' })
    expect(useTransport.getState().score!.notes).toBe(notesBefore)
  })

  it('is a no-op for an unknown voice id', () => {
    const s = makeScore()
    useTransport.getState().loadScore(s)
    const before = useTransport.getState().score!.voices
    useTransport.getState().updateVoice('nope', { hue: 1 })
    expect(useTransport.getState().score!.voices).toEqual(before)
  })
})
```

If `makeScore()` does not already exist in that test file, add it at the top, building a
two-voice score with two notes — one note per voice — using `buildTempoMap([], 480)` for
the tempo map and `retimeScore` for the seconds.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/transport/useTransport.test.ts`
Expected: FAIL — `updateVoice is not a function`.

- [ ] **Step 3: Add the store action**

In `src/transport/useTransport.ts`, add to `TransportActions`:

```ts
  updateVoice: (id: string, patch: Partial<Voice>) => void
```

import the `Voice` type alongside the existing ones, and add the implementation:

```ts
  /**
   * Replaces the score object but reuses the SAME notes array. App.tsx keys its
   * scheduler effect on score.notes for exactly this reason: a colour or label
   * change must not rebuild the scheduler, which would re-hand already-scheduled
   * notes to smplr and double them.
   */
  updateVoice: (id, patch) => set((s) => {
    if (!s.score) return {}
    const voices = s.score.voices.map((v) => (v.id === id ? { ...v, ...patch } : v))
    if (voices.every((v, i) => v === s.score!.voices[i])) return {}
    return { score: { ...s.score, voices } }
  }),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/transport/useTransport.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the scheduler effect's dependency**

This is the defect the previous step's comment warns about, and it is live the moment
`updateVoice` exists. In `src/App.tsx`, change the scheduler rebuild effect to key on
the notes array rather than the score object:

```tsx
  // Rebuild the scheduler whenever the note array is REPLACED (load or retime).
  // Keyed on score.notes, not score: updateVoice replaces the score object while
  // keeping the same notes, and rebuilding there would re-seat the cursor behind
  // notes already handed to smplr and sound them twice.
  const notes = t.score?.notes
  useEffect(() => {
    if (!notes) { schedulerRef.current = null; return }
    const s = new Scheduler(notes)
    s.seek(playheadAt(useTransport.getState(), engine.currentTime))
    schedulerRef.current = s
  }, [notes, engine])
```

- [ ] **Step 6: Write the failing component test**

`src/ui/VoicePanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoicePanel } from './VoicePanel'
import type { Voice } from '../model/types'

const voices: Voice[] = [
  { id: 'l', label: 'Left hand', hue: 207, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1 },
  { id: 'r', label: 'Right hand', hue: 28, instrument: 'acoustic_grand_piano', visible: true, audible: false, volume: 0.5 },
]

describe('VoicePanel', () => {
  it('renders a row per voice, labelled by its current name', () => {
    render(<VoicePanel voices={voices} onChange={() => {}} />)
    expect(screen.getByDisplayValue('Left hand')).toBeTruthy()
    expect(screen.getByDisplayValue('Right hand')).toBeTruthy()
  })

  it('reports a rename against the right voice id', () => {
    const onChange = vi.fn()
    render(<VoicePanel voices={voices} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('Right hand'), { target: { value: 'Melody' } })
    expect(onChange).toHaveBeenCalledWith('r', { label: 'Melody' })
  })

  it('reports hue as a number, not the input element string', () => {
    const onChange = vi.fn()
    render(<VoicePanel voices={voices} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Left hand colour'), { target: { value: '300' } })
    expect(onChange).toHaveBeenCalledWith('l', { hue: 300 })
  })

  it('shows the audible toggle pressed only for audible voices', () => {
    render(<VoicePanel voices={voices} onChange={() => {}} />)
    expect(screen.getByLabelText('Mute Left hand').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByLabelText('Mute Right hand').getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles visibility to the opposite of the current value', () => {
    const onChange = vi.fn()
    render(<VoicePanel voices={voices} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Hide Left hand'))
    expect(onChange).toHaveBeenCalledWith('l', { visible: false })
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/ui/VoicePanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./VoicePanel"`.

- [ ] **Step 8: Write the voice panel**

`src/ui/VoicePanel.tsx`. The instrument list comes from smplr's own GM name list, so it
can never drift from what `Soundfont` will actually accept.

```tsx
import { getSoundfontNames } from 'smplr'
import type { Voice } from '../model/types'

/** smplr's own General MIDI names -- the only ids Soundfont() will load. */
export const INSTRUMENT_OPTIONS: string[] = getSoundfontNames()

const pretty = (id: string) => id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function VoicePanel(props: {
  voices: Voice[]
  onChange: (id: string, patch: Partial<Voice>) => void
}) {
  const { voices, onChange } = props
  return (
    <div className="voice-panel flex flex-col gap-3">
      {voices.map((v) => (
        <div key={v.id} className="voice-row flex flex-col gap-1.5 rounded-md border border-[var(--line)] p-2">
          <div className="voice-row-head flex items-center gap-2">
            <span
              className="voice-swatch h-4 w-4 shrink-0 rounded-full border border-black/40"
              style={{ background: `hsl(${v.hue} 85% 58%)` }}
              aria-hidden
            />
            <input
              type="text"
              aria-label={`${v.label} name`}
              className="voice-label min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-[var(--ink)] hover:border-[var(--line)] focus:border-[var(--accent)] focus:outline-none"
              value={v.label}
              onChange={(e) => onChange(v.id, { label: e.target.value })}
            />
            <button
              type="button"
              aria-label={`Hide ${v.label}`}
              aria-pressed={!v.visible}
              className={`btn-voice-visible rounded border px-1.5 py-0.5 text-[10px] ${
                v.visible ? 'border-[var(--line)] text-[var(--ink-dim)]' : 'border-[var(--accent)] text-[var(--accent)]'
              }`}
              onClick={() => onChange(v.id, { visible: !v.visible })}
            >
              {v.visible ? 'Shown' : 'Hidden'}
            </button>
            <button
              type="button"
              aria-label={`Mute ${v.label}`}
              aria-pressed={!v.audible}
              className={`btn-voice-audible rounded border px-1.5 py-0.5 text-[10px] ${
                v.audible ? 'border-[var(--line)] text-[var(--ink-dim)]' : 'border-[var(--accent)] text-[var(--accent)]'
              }`}
              onClick={() => onChange(v.id, { audible: !v.audible })}
            >
              {v.audible ? 'Audible' : 'Muted'}
            </button>
          </div>

          <div className="voice-row-hue flex items-center gap-2">
            <label htmlFor={`voice-hue-${v.id}`} className="voice-control-label w-14 text-[11px] text-[var(--ink-dim)]">
              Colour
            </label>
            <input
              id={`voice-hue-${v.id}`}
              type="range"
              aria-label={`${v.label} colour`}
              className="voice-hue-slider h-1 flex-1 accent-[var(--accent)]"
              min={0} max={360} step={1}
              value={v.hue}
              onChange={(e) => onChange(v.id, { hue: Number(e.target.value) })}
            />
          </div>

          <div className="voice-row-volume flex items-center gap-2">
            <label htmlFor={`voice-vol-${v.id}`} className="voice-control-label w-14 text-[11px] text-[var(--ink-dim)]">
              Volume
            </label>
            <input
              id={`voice-vol-${v.id}`}
              type="range"
              aria-label={`${v.label} volume`}
              className="voice-volume-slider h-1 flex-1 accent-[var(--accent)]"
              min={0} max={1} step={0.01}
              value={v.volume}
              onChange={(e) => onChange(v.id, { volume: Number(e.target.value) })}
            />
            <span className="voice-volume-value w-8 text-right font-mono text-[10px] tabular-nums text-[var(--ink-dim)]">
              {Math.round(v.volume * 100)}
            </span>
          </div>

          <div className="voice-row-instrument flex items-center gap-2">
            <label htmlFor={`voice-inst-${v.id}`} className="voice-control-label w-14 text-[11px] text-[var(--ink-dim)]">
              Sound
            </label>
            <select
              id={`voice-inst-${v.id}`}
              aria-label={`${v.label} instrument`}
              className="voice-instrument-select min-w-0 flex-1 rounded border border-[var(--line)] bg-[var(--panel)] px-1 py-0.5 text-[11px] text-[var(--ink)]"
              value={v.instrument}
              onChange={(e) => onChange(v.id, { instrument: e.target.value })}
            >
              {INSTRUMENT_OPTIONS.map((id) => (
                <option key={id} value={id}>{pretty(id)}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 9: Run the component test to verify it passes**

Run: `npx vitest run src/ui/VoicePanel.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 10: Wire it into the app**

In `src/App.tsx`, add the import and the change handler:

```tsx
import { VoicePanel } from './ui/VoicePanel'
import type { Voice } from './model/types'
```

```tsx
  // Volume and instrument have audio-side effects; colour, label and visibility
  // are model-only and the draw loop picks them up on the next frame.
  const changeVoice = useCallback((id: string, patch: Partial<Voice>) => {
    useTransport.getState().updateVoice(id, patch)
    if (patch.volume !== undefined) engine.setVoiceVolume(id, patch.volume)
    if (patch.instrument !== undefined) {
      const v = useTransport.getState().score?.voices.find((x) => x.id === id)
      if (v) void engine.loadVoice(v)
    }
  }, [engine])
```

Add a section inside the `SettingsPanel`, after the Tempo section:

```tsx
                <SettingsSection id="voices" title="Voices">
                  <VoicePanel voices={t.score?.voices ?? []} onChange={changeVoice} />
                </SettingsSection>
```

- [ ] **Step 11: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 12: Manual check**

Run: `npm run dev -- --host 0.0.0.0`, load `docs/demo.mid`, play, open Settings → Voices.
Confirm, **while it is still playing**: dragging a hue slider recolours both the falling
bars and the lit keys with no audio glitch and **no doubled notes**; dragging volume to 0
silences that hand while the other keeps its level and its timbre (it should sound quiet,
not soft-struck); Hidden removes a hand from the roll but leaves it audible; Muted does
the reverse; changing Sound on one hand swaps only that hand's instrument.

- [ ] **Step 13: Commit**

```bash
git add src/ui/VoicePanel.tsx src/ui/VoicePanel.test.tsx src/transport/useTransport.ts src/transport/useTransport.test.ts src/App.tsx
git commit -m "feat: per-voice colour, label, instrument, mute and volume controls"
```

---

### Task 5: Velocity colour schemes

Two schemes, per spec §7: the shipped single-hue lightness ramp, and a multi-stop
gradient (default blue → green → yellow → red) interpolated across the velocity range.

**A deliberate trade-off:** in gradient mode the gradient *is* the colour language, so
**voice hue is ignored** — every voice shares the gradient and velocity alone drives
colour. Blending hue into a gradient produces muddy, unreadable colour, and spec §7
introduces the gradient as an alternative language rather than a modifier. The settings
UI must say so in one line, and voices stay distinguishable by show/hide.

**Files:**
- Modify: `src/render/colors.ts`, `src/render/colors.test.ts`, `src/render/keyboard.ts`, `src/render/pianoRoll.ts`, `src/render/pianoRoll.test.ts`, `src/App.tsx`
- Create: `src/ui/VelocityEditor.tsx`

**Interfaces:**
- Consumes: `VelocityScheme`, `GradientStop`, `DEFAULT_GRADIENT` from `src/settings/types.ts` (type-only import into `render/` — `settings/types.ts` has no runtime dependencies of its own)
- Produces:
  - `const DEFAULT_SCHEME: VelocityScheme` — `{ kind: 'lightness', lMax: 78, lMin: 38, sat: 85 }`
  - `hexToRgb(hex: string): [number, number, number]`
  - `gradientColor(velocity: number, stops: GradientStop[]): string`
  - `noteColor(hue: number, velocity: number, scheme?: VelocityScheme): string` — **signature change**
  - `velocityLightness(velocity: number, o: { lMax: number; lMin: number }): number` — unchanged behaviour
  - `RenderState` gains `velocity: VelocityScheme`
  - `drawKeyboard(ctx, state: RenderState, held: Map<number, NoteEvent>)` — **signature change**, it now takes the whole render state
  - `VelocityEditor` React component, props `{ scheme: VelocityScheme; onChange: (s: VelocityScheme) => void }`

- [ ] **Step 1: Write the failing tests**

Append to `src/render/colors.test.ts`:

```ts
import { gradientColor, hexToRgb, noteColor, DEFAULT_SCHEME } from './colors'

describe('hexToRgb', () => {
  it('parses six-digit hex', () => {
    expect(hexToRgb('#4a7cff')).toEqual([0x4a, 0x7c, 0xff])
  })

  it('parses three-digit hex by doubling each nibble', () => {
    expect(hexToRgb('#0f8')).toEqual([0, 255, 0x88])
  })

  it('falls back to mid grey rather than NaN on junk', () => {
    expect(hexToRgb('not a colour')).toEqual([128, 128, 128])
  })
})

describe('gradientColor', () => {
  const stops = [
    { at: 0, color: '#000000' },
    { at: 0.5, color: '#ff0000' },
    { at: 1, color: '#ffffff' },
  ]

  it('returns a stop colour exactly at that stop', () => {
    expect(gradientColor(0, stops)).toBe('rgb(0, 0, 0)')
    expect(gradientColor(127, stops)).toBe('rgb(255, 255, 255)')
  })

  it('interpolates linearly between two stops', () => {
    // velocity 31.75 is a quarter of the way = halfway between stop 0 and stop 1
    expect(gradientColor(127 * 0.25, stops)).toBe('rgb(128, 0, 0)')
  })

  it('clamps velocity outside 0-127 to the end stops', () => {
    expect(gradientColor(-50, stops)).toBe('rgb(0, 0, 0)')
    expect(gradientColor(999, stops)).toBe('rgb(255, 255, 255)')
  })

  it('sorts unsorted stops rather than producing nonsense', () => {
    const jumbled = [{ at: 1, color: '#ffffff' }, { at: 0, color: '#000000' }]
    expect(gradientColor(0, jumbled)).toBe('rgb(0, 0, 0)')
    expect(gradientColor(127, jumbled)).toBe('rgb(255, 255, 255)')
  })

  it('survives an empty or single-stop list', () => {
    expect(() => gradientColor(64, [])).not.toThrow()
    expect(gradientColor(64, [{ at: 0.3, color: '#123456' }])).toBe('rgb(18, 52, 86)')
  })
})

describe('noteColor scheme dispatch', () => {
  it('uses the voice hue in lightness mode', () => {
    expect(noteColor(207, 100, DEFAULT_SCHEME)).toContain('hsl(207')
  })

  it('ignores the voice hue in gradient mode, by design', () => {
    const scheme = { kind: 'gradient' as const, stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }] }
    expect(noteColor(207, 127, scheme)).toBe(noteColor(28, 127, scheme))
  })

  it('stays monotonic in gradient mode across the whole velocity range', () => {
    const scheme = { kind: 'gradient' as const, stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }] }
    let prev = -1
    for (let v = 0; v <= 127; v++) {
      const r = hexToRgb('#000000')[0] + 0   // keep lint quiet about unused import
      const m = /rgb\((\d+)/.exec(noteColor(0, v, scheme))!
      expect(Number(m[1]) + r).toBeGreaterThanOrEqual(prev)
      prev = Number(m[1])
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/render/colors.test.ts`
Expected: FAIL — `gradientColor is not exported`.

- [ ] **Step 3: Extend the colour module**

In `src/render/colors.ts`, add the type import, the new functions, and change
`noteColor`. Keep `velocityLightness`, `flashIntensity`, `hueForVoiceIndex`,
`VOICE_HUES`, `FLASH_MS` and `INTENSITY_FLOOR` exactly as they are.

```ts
import type { GradientStop, VelocityScheme } from '../settings/types'

export const DEFAULT_SCHEME: VelocityScheme = { kind: 'lightness', lMax: 78, lMin: 38, sat: 85 }

/** #rgb and #rrggbb. Junk returns mid grey rather than NaN, which would poison
    every downstream arithmetic op and paint nothing at all. */
export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(s)) {
    return [
      parseInt(s[0] + s[0], 16),
      parseInt(s[1] + s[1], 16),
      parseInt(s[2] + s[2], 16),
    ]
  }
  if (/^[0-9a-f]{6}$/i.test(s)) {
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ]
  }
  return [128, 128, 128]
}

/** Velocity -> a colour on the multi-stop gradient. Stops are sorted defensively;
    the editor lets a user drag one past another. */
export function gradientColor(velocity: number, stops: GradientStop[]): string {
  if (stops.length === 0) return 'rgb(128, 128, 128)'
  const sorted = [...stops].sort((a, b) => a.at - b.at)
  const t = clamp(velocity, 0, 127) / 127

  let lo = sorted[0]
  let hi = sorted[sorted.length - 1]
  if (t <= lo.at) hi = lo
  else if (t >= hi.at) lo = hi
  else {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (t >= sorted[i].at && t <= sorted[i + 1].at) { lo = sorted[i]; hi = sorted[i + 1]; break }
    }
  }

  const span = hi.at - lo.at
  const f = span <= 0 ? 0 : (t - lo.at) / span
  const a = hexToRgb(lo.color)
  const b = hexToRgb(hi.color)
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * f)
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`
}

/**
 * In lightness mode the voice hue carries voice identity and velocity drives
 * lightness. In gradient mode the gradient IS the colour language and hue is
 * deliberately ignored -- blending the two produces muddy, unreadable colour.
 */
export function noteColor(
  hue: number, velocity: number, scheme: VelocityScheme = DEFAULT_SCHEME,
): string {
  if (scheme.kind === 'gradient') return gradientColor(velocity, scheme.stops)
  return `hsl(${hue} ${scheme.sat}% ${velocityLightness(velocity, scheme).toFixed(1)}%)`
}
```

`velocityLightness`'s parameter type widens to `{ lMax: number; lMin: number }` so a
lightness-kind scheme satisfies it directly. Its body does not change. Keep
`DEFAULT_COLORS` exported as an alias of `DEFAULT_SCHEME`'s fields so the existing
`velocityLightness` tests keep compiling:

```ts
export const DEFAULT_COLORS = { lMax: 78, lMin: 38, sat: 85 }
```

- [ ] **Step 4: Thread the scheme through the renderers**

In `src/render/pianoRoll.ts`, add to `RenderState`:

```ts
  velocity: VelocityScheme
```

with `import type { VelocityScheme } from '../settings/types'`. Pass it at both
`noteColor` call sites inside `drawRoll`:

```ts
      g.addColorStop(0, noteColor(v.hue, Math.max(1, n.velocity - 14), state.velocity))
      g.addColorStop(1, noteColor(v.hue, n.velocity, state.velocity))
```

In `src/render/keyboard.ts`, change the signature to take the whole render state. This
is the last signature change this file needs — Task 12 adds the theme to `RenderState`
rather than to the argument list.

```ts
import type { RenderState } from './pianoRoll'

export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  held: Map<number, NoteEvent>,
): void {
  const { layout, voices } = state
  const { hitY, keyboardH, blackH } = layout
  // ...body unchanged, except the two noteColor calls:
  //   noteColor(v.hue, h.velocity, state.velocity)
}
```

Update the call in `drawStage`:

```ts
  drawKeyboard(ctx, state, held)
```

and every `RenderState` literal in `src/render/pianoRoll.test.ts` gains
`velocity: DEFAULT_SCHEME`.

- [ ] **Step 5: Run the render tests**

Run: `npx vitest run src/render/`
Expected: PASS. If `pianoRoll.test.ts` fails to compile, a `RenderState` literal is
missing the new field — add it rather than making the field optional.

- [ ] **Step 6: Write the velocity editor**

`src/ui/VelocityEditor.tsx`:

```tsx
import { DEFAULT_GRADIENT } from '../settings/types'
import { SettingsRow } from './SettingsPanel'
import type { VelocityScheme } from '../settings/types'

const LIGHTNESS_DEFAULT: VelocityScheme = { kind: 'lightness', lMax: 78, lMin: 38, sat: 85 }

export function VelocityEditor(props: {
  scheme: VelocityScheme
  onChange: (s: VelocityScheme) => void
}) {
  const { scheme, onChange } = props

  return (
    <div className="velocity-editor flex flex-col gap-1">
      <SettingsRow label="Scheme">
        <div className="velocity-scheme-switch flex gap-1">
          {(['lightness', 'gradient'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={scheme.kind === k}
              className={`btn-velocity-scheme rounded-md border px-2 py-0.5 text-[11px] capitalize ${
                scheme.kind === k
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() =>
                onChange(k === 'lightness' ? LIGHTNESS_DEFAULT : { kind: 'gradient', stops: DEFAULT_GRADIENT })
              }
            >
              {k}
            </button>
          ))}
        </div>
      </SettingsRow>

      {scheme.kind === 'lightness' ? (
        <>
          <SettingsRow label="Soft note lightness" htmlFor="vel-lmax">
            <input
              id="vel-lmax" type="range" aria-label="Soft note lightness"
              className="velocity-lmax h-1 w-32 accent-[var(--accent)]"
              min={40} max={95} step={1} value={scheme.lMax}
              onChange={(e) => onChange({ ...scheme, lMax: Number(e.target.value) })}
            />
          </SettingsRow>
          <SettingsRow label="Hard note lightness" htmlFor="vel-lmin">
            <input
              id="vel-lmin" type="range" aria-label="Hard note lightness"
              className="velocity-lmin h-1 w-32 accent-[var(--accent)]"
              min={10} max={70} step={1} value={scheme.lMin}
              onChange={(e) => onChange({ ...scheme, lMin: Number(e.target.value) })}
            />
          </SettingsRow>
          <SettingsRow label="Saturation" htmlFor="vel-sat">
            <input
              id="vel-sat" type="range" aria-label="Saturation"
              className="velocity-sat h-1 w-32 accent-[var(--accent)]"
              min={0} max={100} step={1} value={scheme.sat}
              onChange={(e) => onChange({ ...scheme, sat: Number(e.target.value) })}
            />
          </SettingsRow>
        </>
      ) : (
        <div className="velocity-stops flex flex-col gap-1">
          {scheme.stops.map((stop, i) => (
            <div key={i} className="velocity-stop flex items-center gap-2">
              <input
                type="color"
                aria-label={`Gradient stop ${i + 1} colour`}
                className="velocity-stop-color h-6 w-8 rounded border border-[var(--line)] bg-transparent"
                value={stop.color}
                onChange={(e) => {
                  const stops = scheme.stops.map((s, j) => (j === i ? { ...s, color: e.target.value } : s))
                  onChange({ kind: 'gradient', stops })
                }}
              />
              <input
                type="range"
                aria-label={`Gradient stop ${i + 1} position`}
                className="velocity-stop-at h-1 flex-1 accent-[var(--accent)]"
                min={0} max={1} step={0.01} value={stop.at}
                onChange={(e) => {
                  const stops = scheme.stops.map((s, j) => (j === i ? { ...s, at: Number(e.target.value) } : s))
                  onChange({ kind: 'gradient', stops })
                }}
              />
              <button
                type="button"
                aria-label={`Remove gradient stop ${i + 1}`}
                className="btn-stop-remove rounded border border-[var(--line)] px-1.5 text-[10px] text-[var(--ink-dim)]"
                disabled={scheme.stops.length <= 2}
                onClick={() => onChange({ kind: 'gradient', stops: scheme.stops.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-stop-add self-start rounded border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--ink-dim)]"
            onClick={() => onChange({ kind: 'gradient', stops: [...scheme.stops, { at: 1, color: '#ffffff' }] })}
          >
            Add stop
          </button>
          <p className="velocity-gradient-note text-[11px] leading-snug text-[var(--ink-dim)]">
            The gradient replaces per-voice colour: velocity alone drives hue.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Wire it in**

In `src/App.tsx`, import `useSettings` and `VelocityEditor`, read the scheme, and put it
on the render state. Add near the other store reads:

```tsx
  const settings = useSettings()
```

Inside the draw callback, read settings the same way transport is read — from
`getState()`, never from the closed-over React value, so the loop never goes stale:

```tsx
      const st = useSettings.getState()
      const rs: RenderState = {
        // ...existing fields
        velocity: st.velocity,
      }
```

and add the section:

```tsx
                <SettingsSection id="velocity" title="Velocity colour">
                  <VelocityEditor scheme={settings.velocity} onChange={settings.setVelocity} />
                </SettingsSection>
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 9: Commit**

```bash
git add src/render/colors.ts src/render/colors.test.ts src/render/keyboard.ts src/render/pianoRoll.ts src/render/pianoRoll.test.ts src/ui/VelocityEditor.tsx src/App.tsx
git commit -m "feat: selectable velocity colour schemes with a multi-stop gradient"
```

---

### Task 6: Keyboard zoom with full black-key groups

Spec §8: on load the keyboard auto-fits to the piece's pitch range so simple pieces get
large readable keys, and **the fitted range is then widened so it never cuts through the
middle of a black-key group** — a keyboard ending between C# and D#, or between F# and
G#, reads as broken. The rule is chordl's `ensureFullBlackKeyGroups`, quoted verbatim
from the spec:

> extend the start down to **C** when it lands on **D**, to **F** when it lands on **G** or **A**;
> extend the end up to **E** when it lands on **D**, to **B** when it lands on **G** or **A**.

`KeyboardLayout` also gains `stageW` and `whiteCount`, because `whiteW * 52` stops being
the keyboard's width the moment the range is not the full 88.

**Files:**
- Modify: `src/render/geometry.ts`, `src/render/geometry.test.ts`, `src/render/keyboard.ts`, `src/render/pianoRoll.ts`, `src/App.tsx`
- Create: `src/ui/DisplaySettings.tsx`

**Interfaces:**
- Consumes: `NoteEvent` from `src/model/types.ts`; `ZoomMode` from `src/settings/types.ts`
- Produces:
  - `GeometryOpts` gains `firstPitch: number`, `lastPitch: number`
  - `KeyboardLayout` gains `stageW: number`, `whiteCount: number`
  - `whiteKeyCount(lo: number, hi: number): number`
  - `ensureFullBlackKeyGroups(lo: number, hi: number): [number, number]`
  - `fitRange(notes: { pitch: number }[]): [number, number]`
  - `const MIN_FIT_SEMITONES = 24`
  - `DisplaySettings` React component, props `{ display: DisplaySettingsType; fallSeconds: number; onDisplay: (p: Partial<DisplaySettingsType>) => void; onFallSeconds: (s: number) => void }`

- [ ] **Step 1: Write the failing tests**

Append to `src/render/geometry.test.ts`:

```ts
import {
  computeLayout, ensureFullBlackKeyGroups, fitRange, whiteKeyCount,
  FIRST_PITCH, LAST_PITCH,
} from './geometry'

describe('whiteKeyCount', () => {
  it('counts the full 88-key keyboard as 52 whites', () => {
    expect(whiteKeyCount(FIRST_PITCH, LAST_PITCH)).toBe(52)
  })

  it('counts one octave C-B as 7 whites', () => {
    expect(whiteKeyCount(60, 71)).toBe(7)
  })
})

describe('ensureFullBlackKeyGroups', () => {
  it('extends a start on D down to C, and an end on G up to B', () => {
    expect(ensureFullBlackKeyGroups(62, 79)).toEqual([60, 83])   // D4..G5 -> C4..B5
  })

  it('extends a start on A down to F, and an end on D up to E', () => {
    expect(ensureFullBlackKeyGroups(69, 74)).toEqual([65, 76])   // A4..D5 -> F4..E5
  })

  it('leaves a C..B range untouched', () => {
    expect(ensureFullBlackKeyGroups(60, 71)).toEqual([60, 71])
  })

  it('leaves a start on E and an end on C untouched -- neither cuts a group', () => {
    expect(ensureFullBlackKeyGroups(64, 72)).toEqual([64, 72])
  })

  it('snaps a black-key bound out to its neighbouring white key first', () => {
    expect(ensureFullBlackKeyGroups(61, 82)).toEqual([60, 83])   // C#4..A#5
  })

  it('never widens past the 88-key keyboard', () => {
    expect(ensureFullBlackKeyGroups(FIRST_PITCH, LAST_PITCH)).toEqual([FIRST_PITCH, LAST_PITCH])
  })
})

describe('fitRange', () => {
  it('returns the whole keyboard for an empty score', () => {
    expect(fitRange([])).toEqual([FIRST_PITCH, LAST_PITCH])
  })

  it('widens a narrow piece to at least two octaves, then to whole groups', () => {
    // C4..E4 is 4 semitones; padded alternately up and down to 24 gives D3..D5,
    // which then widens to C3..E5 because both bounds land on D.
    expect(fitRange([{ pitch: 60 }, { pitch: 64 }])).toEqual([48, 76])
  })

  it('fits a wide piece to its own range, widened to whole groups', () => {
    // D3..G#5 already spans more than two octaves, so only the group rule applies.
    expect(fitRange([{ pitch: 50 }, { pitch: 80 }])).toEqual([48, 83])
  })
})

describe('computeLayout with a pitch range', () => {
  it('is unchanged at the default full range', () => {
    const l = computeLayout(1220, 700)
    expect(l.whiteCount).toBe(52)
    expect(l.stageW).toBeCloseTo(1220, 6)
    expect(l.whiteW).toBeCloseTo(1220 / 52, 9)
    expect(l.keys).toHaveLength(88)
  })

  it('tiles a narrower range across the SAME stage width, with wider keys', () => {
    const l = computeLayout(1220, 700, { firstPitch: 60, lastPitch: 71 })
    expect(l.whiteCount).toBe(7)
    expect(l.whiteW).toBeCloseTo(1220 / 7, 9)
    expect(l.keys[0].pitch).toBe(60)
    expect(l.keys[0].x).toBeCloseTo(0, 9)
    expect(l.byPitch.get(59)).toBeUndefined()
  })

  it('still tiles the whites edge to edge with no gap or overhang', () => {
    const l = computeLayout(1220, 700, { firstPitch: 65, lastPitch: 88 })
    const whites = l.keys.filter((k) => !k.black)
    expect(whites[0].x).toBeCloseTo(0, 9)
    const last = whites[whites.length - 1]
    expect(last.x + last.w).toBeCloseTo(l.stageW, 6)
  })

  it('keeps G# exactly on the white-key boundary inside a zoomed range', () => {
    const l = computeLayout(1220, 700, { firstPitch: 60, lastPitch: 71 })
    const gSharp = l.byPitch.get(68)!
    const a = l.byPitch.get(69)!
    expect(gSharp.x + gSharp.w / 2).toBeCloseTo(a.x, 6)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/render/geometry.test.ts`
Expected: FAIL — `ensureFullBlackKeyGroups is not exported`.

- [ ] **Step 3: Extend the geometry module**

In `src/render/geometry.ts`, add `stageW` and `whiteCount` to `KeyboardLayout`,
`firstPitch`/`lastPitch` to `GeometryOpts` and `DEFAULT_GEOMETRY`, and add the three new
functions. `BLACK_OFFSET`, `DEFAULT_GEOMETRY`'s ratios and `pitchAt` are unchanged.

```ts
/** White-key pitch classes a range boundary may safely land on. Anything else
    cuts a black-key group in half, which reads as a broken keyboard. */
const START_SAFE = new Set([0, 4, 5, 11])   // C, E, F, B
const END_SAFE = new Set([0, 4, 5, 11])     // C, E, F, B

export const MIN_FIT_SEMITONES = 24

const pc = (p: number) => ((p % 12) + 12) % 12

export function whiteKeyCount(lo: number, hi: number): number {
  let n = 0
  for (let p = lo; p <= hi; p++) if (!isBlackKey(p)) n++
  return n
}

/**
 * chordl's ensureFullBlackKeyGroups, per spec §8: extend the start down to C
 * when it lands on D, to F when it lands on G or A; extend the end up to E when
 * it lands on D, to B when it lands on G or A. A black-key bound is snapped out
 * to its neighbouring white key first. Never widens past the 88-key keyboard --
 * the A0/A#0/B0 partial group at the bottom is inherent to a real piano.
 */
export function ensureFullBlackKeyGroups(lo: number, hi: number): [number, number] {
  let a = Math.max(FIRST_PITCH, Math.min(LAST_PITCH, lo))
  let b = Math.max(FIRST_PITCH, Math.min(LAST_PITCH, hi))
  if (isBlackKey(a)) a--
  if (isBlackKey(b)) b++
  a = Math.max(FIRST_PITCH, a)
  b = Math.min(LAST_PITCH, b)
  while (a > FIRST_PITCH && !START_SAFE.has(pc(a))) a--
  while (b < LAST_PITCH && !END_SAFE.has(pc(b))) b++
  return [a, b]
}

/** The piece's own pitch range, floored at two octaves so a sparse piece does
    not blow the keys up to absurd size, then widened to whole groups. */
export function fitRange(notes: { pitch: number }[]): [number, number] {
  if (notes.length === 0) return [FIRST_PITCH, LAST_PITCH]
  let lo = Infinity
  let hi = -Infinity
  for (const n of notes) {
    if (n.pitch < lo) lo = n.pitch
    if (n.pitch > hi) hi = n.pitch
  }
  lo = Math.max(FIRST_PITCH, Math.min(LAST_PITCH, lo))
  hi = Math.max(FIRST_PITCH, Math.min(LAST_PITCH, hi))
  let short = MIN_FIT_SEMITONES - (hi - lo)
  while (short > 0 && (lo > FIRST_PITCH || hi < LAST_PITCH)) {
    if (hi < LAST_PITCH) { hi++; short-- }
    if (short > 0 && lo > FIRST_PITCH) { lo--; short-- }
  }
  return ensureFullBlackKeyGroups(lo, hi)
}
```

`DEFAULT_GEOMETRY` gains:

```ts
  firstPitch: FIRST_PITCH,
  lastPitch: LAST_PITCH,
```

and `computeLayout`'s body changes only in how it counts and where it starts:

```ts
  const o = { ...DEFAULT_GEOMETRY, ...opts }
  const count = Math.max(1, whiteKeyCount(o.firstPitch, o.lastPitch))
  const whiteW = stageW / count
  // ...blackW, keyboardH, blackH, hitY unchanged...

  const keys: KeyRect[] = []
  let wi = 0
  for (let p = o.firstPitch; p <= o.lastPitch; p++) {
    // ...unchanged body...
  }
  return {
    keys,
    byPitch: new Map(keys.map((k) => [k.pitch, k])),
    whiteW, blackW, keyboardH, blackH, hitY,
    stageW, whiteCount: count,
  }
```

- [ ] **Step 4: Stop deriving the stage width from 52**

`whiteW * 52` is now wrong for any zoomed range. In `src/render/keyboard.ts`:

```ts
  ctx.fillRect(0, hitY, layout.stageW, 1)
```

and in `src/render/pianoRoll.ts`'s `drawStage`:

```ts
  const stageW = layout.stageW
```

deleting the `const stageW = layout.whiteW * 52` line.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/render/ && node tests/geometry-check.mjs`
Expected: PASS on both. The standalone oracle must still agree — it checks the full-88
case, which this task must leave byte-identical.

- [ ] **Step 6: Write the display settings control**

`src/ui/DisplaySettings.tsx`. It covers zoom, fall speed, octave grid, flash and the
middle-C marker — the whole "Display" row of spec §9 except mode, which already lives in
the transport bar.

```tsx
import { SettingsRow } from './SettingsPanel'
import type { DisplaySettings as DisplaySettingsType, ZoomMode } from '../settings/types'

export function DisplaySettings(props: {
  display: DisplaySettingsType
  fallSeconds: number
  onDisplay: (patch: Partial<DisplaySettingsType>) => void
  onFallSeconds: (sec: number) => void
}) {
  const { display, fallSeconds, onDisplay, onFallSeconds } = props
  return (
    <div className="display-settings flex flex-col gap-1">
      <SettingsRow label="Keyboard zoom">
        <div className="zoom-switch flex gap-1">
          {([['full', 'Full 88'], ['fit', 'Fit piece']] as [ZoomMode, string][]).map(([m, text]) => (
            <button
              key={m}
              type="button"
              aria-pressed={display.zoom === m}
              className={`btn-zoom rounded-md border px-2 py-0.5 text-[11px] ${
                display.zoom === m
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() => onDisplay({ zoom: m })}
            >
              {text}
            </button>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow label="Fall time" htmlFor="fall-seconds">
        <input
          id="fall-seconds" type="range" aria-label="Fall time"
          className="fall-seconds-slider h-1 w-32 accent-[var(--accent)]"
          min={0.5} max={8} step={0.1} value={fallSeconds}
          onChange={(e) => onFallSeconds(Number(e.target.value))}
        />
        <span className="fall-seconds-value w-10 text-right font-mono text-[10px] tabular-nums text-[var(--ink-dim)]">
          {fallSeconds.toFixed(1)}s
        </span>
      </SettingsRow>

      <SettingsRow label="Octave grid">
        <input
          type="checkbox" aria-label="Octave grid"
          className="grid-toggle accent-[var(--accent)]"
          checked={display.showGrid}
          onChange={(e) => onDisplay({ showGrid: e.target.checked })}
        />
      </SettingsRow>

      <SettingsRow label="Strike flash">
        <input
          type="checkbox" aria-label="Strike flash"
          className="flash-toggle accent-[var(--accent)]"
          checked={display.showFlash}
          onChange={(e) => onDisplay({ showFlash: e.target.checked })}
        />
      </SettingsRow>

      <SettingsRow label="Flash intensity" htmlFor="flash-scale">
        <input
          id="flash-scale" type="range" aria-label="Flash intensity"
          className="flash-scale-slider h-1 w-32 accent-[var(--accent)]"
          min={0} max={1.5} step={0.05} value={display.flashScale}
          disabled={!display.showFlash}
          onChange={(e) => onDisplay({ flashScale: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Middle C marker">
        <input
          type="checkbox" aria-label="Middle C marker"
          className="middle-c-toggle accent-[var(--accent)]"
          checked={display.showMiddleC}
          onChange={(e) => onDisplay({ showMiddleC: e.target.checked })}
        />
      </SettingsRow>
    </div>
  )
}
```

- [ ] **Step 7: Honour flash scale and the middle-C toggle in the renderers**

In `src/render/pianoRoll.ts`, add `flashScale: number` to `RenderState` and multiply it
into the intensity inside `drawImpact`:

```ts
    const i = flashIntensity(t - n.startSec, n.velocity) * state.flashScale
```

In `src/render/keyboard.ts`, add `showMiddleC: boolean` to `RenderState` and gate the
middle-C block on it:

```ts
    if (k.pitch === MIDDLE_C && state.showMiddleC) {
```

Every `RenderState` literal in `src/render/pianoRoll.test.ts` gains
`flashScale: 1, showMiddleC: true`.

- [ ] **Step 8: Wire zoom and display settings into the app**

In `src/App.tsx`, import `fitRange`, `FIRST_PITCH`, `LAST_PITCH` and `DisplaySettings`.
Cache the range by score identity and zoom mode, alongside the existing caches:

```tsx
  const rangeRef = useRef<{ score: ScoreDocument | null; zoom: ZoomMode; range: [number, number] }>({
    score: null, zoom: 'full', range: [FIRST_PITCH, LAST_PITCH],
  })

  // Cached for the same reason voicesFor and layoutFor are: fitRange scans every
  // note in the score, and the range only changes on load or on a zoom switch.
  function rangeFor(score: ScoreDocument | null, zoom: ZoomMode): [number, number] {
    const c = rangeRef.current
    if (c.score === score && c.zoom === zoom) return c.range
    const range: [number, number] =
      zoom === 'fit' && score ? fitRange(score.notes) : [FIRST_PITCH, LAST_PITCH]
    rangeRef.current = { score, zoom, range }
    return range
  }
```

Extend the layout cache key to include the range:

```tsx
  const layoutRef = useRef<{ w: number; h: number; first: number; last: number; layout: KeyboardLayout } | null>(null)

  function layoutFor(w: number, h: number, first: number, last: number): KeyboardLayout {
    const cached = layoutRef.current
    if (!cached || cached.w !== w || cached.h !== h || cached.first !== first || cached.last !== last) {
      const layout = computeLayout(w, h, { firstPitch: first, lastPitch: last })
      layoutRef.current = { w, h, first, last, layout }
      return layout
    }
    return cached.layout
  }
```

and use them in the draw callback:

```tsx
      const [first, last] = rangeFor(state.score, st.display.zoom)
      const layout = layoutFor(w, h, first, last)
      const rs: RenderState = {
        // ...existing fields
        showGrid: state.mode === 'roll' && st.display.showGrid,
        showFlash: st.display.showFlash,
        flashScale: st.display.flashScale,
        showMiddleC: st.display.showMiddleC,
      }
```

Add the section:

```tsx
                <SettingsSection id="display" title="Display">
                  <DisplaySettings
                    display={settings.display}
                    fallSeconds={t.fallSeconds}
                    onDisplay={settings.setDisplay}
                    onFallSeconds={t.setFallSeconds}
                  />
                </SettingsSection>
```

- [ ] **Step 9: Verify**

Run: `npm test && npm run build && node tests/geometry-check.mjs`
Expected: all pass.

- [ ] **Step 10: Manual check**

Run: `npm run dev -- --host 0.0.0.0`, load `docs/demo.mid`, and switch zoom to **Fit
piece**. Confirm the keys get wider, the keyboard still tiles the full width with no gap
at either end, and **neither end of the keyboard sits between two black keys of the same
group** — the left edge is a C, E, F or B, and so is the right edge.

- [ ] **Step 11: Commit**

```bash
git add src/render/geometry.ts src/render/geometry.test.ts src/render/keyboard.ts src/render/pianoRoll.ts src/render/pianoRoll.test.ts src/ui/DisplaySettings.tsx src/App.tsx
git commit -m "feat: keyboard zoom that fits the piece without cutting black-key groups"
```

---

### Task 7: Metronome driven by the tempo map

The click is **derived from the score's tempo map, not from a fixed interval**, so it
follows a ritardando and stays correct under both tempo modes. Beat positions are
computed in ticks — the truth — and converted to seconds exactly as notes are.

**Files:**
- Create: `src/audio/metronome.ts`, `src/audio/metronome.test.ts`
- Modify: `src/io/parseMidi.ts`, `src/io/parseMidi.test.ts`, `src/model/types.ts`, `src/audio/engine.ts`, `src/App.tsx`, `src/ui/SettingsPanel.tsx` consumers

**Interfaces:**
- Consumes: `ticksToSec` from `src/model/tempoMap.ts`; `ScoreDocument`, `TempoSetting` from `src/model/types.ts`
- Produces:
  - `ScoreDocument` gains `beatsPerBar: number`
  - `interface Beat { sec: number; accent: boolean }`
  - `beatTimes(score: ScoreDocument, setting: TempoSetting): Beat[]`
  - `class BeatCursor` with `seek(playheadSec)` and `collect(playheadSec): Beat[]` — same contract as `Scheduler`
  - `class MetronomeVoice` with `constructor(ctx: BaseAudioContext, destination: AudioNode)` and `click(time: number, accent: boolean, volume: number): void`
  - `AudioEngine` gains `get audioContext(): AudioContext` and `get masterNode(): GainNode`

- [ ] **Step 1: Write the failing tests**

`src/audio/metronome.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BeatCursor, beatTimes } from './metronome'
import { buildTempoMap } from '../model/tempoMap'
import type { NoteEvent, ScoreDocument } from '../model/types'

function score(patch: Partial<ScoreDocument> = {}): ScoreDocument {
  const notes: NoteEvent[] = [
    { id: 0, pitch: 60, startTicks: 0, durTicks: 1920, startSec: 0, endSec: 2, velocity: 90, voiceId: 'a' },
  ]
  return {
    id: 'x', name: 'x', ppq: 480,
    tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480),
    voices: [], notes, durationSec: 2, sourceFormat: 'midi', beatsPerBar: 4,
    ...patch,
  }
}

describe('beatTimes', () => {
  it('places a beat on every quarter note, inclusive of the last', () => {
    const beats = beatTimes(score(), { mode: 'scale', scale: 1 })
    expect(beats.map((b) => b.sec)).toEqual([0, 0.5, 1, 1.5, 2])
  })

  it('accents the first beat of each bar', () => {
    const beats = beatTimes(score(), { mode: 'scale', scale: 1 })
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, false, true])
  })

  it('follows the time signature', () => {
    const beats = beatTimes(score({ beatsPerBar: 3 }), { mode: 'scale', scale: 1 })
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, true, false])
  })

  it('follows the tempo scale', () => {
    const beats = beatTimes(score(), { mode: 'scale', scale: 2 })
    expect(beats.map((b) => b.sec)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('follows a tempo change in the map rather than a fixed interval', () => {
    const s = score({ tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }], 480) })
    const beats = beatTimes(s, { mode: 'scale', scale: 1 })
    // 0.5s per beat at 120, then 1.0s per beat from tick 960 (= 1.0s) onward
    expect(beats.map((b) => b.sec)).toEqual([0, 0.5, 1, 2, 3])
  })

  it('flattens the map in absolute mode', () => {
    const s = score({ tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }], 480) })
    const beats = beatTimes(s, { mode: 'absolute', bpm: 60 })
    expect(beats.map((b) => b.sec)).toEqual([0, 1, 2, 3, 4])
  })

  it('returns nothing for an empty score', () => {
    expect(beatTimes(score({ notes: [] }), { mode: 'scale', scale: 1 })).toEqual([])
  })
})

describe('BeatCursor', () => {
  const beats = [0, 0.5, 1, 1.5, 2].map((sec, i) => ({ sec, accent: i % 4 === 0 }))

  it('hands back each beat exactly once', () => {
    const c = new BeatCursor(beats)
    const seen = [
      ...c.collect(0), ...c.collect(0.5), ...c.collect(1),
      ...c.collect(1.5), ...c.collect(2),
    ]
    expect(seen.map((b) => b.sec)).toEqual([0, 0.5, 1, 1.5, 2])
  })

  it('includes a beat inside the lookahead window', () => {
    const c = new BeatCursor(beats)
    // 0.4 + 0.15 lookahead reaches 0.55, so beats at 0 and 0.5 are both due
    expect(c.collect(0.4).map((b) => b.sec)).toEqual([0, 0.5])
  })

  it('re-seats in both directions on seek', () => {
    const c = new BeatCursor(beats)
    c.collect(2)
    c.seek(1)
    expect(c.collect(1).map((b) => b.sec)).toEqual([1, 1.5])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/audio/metronome.test.ts`
Expected: FAIL — `Failed to resolve import "./metronome"`.

- [ ] **Step 3: Add `beatsPerBar` to the model and the parser**

In `src/model/types.ts`, add to `ScoreDocument`:

```ts
  beatsPerBar: number    // from the file's first time signature; 4 if absent
```

In `src/io/parseMidi.ts`, read it from the header and put it on the score:

```ts
  // @tonejs/midi exposes timeSignature as [numerator, denominator].
  const beatsPerBar = midi.header.timeSignatures[0]?.timeSignature?.[0] ?? 4
```

```ts
  const score: ScoreDocument = {
    id: '', name, ppq, tempoMap, voices, notes,
    durationSec: 0, sourceFormat: 'midi', beatsPerBar,
  }
```

Every `ScoreDocument` literal in existing tests now needs `beatsPerBar`. Add
`beatsPerBar: 4` to each rather than making the field optional — an optional field would
let a missing value reach `beatTimes` as `undefined` and produce `NaN` beat indices.

Add one parser test in `src/io/parseMidi.test.ts`:

```ts
  it('defaults beatsPerBar to 4 when the file carries no time signature', () => {
    const score = parseMidi(fixtureBytes(), 'x.mid', { mode: 'scale', scale: 1 })
    expect(score.beatsPerBar).toBe(4)
  })
```

using whatever fixture helper that file already has.

- [ ] **Step 4: Write the metronome**

`src/audio/metronome.ts`:

```ts
import { ticksToSec } from '../model/tempoMap'
import { LOOKAHEAD_SEC } from './scheduler'
import type { ScoreDocument, TempoSetting } from '../model/types'

export interface Beat { sec: number; accent: boolean }

/**
 * Beat positions are computed in TICKS and converted through the tempo map,
 * never as a fixed interval. That is what makes the click follow a ritardando
 * and stay correct in both tempo modes.
 */
export function beatTimes(score: ScoreDocument, setting: TempoSetting): Beat[] {
  if (score.notes.length === 0) return []
  const lastTick = score.notes.reduce((m, n) => Math.max(m, n.startTicks + n.durTicks), 0)
  const perBar = Math.max(1, Math.round(score.beatsPerBar))
  const beats: Beat[] = []
  for (let i = 0, ticks = 0; ticks <= lastTick; i++, ticks = i * score.ppq) {
    beats.push({
      sec: ticksToSec(score.tempoMap, score.ppq, ticks, setting),
      accent: i % perBar === 0,
    })
  }
  return beats
}

/** Same cursor contract as Scheduler, over beats instead of notes. */
export class BeatCursor {
  private cursor = 0
  private beats: Beat[]

  constructor(beats: Beat[]) {
    this.beats = beats
  }

  seek(playheadSec: number): void {
    let lo = 0, hi = this.beats.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.beats[mid].sec < playheadSec) lo = mid + 1
      else hi = mid
    }
    this.cursor = lo
  }

  collect(playheadSec: number): Beat[] {
    const horizon = playheadSec + LOOKAHEAD_SEC
    const out: Beat[] = []
    while (this.cursor < this.beats.length && this.beats[this.cursor].sec < horizon) {
      out.push(this.beats[this.cursor++])
    }
    return out
  }
}

const ACCENT_HZ = 1600
const BEAT_HZ = 1000
const CLICK_SEC = 0.035

/**
 * A synthesised click rather than a sample: it needs no load, cannot fail, and
 * is scheduled at an exact AudioContext time like every other sound in the app.
 */
export class MetronomeVoice {
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly destination: AudioNode,
  ) {}

  click(time: number, accent: boolean, volume: number): void {
    if (volume <= 0) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = accent ? ACCENT_HZ : BEAT_HZ
    gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)) * 0.25, time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_SEC)
    osc.connect(gain)
    gain.connect(this.destination)
    osc.start(time)
    osc.stop(time + CLICK_SEC)
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/audio/metronome.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Expose the context and master node from the engine**

In `src/audio/engine.ts`, add two accessors to `AudioEngine`. The metronome routes
through the master gain so master volume applies to it too.

```ts
  get audioContext(): AudioContext {
    return this.context()
  }

  get masterNode(): GainNode {
    this.context()
    return this.master!
  }
```

- [ ] **Step 7: Drive the click from the app's scheduler tick**

In `src/App.tsx`, add the refs and build the beat cursor in the same effect that builds
the note scheduler:

```tsx
  const beatsRef = useRef<BeatCursor | null>(null)
  const metronomeRef = useRef<MetronomeVoice | null>(null)
```

```tsx
  useEffect(() => {
    if (!notes) { schedulerRef.current = null; beatsRef.current = null; return }
    const head = playheadAt(useTransport.getState(), engine.currentTime)
    const s = new Scheduler(notes)
    s.seek(head)
    schedulerRef.current = s
    const score = useTransport.getState().score!
    const b = new BeatCursor(beatTimes(score, useTransport.getState().tempo))
    b.seek(head)
    beatsRef.current = b
  }, [notes, engine])
```

Inside the scheduler interval, after the note loop:

```tsx
      const audio = useSettings.getState().audio
      if (audio.metronome && beatsRef.current) {
        if (!metronomeRef.current) {
          metronomeRef.current = new MetronomeVoice(engine.audioContext, engine.masterNode)
        }
        for (const beat of beatsRef.current.collect(head)) {
          metronomeRef.current.click(state.originSec + beat.sec, beat.accent, audio.metronomeVolume)
        }
      } else {
        // Keep the cursor level with the playhead while the click is off, so
        // switching it on mid-piece does not fire every beat since the start.
        beatsRef.current?.seek(head)
      }
```

and re-seat it in `seek`:

```tsx
    beatsRef.current?.seek(playheadAt(useTransport.getState(), now))
```

alongside the existing `schedulerRef.current?.seek(...)` calls in both `seek` and
`toggle`.

- [ ] **Step 8: Add the audio settings section**

In `src/App.tsx`, add a section with master volume and the metronome controls. Master
volume must reach the engine as well as the store:

```tsx
  const changeMasterVolume = useCallback((v: number) => {
    useSettings.getState().setAudio({ masterVolume: v })
    engine.setMasterVolume(v)
  }, [engine])
```

```tsx
                <SettingsSection id="audio" title="Audio">
                  <SettingsRow label="Master volume" htmlFor="master-volume">
                    <input
                      id="master-volume" type="range" aria-label="Master volume"
                      className="master-volume-slider h-1 w-32 accent-[var(--accent)]"
                      min={0} max={1} step={0.01} value={settings.audio.masterVolume}
                      onChange={(e) => changeMasterVolume(Number(e.target.value))}
                    />
                  </SettingsRow>
                  <SettingsRow label="Metronome">
                    <input
                      type="checkbox" aria-label="Metronome"
                      className="metronome-toggle accent-[var(--accent)]"
                      checked={settings.audio.metronome}
                      onChange={(e) => settings.setAudio({ metronome: e.target.checked })}
                    />
                  </SettingsRow>
                  <SettingsRow label="Metronome volume" htmlFor="metronome-volume">
                    <input
                      id="metronome-volume" type="range" aria-label="Metronome volume"
                      className="metronome-volume-slider h-1 w-32 accent-[var(--accent)]"
                      min={0} max={1} step={0.01} value={settings.audio.metronomeVolume}
                      disabled={!settings.audio.metronome}
                      onChange={(e) => settings.setAudio({ metronomeVolume: Number(e.target.value) })}
                    />
                  </SettingsRow>
                </SettingsSection>
```

Apply the stored master volume once on load, next to `engine.resume()` in `loadFile`:

```tsx
      engine.setMasterVolume(useSettings.getState().audio.masterVolume)
```

- [ ] **Step 9: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 10: Manual check**

Run: `npm run dev -- --host 0.0.0.0`, load `docs/demo.mid`, turn the metronome on and
play. Confirm the click lands on the beat, the first beat of each bar is higher, dragging
the tempo scale changes the click rate with the music, and switching the metronome on
mid-piece does **not** fire a burst of catch-up clicks.

- [ ] **Step 11: Commit**

```bash
git add src/audio/metronome.ts src/audio/metronome.test.ts src/audio/engine.ts src/io/parseMidi.ts src/io/parseMidi.test.ts src/model/types.ts src/App.tsx
git commit -m "feat: tempo-map-driven metronome with bar accents"
```

---

### Task 8: Profile JSON — autosave, export and import

Spec §10. Settings autosave to `localStorage` keyed by the file's **content hash**, which
`hashFile.ts` already computes on load, so reopening a piece restores its colours, tempo
and display mode with no user action.

**Song-scoped and global are stored separately**, per the spec: song keys (`voices`,
`tempo`, `display`, `theme`, `text`) always apply on import; the `global` block
(velocity scheme, audio levels) is a snapshot that import applies **only if asked**, so
sharing a profile for its colours does not silently rewrite someone's audio settings.

**Files:**
- Create: `src/settings/profile.ts`, `src/settings/profile.test.ts`, `src/ui/ProfileSettings.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Settings` from `src/settings/types.ts`; `Voice`, `ScoreDocument`, `TempoSetting` from `src/model/types.ts`; `DisplayMode` from `src/transport/useTransport.ts`
- Produces:
  - `const PROFILE_SCHEMA_VERSION = 1`
  - `interface SongProfile { schemaVersion; song; voices; tempo; display; theme; text; global }`
  - `buildProfile(args): SongProfile`
  - `encodeProfile(p: SongProfile): string`
  - `decodeProfile(json: string): SongProfile` — throws `Error` on bad JSON or unknown version
  - `mergeVoices(parsed: Voice[], saved: Voice[]): Voice[]`
  - `saveProfile(p: SongProfile): void`, `loadProfile(songId: string): SongProfile | null`
  - `saveGlobals(g: GlobalPrefs): void`, `loadGlobals(): GlobalPrefs | null`
  - `interface GlobalPrefs { velocity: VelocityScheme; audio: AudioSettings }`
  - `ProfileSettings` React component, props `{ onExport: () => void; onImport: (file: File, applyGlobals: boolean) => void; onReset: () => void; error: string | null }`

- [ ] **Step 1: Write the failing tests**

`src/settings/profile.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  PROFILE_SCHEMA_VERSION, buildProfile, decodeProfile, encodeProfile,
  loadGlobals, loadProfile, mergeVoices, saveGlobals, saveProfile,
} from './profile'
import { DEFAULT_SETTINGS } from './types'
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
    expect(p.display).toEqual({ mode: 'keyboard', fallSeconds: 4.5 })
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

  it('stores globals under their own key, independent of any song', () => {
    saveGlobals({ velocity: DEFAULT_SETTINGS.velocity, audio: { ...DEFAULT_SETTINGS.audio, masterVolume: 0.2 } })
    expect(loadGlobals()!.audio.masterVolume).toBe(0.2)
    expect(loadProfile('sha-1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/settings/profile.test.ts`
Expected: FAIL — `Failed to resolve import "./profile"`.

- [ ] **Step 3: Write the profile module**

`src/settings/profile.ts`:

```ts
import type { AudioSettings, Settings, TextSettings, ThemeSettings, VelocityScheme } from './types'
import type { ScoreDocument, TempoSetting, Voice } from '../model/types'
import type { DisplayMode } from '../transport/useTransport'

export const PROFILE_SCHEMA_VERSION = 1

const PROFILE_PREFIX = 'tmi.profile.'
const GLOBALS_KEY = 'tmi.globals'

/** App-wide preferences: they follow the user, not the song. */
export interface GlobalPrefs {
  velocity: VelocityScheme
  audio: AudioSettings
}

export interface SongProfile {
  schemaVersion: number
  song: { id: string; name: string; format: ScoreDocument['sourceFormat'] }
  voices: Voice[]
  tempo: TempoSetting
  display: { mode: DisplayMode; fallSeconds: number }
  theme: ThemeSettings
  text: TextSettings
  /** A snapshot of the globals at export time. Import applies it only on request. */
  global: GlobalPrefs
}

export function buildProfile(args: {
  song: SongProfile['song']
  voices: Voice[]
  tempo: TempoSetting
  mode: DisplayMode
  fallSeconds: number
  settings: Settings
}): SongProfile {
  return structuredClone({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    song: args.song,
    voices: args.voices,
    tempo: args.tempo,
    display: { mode: args.mode, fallSeconds: args.fallSeconds },
    theme: args.settings.theme,
    text: args.settings.text,
    global: { velocity: args.settings.velocity, audio: args.settings.audio },
  })
}

export function encodeProfile(p: SongProfile): string {
  return JSON.stringify(p, null, 2)
}

/**
 * Throws rather than returning a partial profile. Spec §11: an unknown
 * schemaVersion must be refused outright, keeping current settings, instead of
 * being half-applied and leaving the app in a state nobody chose.
 */
export function decodeProfile(json: string): SongProfile {
  const raw = JSON.parse(json) as Partial<SongProfile>
  if (raw.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported profile version ${String(raw.schemaVersion)} — this app reads version ${PROFILE_SCHEMA_VERSION}.`,
    )
  }
  if (!raw.song?.id || !Array.isArray(raw.voices) || !raw.tempo || !raw.display) {
    throw new Error('Profile is missing required fields.')
  }
  return raw as SongProfile
}

/**
 * Saved settings are applied ONTO the freshly parsed voices, matched by id. The
 * parsed voice is the source of truth for identity; the profile only supplies
 * presentation. A saved id that no longer exists is dropped, and a saved entry
 * can never rename an id -- otherwise a stale profile would orphan every note,
 * whose voiceId still points at the parsed value.
 */
export function mergeVoices(parsed: Voice[], saved: Voice[]): Voice[] {
  const by = new Map(saved.map((v) => [v.id, v]))
  return parsed.map((v) => {
    const s = by.get(v.id)
    if (!s) return v
    return {
      ...v,
      label: s.label ?? v.label,
      hue: s.hue ?? v.hue,
      instrument: s.instrument ?? v.instrument,
      visible: s.visible ?? v.visible,
      audible: s.audible ?? v.audible,
      volume: s.volume ?? v.volume,
    }
  })
}

/** localStorage can throw (private mode, quota). Persistence is a convenience,
    never a correctness requirement, so every access is guarded. */
function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* quota or private mode */ }
}

export function saveProfile(p: SongProfile): void {
  write(PROFILE_PREFIX + p.song.id, encodeProfile(p))
}

export function loadProfile(songId: string): SongProfile | null {
  const raw = read(PROFILE_PREFIX + songId)
  if (!raw) return null
  try { return decodeProfile(raw) } catch { return null }
}

export function saveGlobals(g: GlobalPrefs): void {
  write(GLOBALS_KEY, JSON.stringify(g))
}

export function loadGlobals(): GlobalPrefs | null {
  const raw = read(GLOBALS_KEY)
  if (!raw) return null
  try {
    const g = JSON.parse(raw) as Partial<GlobalPrefs>
    return g.velocity && g.audio ? (g as GlobalPrefs) : null
  } catch { return null }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/settings/profile.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Write the profile UI**

`src/ui/ProfileSettings.tsx`:

```tsx
import { useRef, useState } from 'react'

export function ProfileSettings(props: {
  onExport: () => void
  onImport: (file: File, applyGlobals: boolean) => void
  onReset: () => void
  error: string | null
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [applyGlobals, setApplyGlobals] = useState(false)

  return (
    <div className="profile-settings flex flex-col gap-2">
      <div className="profile-actions flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-profile-export rounded border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)]"
          onClick={props.onExport}
        >
          Export profile
        </button>
        <button
          type="button"
          className="btn-profile-import rounded border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)]"
          onClick={() => fileRef.current?.click()}
        >
          Import profile
        </button>
        <button
          type="button"
          className="btn-profile-reset rounded border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)]"
          onClick={props.onReset}
        >
          Reset to defaults
        </button>
      </div>

      <label className="profile-globals-opt flex items-center gap-2 text-[11px] text-[var(--ink-dim)]">
        <input
          type="checkbox"
          className="profile-globals-checkbox accent-[var(--accent)]"
          checked={applyGlobals}
          onChange={(e) => setApplyGlobals(e.target.checked)}
        />
        Also apply the file’s global preferences (velocity colour, audio levels)
      </label>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.tmi.json,application/json"
        aria-label="Import profile file"
        className="profile-file-input hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) props.onImport(f, applyGlobals)
          e.target.value = ''
        }}
      />

      {props.error && (
        <p className="profile-error text-[11px] text-[#ff6b6b]">{props.error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire autosave, restore, export and import into the app**

In `src/App.tsx`, add the imports and a `profileError` state, then:

**Restore on load.** Inside `loadFile`, after `score.id = await hashFile(bytes)` and
before `useTransport.getState().loadScore(score)`:

```tsx
    const saved = loadProfile(score.id)
    if (saved) {
      score.voices = mergeVoices(score.voices, saved.voices)
      // Set tempo BEFORE loadScore: loadScore retimes the incoming score to the
      // live tempo setting, so the setting has to be right first.
      useTransport.setState({ tempo: saved.tempo })
      useSettings.getState().replaceAll({
        ...useSettings.getState(), theme: saved.theme, text: saved.text,
      })
    }
```

and after `loadScore(score)`:

```tsx
    if (saved) {
      useTransport.getState().setMode(saved.display.mode)
      useTransport.getState().setFallSeconds(saved.display.fallSeconds)
    }
```

**Globals at startup**, once:

```tsx
  useEffect(() => {
    const g = loadGlobals()
    if (!g) return
    useSettings.getState().setVelocity(g.velocity)
    useSettings.getState().setAudio(g.audio)
    engine.setMasterVolume(g.audio.masterVolume)
  }, [engine])
```

**Autosave**, debounced so a slider drag writes once rather than sixty times:

```tsx
  useEffect(() => {
    const id = setTimeout(() => {
      const st = useSettings.getState()
      saveGlobals({ velocity: st.velocity, audio: st.audio })
      const tr = useTransport.getState()
      if (!tr.score?.id) return
      saveProfile(buildProfile({
        song: { id: tr.score.id, name: tr.score.name, format: tr.score.sourceFormat },
        voices: tr.score.voices,
        tempo: tr.tempo,
        mode: tr.mode,
        fallSeconds: tr.fallSeconds,
        settings: currentSettings(),
      }))
    }, 400)
    return () => clearTimeout(id)
  }, [t.score, t.tempo, t.mode, t.fallSeconds, settings])
```

**Export and import:**

```tsx
  const exportProfile = useCallback(() => {
    const tr = useTransport.getState()
    if (!tr.score) return
    const p = buildProfile({
      song: { id: tr.score.id, name: tr.score.name, format: tr.score.sourceFormat },
      voices: tr.score.voices, tempo: tr.tempo, mode: tr.mode,
      fallSeconds: tr.fallSeconds, settings: currentSettings(),
    })
    const url = URL.createObjectURL(new Blob([encodeProfile(p)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${tr.score.name.replace(/\.[^.]+$/, '')}.tmi.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importProfile = useCallback(async (file: File, applyGlobals: boolean) => {
    let p
    try {
      p = decodeProfile(await file.text())
    } catch (e) {
      // Refused outright -- current settings are untouched.
      setProfileError((e as Error).message)
      return
    }
    setProfileError(null)
    const tr = useTransport.getState()
    useSettings.getState().replaceAll({
      ...currentSettings(), theme: p.theme, text: p.text,
      ...(applyGlobals ? { velocity: p.global.velocity, audio: p.global.audio } : {}),
    })
    if (applyGlobals) engine.setMasterVolume(p.global.audio.masterVolume)
    if (tr.score) {
      const voices = mergeVoices(tr.score.voices, p.voices)
      useTransport.setState({ score: { ...tr.score, voices } })
      for (const v of voices) { engine.setVoiceVolume(v.id, v.volume); void engine.loadVoice(v) }
      tr.setTempo(p.tempo, engine.currentTime)
      engine.stopAll()
      tr.setMode(p.display.mode)
      tr.setFallSeconds(p.display.fallSeconds)
    }
  }, [engine])
```

and the section:

```tsx
                <SettingsSection id="profile" title="Profile">
                  <ProfileSettings
                    onExport={exportProfile}
                    onImport={(f, g) => void importProfile(f, g)}
                    onReset={() => useSettings.getState().reset()}
                    error={profileError}
                  />
                </SettingsSection>
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 8: Manual check**

Run: `npm run dev -- --host 0.0.0.0`. Load `docs/demo.mid`, change a voice colour and the
tempo, then **reload the page and load the same file again** — the colour and tempo must
come back. Export the profile, reset to defaults, then import the file: the colours
return but the master volume does not, unless the globals checkbox was ticked. Finally
edit the exported file's `schemaVersion` to `2` and import it: it must be refused with a
message, leaving the current settings untouched.

- [ ] **Step 9: Commit**

```bash
git add src/settings/profile.ts src/settings/profile.test.ts src/ui/ProfileSettings.tsx src/App.tsx
git commit -m "feat: profile autosave by content hash, plus export and import"
```

---

### Task 9: Admin/debug route

Spec §16: the tuning rig is not throwaway — it ships as the app's admin/debug mode,
reached by a route the normal UI does not link to. `tools/strike-lab.html` is standalone
with no build step and no dependencies, so it is served as a static asset rather than
rebuilt as a React view.

**Files:**
- Create: `public/debug/strike-lab.html` (a copy, kept in step by the check below), `src/debug/DebugRoute.tsx`
- Modify: `src/main.tsx`, `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `DebugRoute` React component; `npm run sync:rig` script

- [ ] **Step 1: Publish the rig as a static asset**

Vite serves `public/` verbatim at the site root, which is what a dependency-free HTML
file needs. Copy it and add a script so the two copies cannot silently diverge:

```bash
mkdir -p public/debug
cp tools/strike-lab.html public/debug/strike-lab.html
```

Add to `package.json` scripts:

```json
    "sync:rig": "cp tools/strike-lab.html public/debug/strike-lab.html && diff -q tools/strike-lab.html public/debug/strike-lab.html"
```

- [ ] **Step 2: Write the debug route**

`src/debug/DebugRoute.tsx`. The app has no router and does not need one for a single
hidden path — `window.location.pathname` is enough, and it keeps the bundle unchanged.

```tsx
/**
 * Spec §16: reachable at /debug, deliberately unlinked from the normal UI.
 * The rig itself is the dependency-free tools/strike-lab.html, served from
 * public/ and framed here so the route stays inside the app shell.
 */
export function DebugRoute() {
  return (
    <div className="debug-route flex h-full flex-col bg-[var(--ground)]">
      <div className="debug-bar flex items-center gap-3 border-b border-[var(--line)] px-4 py-2">
        <span className="debug-title text-xs font-semibold uppercase tracking-wide text-[var(--ink-dim)]">
          Strike lab — visual constant tuning rig
        </span>
        <a className="debug-back text-xs text-[var(--accent)]" href="/">Back to the app</a>
      </div>
      <iframe
        title="Strike lab"
        src="/debug/strike-lab.html"
        className="debug-frame min-h-0 flex-1 border-0"
      />
    </div>
  )
}
```

- [ ] **Step 3: Route to it at startup**

In `src/main.tsx`, choose the root component by path:

```tsx
import { DebugRoute } from './debug/DebugRoute'
```

```tsx
const isDebug = window.location.pathname.replace(/\/+$/, '') === '/debug'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDebug ? <DebugRoute /> : <App />}
  </StrictMode>,
)
```

Vite's dev server serves `index.html` for unknown paths by default in SPA mode; if
`/debug` 404s, add `appType: 'spa'` to `vite.config.ts`.

- [ ] **Step 4: Verify**

Run: `npm run sync:rig && npm test && npm run build`
Expected: the rig copies and diffs clean, all tests pass, build clean.

- [ ] **Step 5: Manual check**

Run: `npm run dev -- --host 0.0.0.0` and open `/debug`. The rig must load with its live
controls, the Constants button must still export JSON, and the naive-geometry toggle must
still reproduce the boundary-centred bug. The normal UI must contain no link to it.

- [ ] **Step 6: Commit**

```bash
git add public/debug/strike-lab.html src/debug/DebugRoute.tsx src/main.tsx package.json
git commit -m "feat: hidden /debug route carrying the strike-lab tuning rig"
```

---

## Part B — Video compositing and theming

### Task 10: The CSS token system

Spec §14. A `<canvas>` has no DOM, so CSS selectors cannot reach anything drawn on it —
the token system is what makes class-based theming real. `readTheme(el)` resolves every
token with `getComputedStyle` into a plain object which rides on `RenderState`, so the
renderers stay pure functions of `(ctx, state, t)`.

**`readTheme` runs once per layout or theme change, never per frame.**
`getComputedStyle` forces a style recalculation and would cost more than the drawing does.

**One deviation from spec §14.1, worth stating.** The two flash tokens are named
`--tmi-flash-core-rgb` and `--tmi-flash-warm-rgb` and hold a bare `r, g, b` triple rather
than a complete `rgba()`. The flash's alpha is computed per frame from velocity and age,
so a complete colour literal cannot express it; the triple composes as
`rgba(${theme.flashCoreRgb}, ${alpha})`. Every other token is exactly as the spec names it.

**Files:**
- Create: `src/render/theme.ts`, `src/render/theme.test.ts`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface Theme` (18 fields, below)
  - `const DEFAULT_THEME: Theme`
  - `type StyleReader = (el: Element) => Pick<CSSStyleDeclaration, 'getPropertyValue'>`
  - `readTheme(el: Element | null, read?: StyleReader): Theme`
  - `parsePx(value: string, fallback: number): number`
  - `lineDash(style: string, width: number): number[]`
  - `isTransparent(color: string): boolean`

- [ ] **Step 1: Write the failing tests**

`src/render/theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_THEME, isTransparent, lineDash, parsePx, readTheme } from './theme'

/** jsdom does not resolve CSS custom properties, so the reader is injected. */
const reader = (tokens: Record<string, string>) => () => ({
  getPropertyValue: (k: string) => tokens[k] ?? '',
})

const el = {} as Element

describe('parsePx', () => {
  it('reads a px value', () => { expect(parsePx('3px', 1)).toBe(3) })
  it('reads a bare number', () => { expect(parsePx('2', 1)).toBe(2) })
  it('reads a fractional value', () => { expect(parsePx('0.5px', 1)).toBe(0.5) })
  it('falls back on an empty or junk value', () => {
    expect(parsePx('', 7)).toBe(7)
    expect(parsePx('thick', 7)).toBe(7)
  })
})

describe('lineDash', () => {
  it('maps solid to no dash at all', () => { expect(lineDash('solid', 1)).toEqual([]) })
  it('maps dashed and dotted to their spec patterns', () => {
    expect(lineDash('dashed', 1)).toEqual([6, 4])
    expect(lineDash('dotted', 1)).toEqual([1, 3])
  })
  it('scales the pattern by line width, so a thick dash stays proportional', () => {
    expect(lineDash('dashed', 2)).toEqual([12, 8])
  })
  it('falls back to solid for anything it does not know', () => {
    expect(lineDash('groovy', 1)).toEqual([])
    expect(lineDash('', 1)).toEqual([])
  })
})

describe('isTransparent', () => {
  it('detects the keyword', () => { expect(isTransparent('transparent')).toBe(true) })
  it('detects a zero-alpha rgba, which is what getComputedStyle returns', () => {
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true)
    expect(isTransparent('rgb(0 0 0 / 0)')).toBe(true)
  })
  it('does not fire on an opaque colour', () => {
    expect(isTransparent('#000000')).toBe(false)
    expect(isTransparent('rgba(0, 0, 0, 0.01)')).toBe(false)
  })
})

describe('readTheme', () => {
  it('returns every default when no token resolves', () => {
    expect(readTheme(el, reader({}))).toEqual(DEFAULT_THEME)
  })

  it('returns every default for a null element, so the first frame never throws', () => {
    expect(readTheme(null)).toEqual(DEFAULT_THEME)
  })

  it('adopts a colour token', () => {
    const t = readTheme(el, reader({ '--tmi-key-white': '#ff0000' }))
    expect(t.keyWhite).toBe('#ff0000')
    expect(t.keyBlack).toBe(DEFAULT_THEME.keyBlack)
  })

  it('parses numeric tokens rather than leaving them as strings', () => {
    const t = readTheme(el, reader({ '--tmi-key-radius': '6px', '--tmi-bar-radius': '0px' }))
    expect(t.keyRadius).toBe(6)
    expect(t.barRadius).toBe(0)
  })

  it('resolves the grid dash from its style token AND its width token', () => {
    const t = readTheme(el, reader({ '--tmi-grid-line-style': 'dotted', '--tmi-grid-line-width': '2px' }))
    expect(t.gridLineDash).toEqual([2, 6])
    expect(t.gridLineWidth).toBe(2)
  })

  it('carries a transparent stage background through verbatim', () => {
    const t = readTheme(el, reader({ '--tmi-stage-bg': 'transparent' }))
    expect(isTransparent(t.stageBg)).toBe(true)
  })

  it('trims whitespace, which getComputedStyle leaves on custom properties', () => {
    const t = readTheme(el, reader({ '--tmi-key-white': '  #abcdef  ' }))
    expect(t.keyWhite).toBe('#abcdef')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/render/theme.test.ts`
Expected: FAIL — `Failed to resolve import "./theme"`.

- [ ] **Step 3: Write the theme module**

`src/render/theme.ts`:

```ts
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
    have to be recognised or §13.1's transparent stage silently paints black. */
export function isTransparent(color: string): boolean {
  const c = color.trim().toLowerCase()
  if (c === 'transparent') return true
  const m = /^rgba?\(([^)]*)\)$/.exec(c)
  if (!m) return false
  const parts = m[1].split(/[,/]/).map((s) => s.trim()).filter(Boolean)
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/render/theme.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Declare the tokens in CSS**

Append to `src/index.css`, after the existing `:root` block:

```css
/* Canvas theme tokens (spec §14.1). A <canvas> has no DOM, so these are read
   once per layout or theme change by readTheme() and handed to the renderers.
   Every colour literal that used to be hardcoded in keyboard.ts and
   pianoRoll.ts lives here. */
:root {
  --tmi-stage-bg: #000000;
  --tmi-key-white: #f6f2e4;
  --tmi-key-black: #0c0c10;
  --tmi-key-border: rgba(255, 255, 255, 0.16);
  --tmi-key-border-width: 1px;
  --tmi-key-radius: 0px;
  --tmi-key-gap: 1px;
  --tmi-middle-c-mark: rgba(0, 0, 0, 0.55);
  --tmi-black-key-top: rgba(255, 255, 255, 0.35);
  --tmi-grid-line: rgba(255, 255, 255, 0.06);
  --tmi-grid-line-c4: rgba(255, 255, 255, 0.14);
  --tmi-grid-line-width: 1px;
  --tmi-grid-line-style: solid;
  --tmi-bar-radius: 4px;
  --tmi-flash-core-rgb: 255, 255, 255;
  --tmi-flash-warm-rgb: 255, 242, 214;
  --tmi-progress-track: rgba(255, 255, 255, 0.06);
  --tmi-progress-fill: #e8384f;
}
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean. Nothing renders differently yet — Task 11 makes
the renderers read the theme.

- [ ] **Step 7: Commit**

```bash
git add src/render/theme.ts src/render/theme.test.ts src/index.css
git commit -m "feat: CSS custom property token system for the canvas"
```

---

### Task 11: Renderers consume the theme, and the stage can go transparent

This removes the sixteen hardcoded colour literals from `keyboard.ts` and
`pianoRoll.ts` and implements spec §13.1: `drawStage` **clears** rather than fills when
`--tmi-stage-bg` resolves to `transparent`, so an OBS browser source composites the page
over live video with no export step at all. The canvas context is already created with
alpha (the default), so `useCanvasStage` needs no change.

**Files:**
- Create: `src/render/shapes.ts`
- Modify: `src/render/keyboard.ts`, `src/render/pianoRoll.ts`, `src/render/pianoRoll.test.ts`, `src/App.tsx`

**Interfaces:**
- Consumes: `Theme`, `DEFAULT_THEME`, `readTheme`, `isTransparent` from Task 10
- Produces:
  - `roundRect(ctx, x, y, w, h, r): void` moved to `src/render/shapes.ts` and exported
  - `RenderState` gains `theme: Theme`

- [ ] **Step 1: Extract the shared rounded-rect helper**

`roundRect` currently lives inside `pianoRoll.ts` and the keyboard now needs it too.
`pianoRoll.ts` imports `drawKeyboard` from `keyboard.ts`, so a value import back the
other way would make a real module cycle. Move it to its own file instead.

`src/render/shapes.ts`:

```ts
/** Falls back to a plain rect where roundRect is unavailable, so no browser
    loses the keyboard entirely over corner rounding. */
export function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 3, Math.abs(h) / 2))
  if (rad > 0 && typeof ctx.roundRect === 'function') {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fill()
  } else {
    ctx.fillRect(x, y, w, h)
  }
}
```

Delete the local copy from `pianoRoll.ts` and import it from `./shapes` there.

- [ ] **Step 2: Put the theme on the render state**

In `src/render/pianoRoll.ts`, add to `RenderState`:

```ts
  theme: Theme
```

with `import type { Theme } from './theme'`.

- [ ] **Step 3: Rewrite the keyboard renderer against the theme**

`src/render/keyboard.ts`. Every literal is gone; `WHITE_FILL` and `BLACK_FILL` are
deleted. `MIDDLE_C` and `MIN_WHITE_W_FOR_LABEL` stay.

```ts
import { noteColor } from './colors'
import { roundRect } from './shapes'
import type { NoteEvent } from '../model/types'
import type { RenderState } from './pianoRoll'

const MIDDLE_C = 60
// Below this whiteW the "C4" label would render as illegible mush -- skip it
// entirely rather than draw noise at phone scale.
const MIN_WHITE_W_FOR_LABEL = 14

export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  held: Map<number, NoteEvent>,
): void {
  const { layout, voices, theme } = state
  const { hitY, keyboardH, blackH } = layout

  for (const k of layout.keys) {
    if (k.black) continue
    const h = held.get(k.pitch)
    const v = h ? voices.get(h.voiceId) : undefined
    ctx.fillStyle = h && v ? noteColor(v.hue, h.velocity, state.velocity) : theme.keyWhite
    roundRect(ctx, k.x, hitY, Math.max(1, k.w - theme.keyGap), keyboardH, theme.keyRadius)

    // Middle C carries a dark border and a "C4" label so orientation
    // survives phone scale, where 88 keys means ~16px per white key.
    if (k.pitch === MIDDLE_C && state.showMiddleC) {
      ctx.fillStyle = theme.middleCMark
      ctx.fillRect(k.x, hitY, 1.5, keyboardH)
      ctx.fillRect(k.x + k.w - 2.5, hitY, 1.5, keyboardH)

      if (layout.whiteW >= MIN_WHITE_W_FOR_LABEL) {
        ctx.save()
        ctx.fillStyle = theme.middleCMark
        ctx.font = `600 ${Math.round(layout.whiteW * 0.42)}px Poppins, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText('C4', k.x + k.w / 2, hitY + keyboardH - layout.whiteW * 0.3)
        ctx.restore()
      }
    }
  }

  for (const k of layout.keys) {
    if (!k.black) continue
    const h = held.get(k.pitch)
    const v = h ? voices.get(h.voiceId) : undefined
    ctx.fillStyle = h && v ? noteColor(v.hue, h.velocity, state.velocity) : theme.keyBlack
    roundRect(ctx, k.x, hitY, k.w, blackH, theme.keyRadius)
    if (h) {
      ctx.fillStyle = theme.blackKeyTop
      ctx.fillRect(k.x, hitY, k.w, 2)
    }
  }

  ctx.fillStyle = theme.keyBorder
  ctx.fillRect(0, hitY, layout.stageW, theme.keyBorderWidth)
}
```

- [ ] **Step 4: Rewrite the roll, grid, flash and stage against the theme**

In `src/render/pianoRoll.ts`:

`drawRoll`'s bar corner radius comes from the theme:

```ts
      roundRect(ctx, k.x + (k.black ? 0.5 : 1), top, k.w - (k.black ? 1 : 2), h, theme.barRadius)
```

with `const { layout, voices, fallSeconds, theme } = state` at the top. Delete the
`const BAR_RADIUS = 4` constant.

`drawImpact` takes its colours from the theme. The alpha is still computed per frame from
intensity, which is why the tokens hold a bare RGB triple:

```ts
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
    rg.addColorStop(0, `rgba(${theme.flashCoreRgb}, ${(0.9 * i).toFixed(3)})`)
    rg.addColorStop(0.35, `rgba(${theme.flashWarmRgb}, ${(0.34 * i).toFixed(3)})`)
    rg.addColorStop(1, `rgba(${theme.flashCoreRgb}, 0)`)
```

```ts
    const bg = ctx.createLinearGradient(0, cy - 26, 0, cy + 20)
    bg.addColorStop(0, `rgba(${theme.flashCoreRgb}, 0)`)
    bg.addColorStop(0.5, `rgba(${theme.flashCoreRgb}, ${(0.85 * i).toFixed(3)})`)
    bg.addColorStop(1, `rgba(${theme.flashCoreRgb}, 0)`)
```

```ts
    ctx.strokeStyle = `rgba(${theme.flashCoreRgb}, ${(0.7 * i).toFixed(3)})`
```

`drawStage`'s background, grid and progress bar:

```ts
export function drawStage(
  ctx: CanvasRenderingContext2D, state: RenderState, t: number, progress: number,
): void {
  const { layout, theme } = state
  const stageW = layout.stageW
  const stageH = layout.hitY + layout.keyboardH

  // Spec §13.1: a transparent stage CLEARS instead of filling, so an OBS
  // browser source composites live video through the page. Alpha, not chroma
  // key -- the impact layer draws with 'lighter', and an additive white bloom
  // over green keys as desaturated fringing at the brightest moment of a note.
  if (isTransparent(theme.stageBg)) {
    ctx.clearRect(0, 0, stageW, stageH)
  } else {
    ctx.fillStyle = theme.stageBg
    ctx.fillRect(0, 0, stageW, stageH)
  }

  if (state.showGrid) {
    // The dash array is set inside save()/restore() so it cannot leak into the
    // bars, the keys or the flash -- exactly as the impact layer's composite op is.
    ctx.save()
    ctx.setLineDash(theme.gridLineDash)
    ctx.lineWidth = theme.gridLineWidth
    for (let p = 24; p <= 108; p += 12) {
      const k = layout.byPitch.get(p)
      if (!k) continue
      ctx.strokeStyle = p === 60 ? theme.gridLineC4 : theme.gridLine
      ctx.beginPath()
      ctx.moveTo(k.x + theme.gridLineWidth / 2, 0)
      ctx.lineTo(k.x + theme.gridLineWidth / 2, layout.hitY)
      ctx.stroke()
    }
    ctx.restore()
  }

  // ...vis, drawRoll, held, drawKeyboard, drawImpact unchanged...

  ctx.fillStyle = theme.progressTrack
  ctx.fillRect(0, stageH - 3, stageW, 3)
  ctx.fillStyle = theme.progressFill
  ctx.fillRect(0, stageH - 3, stageW * Math.min(1, Math.max(0, progress)), 3)
}
```

with `import { isTransparent } from './theme'`.

- [ ] **Step 5: Update the render tests**

Every `RenderState` literal in `src/render/pianoRoll.test.ts` gains
`theme: DEFAULT_THEME`. The grid now **strokes** rather than fills, so any assertion
counting `fillRect` calls against grid lines must move to counting `stroke` calls. Add
two tests for the new behaviour:

```ts
  it('clears rather than fills when the stage background is transparent', () => {
    const ctx = recordingCtx()             // the existing stub helper in this file
    drawStage(ctx, { ...baseState(), theme: { ...DEFAULT_THEME, stageBg: 'transparent' } }, 0, 0)
    expect(ctx.calls.filter((c) => c === 'clearRect')).toHaveLength(1)
  })

  it('fills the stage when the background is an opaque colour', () => {
    const ctx = recordingCtx()
    drawStage(ctx, { ...baseState(), theme: { ...DEFAULT_THEME, stageBg: '#00b140' } }, 0, 0)
    expect(ctx.calls.filter((c) => c === 'clearRect')).toHaveLength(0)
  })
```

If the stub does not record `clearRect` or `stroke`/`setLineDash`, add them to it.

- [ ] **Step 6: Read the theme once per theme change in the app**

In `src/App.tsx`, add a ref to the stage wrapper and a theme cache. This is the third
cache in the draw path, for the same reason as the other two: `getComputedStyle` forces a
style recalculation and must never run per frame.

```tsx
  const stageWrapRef = useRef<HTMLDivElement | null>(null)
  const themeRef = useRef<{ key: string; theme: Theme }>({ key: '', theme: DEFAULT_THEME })

  // Keyed on the theme class and the stage-background override -- the only two
  // inputs that can change what the tokens resolve to. React commits the class
  // to the DOM before the next rAF, so the first frame after a switch is correct.
  function themeFor(name: ThemeName, override: string | null): Theme {
    const key = `${name}|${override ?? ''}`
    if (themeRef.current.key !== key) {
      themeRef.current = { key, theme: readTheme(stageWrapRef.current) }
    }
    return themeRef.current.theme
  }
```

In the draw callback:

```tsx
      const rs: RenderState = {
        // ...existing fields
        theme: themeFor(st.theme.name, st.theme.stageBgOverride),
      }
```

and put the ref, the theme class and the override on the wrapper:

```tsx
      <div
        ref={stageWrapRef}
        className={`stage-wrap theme-${settings.theme.name} relative min-h-0 flex-1`}
        style={settings.theme.stageBgOverride
          ? ({ '--tmi-stage-bg': settings.theme.stageBgOverride } as React.CSSProperties)
          : undefined}
      >
```

Note the `bg-[var(--stage)]` utility is **removed** from that div — the canvas paints the
stage background itself now, and a Tailwind background would sit behind a transparent
canvas and defeat §13.1.

- [ ] **Step 7: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 8: Manual check**

Run: `npm run dev -- --host 0.0.0.0` and load `docs/demo.mid`. The app must look
**exactly as it did before this task** — same ivory keys, same black keys, same grid,
same flash, same progress bar. Any visible difference is a token that was transcribed
wrong. Then, in devtools, set `--tmi-key-white: red` on `:root` and confirm the white
keys turn red without a reload.

- [ ] **Step 9: Commit**

```bash
git add src/render/shapes.ts src/render/keyboard.ts src/render/pianoRoll.ts src/render/pianoRoll.test.ts src/App.tsx
git commit -m "feat: renderers read every colour from CSS tokens, stage can clear to alpha"
```

---

### Task 12: Keyboard themes and the compositing controls

Spec §14.2 and §13.2. Shipped themes are **ordinary CSS classes** — a block of token
overrides and nothing else — so a user or a stylesheet can add more without touching
code. Alongside them, the stage background can be forced to a flat matte for workflows
that genuinely require keying rather than alpha, with the warning the spec requires.

**Files:**
- Modify: `src/index.css`, `src/App.tsx`
- Create: `src/ui/ThemeSettings.tsx`

**Interfaces:**
- Consumes: `ThemeName`, `ThemeSettings` type from `src/settings/types.ts`
- Produces:
  - CSS classes `.theme-classic`, `.theme-outline`, `.theme-contrast`, `.theme-transparent`
  - CSS class `html.tmi-transparent` for page-level alpha
  - `const MATTE_PRESETS: { label: string; color: string }[]`
  - `ThemeSettings` React component, props `{ theme: ThemeSettingsType; onChange: (p: Partial<ThemeSettingsType>) => void }`

- [ ] **Step 1: Write the theme classes**

Append to `src/index.css`. Each preset is token overrides only — no selectors reaching
into the canvas, because none could.

```css
/* Spec §14.2. Each preset is a block of token overrides and nothing else, so a
   stylesheet can add more without touching code. */
.theme-classic { /* the :root defaults */ }

.theme-outline {
  --tmi-key-white: transparent;
  --tmi-key-black: rgba(0, 0, 0, 0.35);
  --tmi-key-border: rgba(255, 255, 255, 0.85);
  --tmi-key-border-width: 2px;
  --tmi-key-radius: 3px;
  --tmi-key-gap: 2px;
  --tmi-middle-c-mark: rgba(255, 255, 255, 0.85);
  --tmi-grid-line-style: dashed;
}

.theme-contrast {
  --tmi-stage-bg: #000000;
  --tmi-key-white: #ffffff;
  --tmi-key-black: #000000;
  --tmi-key-border: #ffffff;
  --tmi-key-border-width: 2px;
  --tmi-middle-c-mark: #000000;
  --tmi-black-key-top: #ffffff;
  --tmi-grid-line: rgba(255, 255, 255, 0.25);
  --tmi-grid-line-c4: rgba(255, 255, 255, 0.6);
  --tmi-progress-fill: #ffff00;
}

.theme-transparent {
  --tmi-stage-bg: transparent;
  --tmi-key-white: rgba(246, 242, 228, 0.92);
  --tmi-key-black: rgba(12, 12, 16, 0.92);
  --tmi-key-border: rgba(255, 255, 255, 0.5);
  --tmi-grid-line: rgba(255, 255, 255, 0.02);
  --tmi-grid-line-c4: rgba(255, 255, 255, 0.06);
  --tmi-progress-track: transparent;
}

/* §13.1: the canvas is created with alpha, but the page behind it is not
   transparent by default. Without this the host page paints its own ground and
   an OBS browser source composites nothing but black. */
html.tmi-transparent,
html.tmi-transparent body,
html.tmi-transparent #root,
html.tmi-transparent .app-shell,
html.tmi-transparent .stage-wrap {
  background: transparent !important;
}
```

- [ ] **Step 2: Write the theme settings control**

`src/ui/ThemeSettings.tsx`:

```tsx
import { SettingsRow } from './SettingsPanel'
import type { ThemeName, ThemeSettings as ThemeSettingsType } from '../settings/types'

const THEMES: [ThemeName, string][] = [
  ['classic', 'Classic'],
  ['outline', 'Outline'],
  ['contrast', 'High contrast'],
  ['transparent', 'Transparent'],
]

/** The standard keying primaries. Any colour is valid; these are the two that
    hardware switchers and older NLE paths actually expect. */
export const MATTE_PRESETS = [
  { label: 'Green', color: '#00b140' },
  { label: 'Magenta', color: '#ff00ff' },
]

export function ThemeSettings(props: {
  theme: ThemeSettingsType
  onChange: (patch: Partial<ThemeSettingsType>) => void
}) {
  const { theme, onChange } = props
  return (
    <div className="theme-settings flex flex-col gap-1">
      <SettingsRow label="Keyboard theme">
        <select
          aria-label="Keyboard theme"
          className="theme-select rounded border border-[var(--line)] bg-[var(--panel)] px-1 py-0.5 text-[11px] text-[var(--ink)]"
          value={theme.name}
          onChange={(e) => onChange({ name: e.target.value as ThemeName })}
        >
          {THEMES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </SettingsRow>

      <SettingsRow label="Stage background">
        <div className="matte-switch flex items-center gap-1">
          <button
            type="button"
            aria-pressed={theme.stageBgOverride === null}
            className={`btn-matte rounded border px-2 py-0.5 text-[10px] ${
              theme.stageBgOverride === null
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--line)] text-[var(--ink-dim)]'
            }`}
            onClick={() => onChange({ stageBgOverride: null })}
          >
            Theme
          </button>
          {MATTE_PRESETS.map((m) => (
            <button
              key={m.color}
              type="button"
              aria-label={`${m.label} matte`}
              aria-pressed={theme.stageBgOverride === m.color}
              className={`btn-matte rounded border px-2 py-0.5 text-[10px] ${
                theme.stageBgOverride === m.color
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() => onChange({ stageBgOverride: m.color })}
            >
              {m.label}
            </button>
          ))}
          <input
            type="color"
            aria-label="Custom matte colour"
            className="matte-custom h-6 w-8 rounded border border-[var(--line)] bg-transparent"
            value={theme.stageBgOverride ?? '#00b140'}
            onChange={(e) => onChange({ stageBgOverride: e.target.value })}
          />
        </div>
      </SettingsRow>

      {theme.name === 'transparent' && theme.stageBgOverride === null ? (
        <p className="theme-note text-[11px] leading-snug text-[var(--ink-dim)]">
          The stage renders with alpha. Point an OBS browser source at this page and put
          your footage on a layer beneath — no export needed.
        </p>
      ) : null}

      {theme.stageBgOverride !== null ? (
        <p className="theme-warning text-[11px] leading-snug text-[#f5c542]">
          A flat matte keys poorly here: the strike flash draws additively, so a white
          bloom over the matte colour fringes at the brightest moment of every note.
          Prefer the Transparent theme unless your workflow cannot take alpha.
        </p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Wire the theme into the app**

In `src/App.tsx`, import `ThemeSettings`, and toggle the page-level transparency class
whenever the effective stage background is transparent:

```tsx
  // The canvas has alpha, but the page behind it does not. Without this the host
  // page paints its own ground and an OBS browser source composites only black.
  useEffect(() => {
    const transparent = settings.theme.name === 'transparent' && settings.theme.stageBgOverride === null
    document.documentElement.classList.toggle('tmi-transparent', transparent)
    return () => document.documentElement.classList.remove('tmi-transparent')
  }, [settings.theme.name, settings.theme.stageBgOverride])
```

and add the section:

```tsx
                <SettingsSection id="theme" title="Theme &amp; compositing">
                  <ThemeSettings theme={settings.theme} onChange={settings.setTheme} />
                </SettingsSection>
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 5: Manual check — this is the task that needs eyes**

Run: `npm run dev -- --host 0.0.0.0`, load `docs/demo.mid`, play, and step through all
four themes. Confirm:

1. **Classic** is byte-identical to how the app looked before Part B.
2. **Outline** draws keys as outlines with the stage visible behind them, and the octave
   grid is dashed.
3. **High contrast** is pure black and white with a yellow progress bar.
4. **Transparent** shows the browser's own page behind the falling notes — put a coloured
   `background` on `html` in devtools and confirm it shows through the stage while the
   keys stay opaque.
5. Picking the **Green** matte fills the stage flat green and the warning appears.
6. Switching back to **Theme** restores the theme's own background with no reload.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/ui/ThemeSettings.tsx src/App.tsx
git commit -m "feat: keyboard theme presets, transparent stage and solid matte"
```

---

### Task 13: Key-aware note spelling

Before anything can print a note name or a roman numeral, it has to know how to spell a
MIDI number — and the answer depends on the key: MIDI 63 is `Eb` in Ab major and `D#` in
E major. This task is pure, has no React and no canvas, and is the foundation for
Tasks 14, 15 and 16.

**Three traps inherited from chordl, all of them real:**

1. **`Note.chroma` returns `NaN`, not null, for an unparseable name.** Any guard written
   as `!= null` lets `NaN` through and corrupts the arithmetic downstream. Compare against
   the target chroma instead — `NaN === n` is false for every `n`, so junk is skipped.
2. **A note's octave belongs to its LETTER, not its pitch.** `Cb4` is MIDI 59 and `B#3`
   is MIDI 60. Deriving the octave as `floor(midi / 12) - 1` is off by one for both, so
   the octave is chosen by round-tripping through `Note.midi` instead.
3. **`Note.fromMidi` always spells sharps.** It is never the right call on its own.

**Files:**
- Create: `src/music/spell.ts`, `src/music/spell.test.ts`, `src/music/keyOf.ts`, `src/music/keyOf.test.ts`
- Modify: `package.json`, `src/model/types.ts`, `src/io/parseMidi.ts`, `src/io/parseMidi.test.ts`

**Interfaces:**
- Consumes: `ScoreDocument` from `src/model/types.ts`; `Key`, `Note`, `Midi` from `tonal`
- Produces:
  - `interface KeyContext { tonic: string; scale: 'major' | 'minor' }`
  - `const DEFAULT_KEY: KeyContext` — `{ tonic: 'C', scale: 'major' }`
  - `pitchClassName(midi: number, key?: KeyContext): string` — `'Eb'`
  - `spellPitch(midi: number, key?: KeyContext): string` — `'Eb4'`
  - `keyOfScore(score: ScoreDocument | null, override: string | null): KeyContext`
  - `parseKeyString(s: string): KeyContext | null` — `'Eb major'` → `{ tonic: 'Eb', scale: 'major' }`
  - `formatKey(k: KeyContext): string`
  - `const KEY_OPTIONS: string[]` — 30 entries, 15 tonics × major/minor
  - `ScoreDocument` gains `keySignature: { key: string; scale: string } | null`

- [ ] **Step 1: Install tonal**

```bash
npm install tonal@^6.4.3
```

About 5.5 KB gzipped for chord detection, about 9 KB including roman numerals.

- [ ] **Step 2: Write the failing spelling tests**

`src/music/spell.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Note } from 'tonal'
import { DEFAULT_KEY, pitchClassName, spellPitch } from './spell'

const K = (tonic: string, scale: 'major' | 'minor') => ({ tonic, scale })

describe('pitchClassName', () => {
  it('spells naturals plainly in C major', () => {
    expect(pitchClassName(60)).toBe('C')
    expect(pitchClassName(71)).toBe('B')
  })

  it('spells the same pitch as Eb in a flat key and D# in a sharp key', () => {
    expect(pitchClassName(63, K('Ab', 'major'))).toBe('Eb')
    expect(pitchClassName(63, K('E', 'major'))).toBe('D#')
  })

  it('uses the key signature even for notes outside the scale', () => {
    // Bb is not in E major; the key has sharps, so the fallback spells sharps.
    expect(pitchClassName(70, K('E', 'major'))).toBe('A#')
    expect(pitchClassName(70, K('Ab', 'major'))).toBe('Bb')
  })

  it('handles a minor key from its natural scale', () => {
    expect(pitchClassName(66, K('F#', 'minor'))).toBe('F#')
    expect(pitchClassName(61, K('C', 'minor'))).toBe('Db')
  })

  it('produces Cb in Gb major rather than B', () => {
    expect(pitchClassName(71, K('Gb', 'major'))).toBe('Cb')
  })
})

describe('spellPitch', () => {
  it('appends the octave', () => {
    expect(spellPitch(60, DEFAULT_KEY)).toBe('C4')
    expect(spellPitch(21, DEFAULT_KEY)).toBe('A0')
    expect(spellPitch(108, DEFAULT_KEY)).toBe('C8')
  })

  it('gives Cb its LETTER octave, not its pitch octave', () => {
    // MIDI 71 is B4, but spelled Cb it belongs to octave 5.
    expect(spellPitch(71, K('Gb', 'major'))).toBe('Cb5')
  })

  it('round-trips every key on the keyboard, in the most extreme flat key', () => {
    for (let m = 21; m <= 108; m++) {
      expect(Note.midi(spellPitch(m, K('Gb', 'major')))).toBe(m)
    }
  })

  it('round-trips every key on the keyboard, in the most extreme sharp key', () => {
    for (let m = 21; m <= 108; m++) {
      expect(Note.midi(spellPitch(m, K('C#', 'major')))).toBe(m)
    }
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/music/spell.test.ts`
Expected: FAIL — `Failed to resolve import "./spell"`.

- [ ] **Step 4: Write the speller**

`src/music/spell.ts`:

```ts
import { Key, Midi, Note } from 'tonal'

export interface KeyContext { tonic: string; scale: 'major' | 'minor' }

export const DEFAULT_KEY: KeyContext = { tonic: 'C', scale: 'major' }

function scaleNames(key: KeyContext): string[] {
  return key.scale === 'minor'
    ? Key.minorKey(key.tonic).natural.scale
    : Key.majorKey(key.tonic).scale
}

/** Negative for a flat key signature, positive for a sharp one. */
function alteration(key: KeyContext): number {
  return key.scale === 'minor'
    ? Key.minorKey(key.tonic).alteration
    : Key.majorKey(key.tonic).alteration
}

/**
 * The key's own seven spellings win; anything outside the scale follows the key
 * signature's direction. Note.chroma returns NaN for an unparseable name, and
 * `NaN === chroma` is false for every chroma, so junk is skipped without a guard
 * that would have to be written `Number.isInteger(...)` to work at all.
 */
export function pitchClassName(midi: number, key: KeyContext = DEFAULT_KEY): string {
  const chroma = ((midi % 12) + 12) % 12
  for (const n of scaleNames(key)) {
    if (Note.chroma(n) === chroma) return n
  }
  return Midi.midiToNoteName(midi, { sharps: alteration(key) >= 0, pitchClass: true })
}

/**
 * A note's octave belongs to its LETTER, not its pitch: Cb4 is MIDI 59 and B#3
 * is MIDI 60, so floor(midi / 12) - 1 is off by one for both. The octave is
 * chosen by round-tripping instead, which is correct for every spelling.
 */
export function spellPitch(midi: number, key: KeyContext = DEFAULT_KEY): string {
  const name = pitchClassName(midi, key)
  const base = Math.floor(midi / 12) - 1
  for (const oct of [base, base + 1, base - 1]) {
    if (Note.midi(`${name}${oct}`) === midi) return `${name}${oct}`
  }
  return `${name}${base}`
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run src/music/spell.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Write the failing key-resolution tests**

`src/music/keyOf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { KEY_OPTIONS, formatKey, keyOfScore, parseKeyString } from './keyOf'
import type { ScoreDocument } from '../model/types'

const score = (keySignature: ScoreDocument['keySignature']): ScoreDocument => ({
  id: 'x', name: 'x', ppq: 480, tempoMap: [], voices: [], notes: [],
  durationSec: 0, sourceFormat: 'midi', beatsPerBar: 4, keySignature,
})

describe('parseKeyString', () => {
  it('parses a tonic and a scale', () => {
    expect(parseKeyString('Eb major')).toEqual({ tonic: 'Eb', scale: 'major' })
    expect(parseKeyString('F# minor')).toEqual({ tonic: 'F#', scale: 'minor' })
  })

  it('is case- and space-tolerant', () => {
    expect(parseKeyString('  bb MINOR ')).toEqual({ tonic: 'Bb', scale: 'minor' })
  })

  it('rejects junk rather than guessing', () => {
    expect(parseKeyString('H major')).toBeNull()
    expect(parseKeyString('C lydian')).toBeNull()
    expect(parseKeyString('')).toBeNull()
  })
})

describe('keyOfScore', () => {
  it('prefers the user override above everything', () => {
    expect(keyOfScore(score({ key: 'Ab', scale: 'major' }), 'E minor'))
      .toEqual({ tonic: 'E', scale: 'minor' })
  })

  it('falls back to the file key signature when there is no override', () => {
    expect(keyOfScore(score({ key: 'Ab', scale: 'major' }), null))
      .toEqual({ tonic: 'Ab', scale: 'major' })
  })

  it('falls back to C major when the file has no key signature', () => {
    expect(keyOfScore(score(null), null)).toEqual({ tonic: 'C', scale: 'major' })
  })

  it('falls back to C major with no score at all', () => {
    expect(keyOfScore(null, null)).toEqual({ tonic: 'C', scale: 'major' })
  })

  it('ignores an unparseable override rather than breaking spelling', () => {
    expect(keyOfScore(score({ key: 'Ab', scale: 'major' }), 'nonsense'))
      .toEqual({ tonic: 'Ab', scale: 'major' })
  })
})

describe('KEY_OPTIONS', () => {
  it('offers every tonic in both scales, and every one of them parses', () => {
    expect(KEY_OPTIONS).toHaveLength(30)
    for (const k of KEY_OPTIONS) expect(parseKeyString(k)).not.toBeNull()
  })

  it('round-trips through formatKey', () => {
    for (const k of KEY_OPTIONS) expect(formatKey(parseKeyString(k)!)).toBe(k)
  })
})
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run src/music/keyOf.test.ts`
Expected: FAIL — `Failed to resolve import "./keyOf"`.

- [ ] **Step 8: Write the key resolver**

`src/music/keyOf.ts`:

```ts
import { DEFAULT_KEY } from './spell'
import type { KeyContext } from './spell'
import type { ScoreDocument } from '../model/types'

const TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C#', 'Cb', 'Gb']

export const KEY_OPTIONS: string[] = TONICS.flatMap((t) => [`${t} major`, `${t} minor`])

export function formatKey(k: KeyContext): string {
  return `${k.tonic} ${k.scale}`
}

/** Strict on purpose: a silently mis-parsed key spells every accidental wrong
    for the whole piece, which is worse than ignoring the override. */
export function parseKeyString(s: string): KeyContext | null {
  const m = /^\s*([a-g])([#b]?)\s+(major|minor)\s*$/i.exec(s)
  if (!m) return null
  return {
    tonic: m[1].toUpperCase() + m[2].toLowerCase(),
    scale: m[3].toLowerCase() as 'major' | 'minor',
  }
}

/**
 * Spec §15.3, in order: the user override, then the MIDI file's key-signature
 * meta event, then C major. tonal does not infer a key and this app does not
 * guess one -- an inferred key that is wrong mis-spells the whole piece.
 */
export function keyOfScore(score: ScoreDocument | null, override: string | null): KeyContext {
  if (override) {
    const parsed = parseKeyString(override)
    if (parsed) return parsed
  }
  const sig = score?.keySignature
  if (sig) {
    const parsed = parseKeyString(`${sig.key} ${sig.scale}`)
    if (parsed) return parsed
  }
  return DEFAULT_KEY
}
```

- [ ] **Step 9: Carry the key signature on the score**

In `src/model/types.ts`, add to `ScoreDocument`:

```ts
  /** From the MIDI key-signature meta event; null when the file carries none. */
  keySignature: { key: string; scale: string } | null
```

In `src/io/parseMidi.ts`:

```ts
  // @tonejs/midi's KeySignatureEvent is { ticks, key, scale }, e.g. { key: 'Ab', scale: 'major' }.
  const keySignature = midi.header.keySignatures[0]
    ? { key: midi.header.keySignatures[0].key, scale: midi.header.keySignatures[0].scale }
    : null
```

and add `keySignature` to the `ScoreDocument` literal. Every `ScoreDocument` literal in
existing tests gains `keySignature: null`.

Add one parser test in `src/io/parseMidi.test.ts`:

```ts
  it('carries null for a file with no key signature', () => {
    const score = parseMidi(fixtureBytes(), 'x.mid', { mode: 'scale', scale: 1 })
    expect(score.keySignature).toBeNull()
  })
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/music/ src/io/ && npm run build`
Expected: PASS, build clean.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/music/spell.ts src/music/spell.test.ts src/music/keyOf.ts src/music/keyOf.test.ts src/model/types.ts src/io/parseMidi.ts src/io/parseMidi.test.ts
git commit -m "feat: key-aware note spelling and key-signature resolution"
```

---

### Task 14: The on-stage text overlay and note labels

Spec §15 and §15.1. All on-stage text is **real DOM**, absolutely positioned in an
overlay above the canvas with `pointer-events: none`. That is what gives it Google Fonts,
per-element IDs and classes, and full CSS control — the thing a canvas cannot offer.
Positions come from the same `computeLayout` geometry the canvas uses, so text and keys
cannot drift apart. Only currently-sounding notes get a label, so the overlay holds a
handful of elements rather than 88.

**The overlay must not re-render per frame.** The draw loop pushes a new held-pitch set
into React only when the *set actually changes* — the same discipline as the throttled
playhead readout.

**Files:**
- Create: `src/ui/googleFont.ts`, `src/ui/googleFont.test.ts`, `src/ui/StageText.tsx`, `src/ui/StageText.test.tsx`, `src/ui/TextSettings.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `KeyboardLayout` from `src/render/geometry.ts`; `spellPitch` from `src/music/spell.ts`; `TextSettings`, `NoteLabelContent`, `NoteLabelPlacement`, `TextStyle` from `src/settings/types.ts`; `KeyContext` from `src/music/spell.ts`
- Produces:
  - `ensureGoogleFont(family: string, weights?: number[]): void`
  - `labelText(midi: number, content: NoteLabelContent, key: KeyContext): string`
  - `textCss(style: TextStyle, whiteW: number): React.CSSProperties`
  - `StageText` React component, props `{ layout: KeyboardLayout | null; pitches: number[]; text: TextSettingsType; keyContext: KeyContext }`
  - `TextSettings` React component, props `{ text: TextSettingsType; onChange; onStyle }`

- [ ] **Step 1: Write the failing Google Fonts tests**

`src/ui/googleFont.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ensureGoogleFont } from './googleFont'

const links = () => [...document.head.querySelectorAll('link[data-google-font]')]

describe('ensureGoogleFont', () => {
  beforeEach(() => { document.head.innerHTML = '' })

  it('injects one stylesheet link for a family', () => {
    ensureGoogleFont('Inter')
    expect(links()).toHaveLength(1)
    expect(links()[0].getAttribute('href')).toContain('family=Inter')
  })

  it('is idempotent -- asking twice does not duplicate the link', () => {
    ensureGoogleFont('Inter')
    ensureGoogleFont('Inter')
    expect(links()).toHaveLength(1)
  })

  it('adds a second link for a different family', () => {
    ensureGoogleFont('Inter')
    ensureGoogleFont('Space Grotesk')
    expect(links()).toHaveLength(2)
  })

  it('URL-encodes a multi-word family name', () => {
    ensureGoogleFont('Space Grotesk')
    expect(links()[0].getAttribute('href')).toContain('family=Space+Grotesk')
  })

  it('requests the weights it is given', () => {
    ensureGoogleFont('Inter', [300, 700])
    expect(links()[0].getAttribute('href')).toContain('wght@300;700')
  })

  it('ignores an empty family rather than requesting a broken URL', () => {
    ensureGoogleFont('   ')
    expect(links()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Write the Google Fonts loader**

`src/ui/googleFont.ts`:

```ts
const DEFAULT_WEIGHTS = [400, 500, 600, 700]

/**
 * The one place a CDN font link is allowed. The UI chrome stays on self-hosted
 * @fontsource/poppins; on-stage text is a runtime user choice, so its family
 * cannot be bundled ahead of time.
 */
export function ensureGoogleFont(family: string, weights: number[] = DEFAULT_WEIGHTS): void {
  const name = family.trim()
  if (!name) return
  const id = `gf-${name.toLowerCase().replace(/\s+/g, '-')}`
  if (document.getElementById(id)) return

  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.dataset.googleFont = name
  const fam = encodeURIComponent(name).replace(/%20/g, '+')
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(';')}&display=swap`
  document.head.appendChild(link)
}
```

- [ ] **Step 3: Run the font tests**

Run: `npx vitest run src/ui/googleFont.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 4: Write the failing overlay tests**

`src/ui/StageText.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StageText, labelText, textCss } from './StageText'
import { computeLayout } from '../render/geometry'
import { DEFAULT_SETTINGS } from '../settings/types'
import { DEFAULT_KEY } from '../music/spell'

const layout = computeLayout(1220, 700)
const text = (patch = {}) => ({ ...DEFAULT_SETTINGS.text, ...patch })

describe('labelText', () => {
  it('renders the pitch name, spelled for the key', () => {
    expect(labelText(63, 'pitch', DEFAULT_KEY)).toBe('D#4')
    expect(labelText(63, 'pitch', { tonic: 'Ab', scale: 'major' })).toBe('Eb4')
  })

  it('renders the MIDI number', () => {
    expect(labelText(60, 'midi', DEFAULT_KEY)).toBe('60')
  })

  it('renders both, separated', () => {
    expect(labelText(60, 'both', DEFAULT_KEY)).toBe('C4 · 60')
  })

  it('renders nothing when labels are off', () => {
    expect(labelText(60, 'off', DEFAULT_KEY)).toBe('')
  })
})

describe('textCss', () => {
  it('scales the font size with white-key width, not with the viewport', () => {
    const a = textCss(DEFAULT_SETTINGS.text.style, 20)
    const b = textCss(DEFAULT_SETTINGS.text.style, 40)
    expect(Number.parseFloat(String(b.fontSize))).toBeCloseTo(Number.parseFloat(String(a.fontSize)) * 2, 6)
  })

  it('applies the dark stroke under the fill, per the house note-text style', () => {
    const css = textCss(DEFAULT_SETTINGS.text.style, 20) as Record<string, string>
    expect(css.WebkitTextStroke).toBe('3px rgba(0,0,0,0.35)')
    expect(css.paintOrder).toBe('stroke fill')
  })

  it('omits the stroke entirely at width 0, for a known flat background', () => {
    const css = textCss({ ...DEFAULT_SETTINGS.text.style, strokeWidth: 0 }, 20) as Record<string, string>
    expect(css.WebkitTextStroke).toBeUndefined()
  })
})

describe('StageText', () => {
  it('renders one labelled span per sounding pitch, with per-pitch ids', () => {
    const { container } = render(
      <StageText layout={layout} pitches={[60, 63]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelectorAll('.note-label')).toHaveLength(2)
    const c4 = container.querySelector('#note-label-60')!
    expect(c4.getAttribute('data-pitch')).toBe('C4')
    expect(c4.getAttribute('data-midi')).toBe('60')
    expect(c4.textContent).toBe('C4')
  })

  it('marks black and white keys with different modifier classes', () => {
    const { container } = render(
      <StageText layout={layout} pitches={[60, 61]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelector('#note-label-60')!.className).toContain('note-label--white')
    expect(container.querySelector('#note-label-61')!.className).toContain('note-label--black')
  })

  it('renders nothing at all when labels are off', () => {
    const { container } = render(
      <StageText layout={layout} pitches={[60]} text={text({ labels: 'off' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelectorAll('.note-label')).toHaveLength(0)
  })

  it('skips a pitch that is not on the current (zoomed) keyboard', () => {
    const narrow = computeLayout(1220, 700, { firstPitch: 60, lastPitch: 71 })
    const { container } = render(
      <StageText layout={narrow} pitches={[48, 60]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelectorAll('.note-label')).toHaveLength(1)
  })

  it('does not swallow clicks aimed at the canvas beneath it', () => {
    const { container } = render(
      <StageText layout={layout} pitches={[60]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect((container.querySelector('.stage-text') as HTMLElement).style.pointerEvents).toBe('none')
  })

  it('renders nothing rather than throwing before the first layout exists', () => {
    const { container } = render(
      <StageText layout={null} pitches={[60]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelectorAll('.note-label')).toHaveLength(0)
  })
})
```

- [ ] **Step 5: Run them to verify they fail**

Run: `npx vitest run src/ui/StageText.test.tsx`
Expected: FAIL — `Failed to resolve import "./StageText"`.

- [ ] **Step 6: Write the overlay**

`src/ui/StageText.tsx`:

```tsx
import { useEffect } from 'react'
import { ensureGoogleFont } from './googleFont'
import { spellPitch } from '../music/spell'
import type { KeyboardLayout } from '../render/geometry'
import type { KeyContext } from '../music/spell'
import type { NoteLabelContent, TextSettings as TextSettingsType, TextStyle } from '../settings/types'

export function labelText(midi: number, content: NoteLabelContent, key: KeyContext): string {
  switch (content) {
    case 'pitch': return spellPitch(midi, key)
    case 'midi': return String(midi)
    case 'both': return `${spellPitch(midi, key)} · ${midi}`
    default: return ''
  }
}

/**
 * Size is expressed relative to white-key width so labels scale with the
 * keyboard rather than fighting it (spec §15.4). The dark stroke under the fill
 * is the house note-text treatment: against arbitrary footage, flat text becomes
 * illegible the moment the background matches its colour.
 */
export function textCss(style: TextStyle, whiteW: number): React.CSSProperties {
  const css: React.CSSProperties = {
    fontFamily: `'${style.family}', Poppins, system-ui, sans-serif`,
    fontWeight: style.weight,
    fontSize: `${(style.sizeRatio * whiteW).toFixed(2)}px`,
    letterSpacing: `${style.letterSpacing}em`,
    color: style.color,
    opacity: style.opacity,
  }
  if (style.strokeWidth > 0) {
    ;(css as Record<string, unknown>).WebkitTextStroke = `${style.strokeWidth}px ${style.strokeColor}`
    ;(css as Record<string, unknown>).paintOrder = 'stroke fill'
  }
  return css
}

export function StageText(props: {
  layout: KeyboardLayout | null
  pitches: number[]
  text: TextSettingsType
  keyContext: KeyContext
}) {
  const { layout, pitches, text, keyContext } = props

  useEffect(() => { ensureGoogleFont(text.style.family, [text.style.weight]) }, [text.style.family, text.style.weight])

  if (!layout || text.labels === 'off') {
    return <div className="stage-text absolute inset-0" style={{ pointerEvents: 'none' }} />
  }

  const css = textCss(text.style, layout.whiteW)
  const size = text.style.sizeRatio * layout.whiteW

  return (
    <div className="stage-text absolute inset-0" style={{ pointerEvents: 'none' }}>
      {pitches.map((pitch) => {
        const k = layout.byPitch.get(pitch)
        if (!k) return null
        const name = spellPitch(pitch, keyContext)
        // Above: just clear of the hit line, in the stage area. Below: over the
        // key face, clear of the black keys' lower edge.
        const top = text.labelPlacement === 'above'
          ? layout.hitY - size * 1.5
          : layout.hitY + layout.keyboardH - size * 1.6
        return (
          <span
            key={pitch}
            id={`note-label-${pitch}`}
            className={`note-label note-label--${k.black ? 'black' : 'white'}`}
            data-pitch={name}
            data-midi={pitch}
            style={{
              ...css,
              position: 'absolute',
              left: `${k.x + k.w / 2}px`,
              top: `${top}px`,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}
          >
            {labelText(pitch, text.labels, keyContext)}
          </span>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 7: Run them to verify they pass**

Run: `npx vitest run src/ui/StageText.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 8: Write the text settings control**

`src/ui/TextSettings.tsx`. `GOOGLE_FONT_SUGGESTIONS` is a datalist, not a hard list —
any Google family name is valid.

```tsx
import { SettingsRow } from './SettingsPanel'
import type {
  NoteLabelContent, NoteLabelPlacement, TextSettings as TextSettingsType, TextStyle,
} from '../settings/types'

const GOOGLE_FONT_SUGGESTIONS = [
  'Poppins', 'Inter', 'Space Grotesk', 'Bebas Neue', 'Montserrat', 'Roboto Mono', 'Playfair Display',
]

export function TextSettings(props: {
  text: TextSettingsType
  onChange: (patch: Partial<TextSettingsType>) => void
  onStyle: (patch: Partial<TextStyle>) => void
}) {
  const { text, onChange, onStyle } = props
  return (
    <div className="text-settings flex flex-col gap-1">
      <SettingsRow label="Note labels">
        <select
          aria-label="Note labels"
          className="label-content-select rounded border border-[var(--line)] bg-[var(--panel)] px-1 py-0.5 text-[11px] text-[var(--ink)]"
          value={text.labels}
          onChange={(e) => onChange({ labels: e.target.value as NoteLabelContent })}
        >
          <option value="off">Off</option>
          <option value="pitch">Pitch name</option>
          <option value="midi">MIDI number</option>
          <option value="both">Both</option>
        </select>
      </SettingsRow>

      <SettingsRow label="Label position">
        <div className="label-placement-switch flex gap-1">
          {(['above', 'below'] as NoteLabelPlacement[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={text.labelPlacement === p}
              className={`btn-label-placement rounded border px-2 py-0.5 text-[10px] capitalize ${
                text.labelPlacement === p
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() => onChange({ labelPlacement: p })}
            >
              {p} keys
            </button>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow label="Font" htmlFor="text-family">
        <input
          id="text-family" type="text" list="google-font-suggestions" aria-label="Font family"
          className="text-family-input w-32 rounded border border-[var(--line)] bg-transparent px-1 py-0.5 text-[11px] text-[var(--ink)]"
          value={text.style.family}
          onChange={(e) => onStyle({ family: e.target.value })}
        />
        <datalist id="google-font-suggestions">
          {GOOGLE_FONT_SUGGESTIONS.map((f) => <option key={f} value={f} />)}
        </datalist>
      </SettingsRow>

      <SettingsRow label="Weight" htmlFor="text-weight">
        <input
          id="text-weight" type="range" aria-label="Font weight"
          className="text-weight-slider h-1 w-28 accent-[var(--accent)]"
          min={300} max={900} step={100} value={text.style.weight}
          onChange={(e) => onStyle({ weight: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Size" htmlFor="text-size">
        <input
          id="text-size" type="range" aria-label="Text size"
          className="text-size-slider h-1 w-28 accent-[var(--accent)]"
          min={0.2} max={1.4} step={0.01} value={text.style.sizeRatio}
          onChange={(e) => onStyle({ sizeRatio: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Letter spacing" htmlFor="text-tracking">
        <input
          id="text-tracking" type="range" aria-label="Letter spacing"
          className="text-tracking-slider h-1 w-28 accent-[var(--accent)]"
          min={-0.05} max={0.3} step={0.01} value={text.style.letterSpacing}
          onChange={(e) => onStyle({ letterSpacing: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Colour">
        <input
          type="color" aria-label="Text colour"
          className="text-color-input h-6 w-8 rounded border border-[var(--line)] bg-transparent"
          value={text.style.color}
          onChange={(e) => onStyle({ color: e.target.value })}
        />
        <input
          type="range" aria-label="Text opacity"
          className="text-opacity-slider h-1 w-20 accent-[var(--accent)]"
          min={0} max={1} step={0.01} value={text.style.opacity}
          onChange={(e) => onStyle({ opacity: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Outline" htmlFor="text-stroke">
        <input
          id="text-stroke" type="range" aria-label="Text outline width"
          className="text-stroke-slider h-1 w-20 accent-[var(--accent)]"
          min={0} max={8} step={0.5} value={text.style.strokeWidth}
          onChange={(e) => onStyle({ strokeWidth: Number(e.target.value) })}
        />
        <input
          type="color" aria-label="Text outline colour"
          className="text-stroke-color h-6 w-8 rounded border border-[var(--line)] bg-transparent"
          value={/^#/.test(text.style.strokeColor) ? text.style.strokeColor : '#000000'}
          onChange={(e) => onStyle({ strokeColor: e.target.value })}
        />
      </SettingsRow>

      <p className="text-outline-note text-[11px] leading-snug text-[var(--ink-dim)]">
        Keep the outline on over video: flat text disappears the moment the footage
        matches its colour. Set the width to 0 only over a known flat background.
      </p>
    </div>
  )
}
```

- [ ] **Step 9: Feed the overlay from the draw loop**

In `src/App.tsx`, add the state and push into it **only when the held set changes**:

```tsx
  const [stageText, setStageText] = useState<{ layout: KeyboardLayout | null; pitches: number[] }>({
    layout: null, pitches: [],
  })
  const heldKeyRef = useRef('')
  const layoutKeyRef = useRef<KeyboardLayout | null>(null)
```

In the draw callback, after `held` is computed (it already is, for `drawKeyboard`):

```tsx
      // The overlay is DOM, so it must not re-render per frame. Push only when
      // the sounding set or the layout actually changes -- the same discipline
      // as the 10Hz playhead readout.
      const heldKey = [...held.keys()].sort((a, b) => a - b).join(',')
      if (heldKey !== heldKeyRef.current || layout !== layoutKeyRef.current) {
        heldKeyRef.current = heldKey
        layoutKeyRef.current = layout
        setStageText({ layout, pitches: [...held.keys()] })
      }
```

`drawStage` currently derives `held` internally. Export the derivation so the app can
use the same set without a second pass: in `src/render/pianoRoll.ts`, `heldNotes` and
`visibleNotes` are already exported — call them in the draw callback and pass the result
in. Add an optional field to `RenderState`:

```ts
  /** Precomputed by the caller so the overlay and the canvas share one pass. */
  held?: Map<number, NoteEvent>
```

and in `drawStage` use `state.held ?? heldNotes(...)`. This also closes plan 1's known
seam, which filtered `visibleNotes` twice per frame.

Render the overlay inside `stage-wrap`, above the canvas:

```tsx
        <StageText
          layout={stageText.layout}
          pitches={stageText.pitches}
          text={settings.text}
          keyContext={keyOfScore(t.score, settings.text.keyOverride)}
        />
```

and add the section:

```tsx
                <SettingsSection id="text" title="On-stage text">
                  <TextSettings
                    text={settings.text}
                    onChange={settings.setText}
                    onStyle={settings.setTextStyle}
                  />
                </SettingsSection>
```

- [ ] **Step 10: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 11: Manual check**

Run: `npm run dev -- --host 0.0.0.0`, load `docs/demo.mid`, play, and turn note labels on.
Confirm: a label appears centred over each sounding key and disappears when it stops;
labels sit directly over their keys at both placements and stay aligned when the window
is resized and when zoom is switched to Fit piece; changing the font family visibly
changes the text within a second; the dark outline is visible against the notes. Open
devtools and confirm `#note-label-60` exists with `data-pitch="C4"`, and that the
framerate does not drop while a dense passage plays.

- [ ] **Step 12: Commit**

```bash
git add src/ui/googleFont.ts src/ui/googleFont.test.ts src/ui/StageText.tsx src/ui/StageText.test.tsx src/ui/TextSettings.tsx src/render/pianoRoll.ts src/App.tsx
git commit -m "feat: DOM text overlay with per-pitch note labels and Google Fonts"
```

---

### Task 15: Chord identification and roman numerals

Spec §15.2 and §15.3, using `tonal`. Pure module, no React, no canvas.

**Three findings, each verified by running tonal 6.4.3 rather than assumed:**

1. **"Take the first result" is wrong.** `Chord.detect(['E3','C4','G4'], { assumePerfectFifth: true })` returns `["Em#5", "CM/E"]` — tonal ranks a *root-position* reading first even when that reading is absurd. A first-inverted C major would print as `Em#5`. The fix is a single stable demote-the-rare pass: any candidate whose quality contains an altered extension (`#5`, `b5`, `#9`, `b9`, `#11`, `b13`, `alt`, `omit`) sorts after the rest, and tonal's own order decides everything else. Verified against eight triad and seventh inversions; it changes only the cases that were wrong.
2. **`Progression.toRomanNumerals` drops the slash and returns uppercase.** `CM/E` → `IM`; `Dm7` → `IIm7`; `Bdim` → `VIIdim`. So minor and diminished qualities need lowercasing in a post-process, and figured-bass notation is not available from this call — as the spec says.
3. **An unparseable chord passes straight through.** `toRomanNumerals('C', ['zzz'])` returns `['zzz']`, so the symbol has to be validated with `Chord.get(...).empty` before the call or junk reaches the screen.

**The chord window and the one stateful piece.** A piano arpeggio sounds one note at a
time, so identifying only simultaneously-held pitches produces nonsense on most real
music. `pitchesInWindow` is a **pure function of `t`** — it takes every pitch struck in
the trailing window plus anything still sounding — which keeps scrubbing correct.
`ChordTracker` is the deliberate exception: confirm-then-commit hysteresis needs memory.
It lives outside the canvas render path, takes its clock as a parameter, and is reset on
seek, so it cannot corrupt the "everything visible is a pure function of t" invariant
that the canvas holds.

**Files:**
- Create: `src/model/search.ts`, `src/music/chords.ts`, `src/music/chords.test.ts`, `src/music/romanNumerals.ts`, `src/music/romanNumerals.test.ts`
- Modify: `src/render/pianoRoll.ts`

**Interfaces:**
- Consumes: `spellPitch`, `KeyContext` from `src/music/spell.ts`; `NoteEvent` from `src/model/types.ts`; `Chord`, `Progression` from `tonal`
- Produces:
  - `lowerBoundByStart(notes: NoteEvent[], sec: number): number` (moved out of `pianoRoll.ts`)
  - `pitchesInWindow(notes, t, windowSec, maxNoteDur): number[]`
  - `rankCandidates(symbols: string[]): string[]`
  - `detectChord(pitches: number[], key: KeyContext): string[]`
  - `interface ChordReading { symbol: string; alternates: string[] }`
  - `class ChordTracker` with `update(candidates: string[], nowMs: number): ChordReading | null` and `reset()`
  - `toRomanNumeral(symbol: string, key: KeyContext): string | null`

- [ ] **Step 1: Move the binary search somewhere both callers can reach**

`src/model/search.ts`:

```ts
import type { NoteEvent } from './types'

/** First index whose startSec is >= sec, in a start-sorted array. */
export function lowerBoundByStart(notes: NoteEvent[], sec: number): number {
  let lo = 0, hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (notes[mid].startSec < sec) lo = mid + 1
    else hi = mid
  }
  return lo
}
```

In `src/render/pianoRoll.ts`, delete the local `lowerBound` and import
`lowerBoundByStart` from `../model/search`, updating its one call site in
`visibleNotes`. `src/music/` must not import from `src/render/` — the music modules are
pure theory and have no rendering dependency.

- [ ] **Step 2: Write the failing chord tests**

`src/music/chords.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ChordTracker, detectChord, pitchesInWindow, rankCandidates } from './chords'
import { DEFAULT_KEY } from './spell'
import type { NoteEvent } from '../model/types'

const n = (id: number, pitch: number, startSec: number, endSec: number): NoteEvent => ({
  id, pitch, startTicks: 0, durTicks: 0, startSec, endSec, velocity: 90, voiceId: 'a',
})

describe('pitchesInWindow', () => {
  // A C major arpeggio, one note at a time, then a rest.
  const arp = [n(0, 60, 0, 0.2), n(1, 64, 0.2, 0.4), n(2, 67, 0.4, 0.6), n(3, 72, 0.6, 0.8)]

  it('collects every pitch struck inside the trailing window', () => {
    // A window wide enough to reach back past the first note of the arpeggio.
    expect(pitchesInWindow(arp, 0.7, 0.8, 0.2)).toEqual([60, 64, 67, 72])
  })

  it('drops pitches that fell out of the back of the window', () => {
    // At t=0.7 a 0.35s window reaches back to 0.35, so only the last two struck.
    expect(pitchesInWindow(arp, 0.7, 0.35, 0.2)).toEqual([67, 72])
  })

  it('keeps a note that is still sounding even if it started before the window', () => {
    // The pedal bass started at 0 and runs to 4s, so it belongs to the chord
    // even though a 0.25s window cannot reach its onset.
    const withPedalBass = [n(9, 36, 0, 4), ...arp]
    expect(pitchesInWindow(withPedalBass, 0.7, 0.25, 4)).toEqual([36, 72])
  })

  it('never returns a note that has not started yet', () => {
    expect(pitchesInWindow(arp, 0.3, 0.6, 0.2)).toEqual([60, 64])
  })

  it('returns pitches ascending and deduplicated', () => {
    const doubled = [n(0, 60, 0, 1), n(1, 72, 0.1, 1), n(2, 60, 0.2, 1)]
    expect(pitchesInWindow(doubled, 0.3, 0.6, 1)).toEqual([60, 72])
  })

  it('is a pure function of t -- the same t always gives the same answer', () => {
    const a = pitchesInWindow(arp, 0.5, 0.6, 0.2)
    void pitchesInWindow(arp, 0.9, 0.6, 0.2)
    expect(pitchesInWindow(arp, 0.5, 0.6, 0.2)).toEqual(a)
  })

  it('returns nothing for an empty score', () => {
    expect(pitchesInWindow([], 1, 0.6, 0)).toEqual([])
  })
})

describe('rankCandidates', () => {
  it('demotes an altered-extension reading below a plain slash chord', () => {
    // This is the case the spec got wrong: tonal ranks Em#5 first for C/E.
    expect(rankCandidates(['Em#5', 'CM/E'])).toEqual(['CM/E', 'Em#5'])
  })

  it('leaves tonal alone when neither candidate is rare', () => {
    expect(rankCandidates(['Am7', 'C6/A'])).toEqual(['Am7', 'C6/A'])
    expect(rankCandidates(['CM/G', 'Em#5/G'])).toEqual(['CM/G', 'Em#5/G'])
  })

  it('is stable among equally rare candidates', () => {
    expect(rankCandidates(['Cm#5', 'Ebm#5'])).toEqual(['Cm#5', 'Ebm#5'])
  })

  it('survives an empty list', () => {
    expect(rankCandidates([])).toEqual([])
  })
})

describe('detectChord', () => {
  it('names a root-position triad', () => {
    expect(detectChord([60, 64, 67], DEFAULT_KEY)[0]).toBe('CM')
  })

  it('names a first inversion as a slash chord, not as an augmented spelling', () => {
    expect(detectChord([64, 60, 67], DEFAULT_KEY)[0]).toBe('CM/E')
  })

  it('names a second inversion from its bass', () => {
    expect(detectChord([67, 72, 76], DEFAULT_KEY)[0]).toBe('CM/G')
  })

  it('names a seventh chord', () => {
    expect(detectChord([57, 60, 64, 67], DEFAULT_KEY)[0]).toBe('Am7')
  })

  it('spells the chord for the key', () => {
    expect(detectChord([60, 63, 67], { tonic: 'Eb', scale: 'major' })[0]).toBe('Cm')
  })

  it('keeps the remaining readings as alternates', () => {
    expect(detectChord([57, 60, 64, 67], DEFAULT_KEY)).toContain('C6/A')
  })

  it('refuses to name fewer than three pitches -- two notes are not a chord', () => {
    expect(detectChord([60, 67], DEFAULT_KEY)).toEqual([])
    expect(detectChord([60], DEFAULT_KEY)).toEqual([])
    expect(detectChord([], DEFAULT_KEY)).toEqual([])
  })

  it('ignores octave doubling', () => {
    expect(detectChord([48, 60, 64, 67, 72], DEFAULT_KEY)[0]).toBe('CM')
  })
})

describe('ChordTracker', () => {
  const C = ['CM', 'Em#5/C']
  const G = ['GM']

  it('does not commit a reading until it has persisted for confirmMs', () => {
    const t = new ChordTracker(300, 60)
    expect(t.update(C, 0)).toBeNull()
    expect(t.update(C, 59)).toBeNull()
  })

  it('commits once the reading has held long enough', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0)
    expect(t.update(C, 60)).toEqual({ symbol: 'CM', alternates: ['Em#5/C'] })
  })

  it('keeps returning the committed reading without re-confirming it', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0)
    t.update(C, 60)
    expect(t.update(C, 61)!.symbol).toBe('CM')
  })

  it('will not replace a committed reading inside its minimum display time', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)
    t.update(G, 100); t.update(G, 200)
    expect(t.update(G, 300)!.symbol).toBe('CM')
  })

  it('replaces it once the minimum display time has passed', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)
    t.update(G, 400)
    expect(t.update(G, 460)!.symbol).toBe('GM')
  })

  it('does not commit a reading that flickers past', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)      // committed
    t.update(G, 400)                      // pending
    t.update(['Am'], 430)                 // pending restarts
    expect(t.update(['Am'], 450)!.symbol).toBe('CM')
  })

  it('holds the last chord through a rest rather than blanking', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)
    expect(t.update([], 500)!.symbol).toBe('CM')
  })

  it('returns null before anything has ever been committed', () => {
    expect(new ChordTracker(300, 60).update([], 0)).toBeNull()
  })

  it('reset clears the committed reading, for a seek', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)
    t.reset()
    expect(t.update([], 100)).toBeNull()
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/music/chords.test.ts`
Expected: FAIL — `Failed to resolve import "./chords"`.

- [ ] **Step 4: Write the chord module**

`src/music/chords.ts`:

```ts
import { Chord } from 'tonal'
import { spellPitch } from './spell'
import { lowerBoundByStart } from '../model/search'
import type { KeyContext } from './spell'
import type { NoteEvent } from '../model/types'

/** Below three pitches, tonal names power chords and intervals that read as
    noise on a piano roll. A chord needs three notes. */
const MIN_CHORD_PITCHES = 3

/** Qualities that only ever appear when tonal is reaching for a root-position
    reading of an inversion. Demoting them is what turns Em#5 back into CM/E. */
const RARE_QUALITY = /#5|b5|#9|b9|#11|b13|alt|omit/

/**
 * Every pitch struck inside the trailing window, plus anything still sounding.
 * A PURE FUNCTION OF t: a broken chord resolves to the chord it outlines, and
 * scrubbing to the same t always produces the same set.
 */
export function pitchesInWindow(
  notes: NoteEvent[], t: number, windowSec: number, maxNoteDur: number,
): number[] {
  const out = new Set<number>()
  const from = t - Math.max(windowSec, maxNoteDur)
  for (let i = lowerBoundByStart(notes, from); i < notes.length; i++) {
    const n = notes[i]
    if (n.startSec > t) break
    if (n.startSec >= t - windowSec || n.endSec > t) out.add(n.pitch)
  }
  return [...out].sort((a, b) => a - b)
}

const quality = (symbol: string) => symbol.split('/')[0].replace(/^[A-G][#b]*/, '')

/** Stable: tonal's own order decides everything except the rare-quality demotion. */
export function rankCandidates(symbols: string[]): string[] {
  return symbols
    .map((s, i) => ({ s, i, rare: RARE_QUALITY.test(quality(s)) ? 1 : 0 }))
    .sort((a, b) => a.rare - b.rare || a.i - b.i)
    .map((x) => x.s)
}

/**
 * Notes go in ABSOLUTE and LOWEST-FIRST: tonal treats the first element as the
 * bass, which is what produces CM/E rather than a rootless reading. Spelling
 * comes from the key so a chord in Eb prints Cm, not B#m.
 */
export function detectChord(pitches: number[], key: KeyContext): string[] {
  if (pitches.length < MIN_CHORD_PITCHES) return []
  const names = [...pitches].sort((a, b) => a - b).map((p) => spellPitch(p, key))
  return rankCandidates(Chord.detect(names, { assumePerfectFifth: true }))
}

export interface ChordReading { symbol: string; alternates: string[] }

/**
 * The one stateful piece in the music layer, and deliberately so: a new reading
 * must persist for confirmMs before it is committed (note-on chatter during a
 * chord change would otherwise commit two or three wrong chords in a row), and a
 * committed reading is held for minDisplayMs so the readout cannot flicker.
 *
 * It takes its clock as a parameter and lives outside the canvas render path, so
 * the "everything visible is a pure function of t" invariant still holds for the
 * canvas. Call reset() on seek.
 */
export class ChordTracker {
  private committed: ChordReading | null = null
  private committedAtMs = 0
  private pendingKey = ''
  private pendingSinceMs = 0

  constructor(
    private readonly minDisplayMs = 300,
    private readonly confirmMs = 60,
  ) {}

  reset(): void {
    this.committed = null
    this.committedAtMs = 0
    this.pendingKey = ''
    this.pendingSinceMs = 0
  }

  update(candidates: string[], nowMs: number): ChordReading | null {
    // Silence never clears the readout: holding the last chord through a rest is
    // what a viewer expects, and blanking mid-phrase reads as a glitch on video.
    if (candidates.length === 0) {
      this.pendingKey = ''
      return this.committed
    }

    const key = candidates.join('|')
    if (this.committed && key === this.committed.symbol + '|' + this.committed.alternates.join('|')) {
      this.pendingKey = ''
      return this.committed
    }

    if (key !== this.pendingKey) {
      this.pendingKey = key
      this.pendingSinceMs = nowMs
      return this.committed
    }

    const confirmed = nowMs - this.pendingSinceMs >= this.confirmMs
    const displayed = !this.committed || nowMs - this.committedAtMs >= this.minDisplayMs
    if (confirmed && displayed) {
      this.committed = { symbol: candidates[0], alternates: candidates.slice(1) }
      this.committedAtMs = nowMs
      this.pendingKey = ''
    }
    return this.committed
  }
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run src/music/chords.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 6: Write the failing roman numeral tests**

`src/music/romanNumerals.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toRomanNumeral } from './romanNumerals'

const C = { tonic: 'C', scale: 'major' as const }
const Am = { tonic: 'A', scale: 'minor' as const }

describe('toRomanNumeral', () => {
  it('leaves a major triad as a bare uppercase numeral', () => {
    expect(toRomanNumeral('CM', C)).toBe('I')
    expect(toRomanNumeral('C', C)).toBe('I')
  })

  it('lowercases minor and diminished, which tonal returns uppercase', () => {
    expect(toRomanNumeral('Dm7', C)).toBe('ii7')
    expect(toRomanNumeral('Am', C)).toBe('vi')
    expect(toRomanNumeral('Bdim', C)).toBe('vii°')
  })

  it('renders a half-diminished seventh with its own symbol', () => {
    expect(toRomanNumeral('Bm7b5', C)).toBe('viiø7')
  })

  it('keeps a dominant seventh uppercase', () => {
    expect(toRomanNumeral('G7', C)).toBe('V7')
  })

  it('normalises tonal’s M7 to maj7', () => {
    expect(toRomanNumeral('CM7', C)).toBe('Imaj7')
    expect(toRomanNumeral('Fmaj7', C)).toBe('IVmaj7')
  })

  it('keeps a borrowed chord’s accidental', () => {
    expect(toRomanNumeral('Ebmaj7', C)).toBe('bIIImaj7')
  })

  it('works against a minor tonic', () => {
    expect(toRomanNumeral('Am', Am)).toBe('i')
    expect(toRomanNumeral('E7', Am)).toBe('V7')
    expect(toRomanNumeral('Bdim', Am)).toBe('ii°')
  })

  it('ignores the slash bass, which tonal cannot express as figured bass', () => {
    expect(toRomanNumeral('CM/E', C)).toBe('I')
    expect(toRomanNumeral('CM/G', C)).toBe('I')
  })

  it('returns null for a symbol tonal cannot parse, rather than echoing it', () => {
    // Progression.toRomanNumerals passes junk straight through, so this must be
    // rejected before the call or nonsense reaches the screen.
    expect(toRomanNumeral('zzz', C)).toBeNull()
    expect(toRomanNumeral('', C)).toBeNull()
  })

  it('returns null rather than a numeral for an empty tonic', () => {
    expect(toRomanNumeral('CM', { tonic: '', scale: 'major' })).toBeNull()
  })
})
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run src/music/romanNumerals.test.ts`
Expected: FAIL — `Failed to resolve import "./romanNumerals"`.

- [ ] **Step 8: Write the roman numeral module**

`src/music/romanNumerals.ts`:

```ts
import { Chord, Progression } from 'tonal'
import type { KeyContext } from './spell'

// The alternation order is load-bearing: IV before I, VII before VI before V,
// III before II before I. Get it wrong and "IV" matches as "I" plus a stray V.
const NUMERAL = /^([b#]*)(IV|VII|VI|V|III|II|I)(.*)$/

/** Minor, diminished and half-diminished lowercase; `maj` must not match `m`. */
const MINORISH = /^(m(?!aj)|dim|ø)/

/**
 * Spec §15.3. tonal returns UPPERCASE numerals with the chord quality appended
 * (`IIm7`, not `ii7`) and silently DROPS the slash bass, so figured-bass notation
 * is not available from this call. It also passes an unparseable symbol straight
 * through, which is why the chord is validated first.
 */
export function toRomanNumeral(symbol: string, key: KeyContext): string | null {
  if (!key.tonic) return null
  const base = symbol.split('/')[0].trim()
  if (!base || Chord.get(base).empty) return null

  const [raw] = Progression.toRomanNumerals(key.tonic, [base])
  const m = NUMERAL.exec(raw ?? '')
  if (!m) return null

  const [, accidental, roman, rawSuffix] = m
  const minorish = MINORISH.test(rawSuffix)

  let suffix = rawSuffix
  if (minorish) suffix = suffix.replace(/^m(?!aj)/, '')
  suffix = suffix.replace(/^dim/, '°').replace(/^(m7b5|7b5)/, 'ø7').replace(/^M7/, 'maj7')
  if (suffix === 'M') suffix = ''

  return accidental + (minorish ? roman.toLowerCase() : roman) + suffix
}
```

- [ ] **Step 9: Run them to verify they pass**

Run: `npx vitest run src/music/ && npm run build`
Expected: PASS, build clean.

- [ ] **Step 10: Commit**

```bash
git add src/model/search.ts src/music/chords.ts src/music/chords.test.ts src/music/romanNumerals.ts src/music/romanNumerals.test.ts src/render/pianoRoll.ts
git commit -m "feat: chord identification with inversions, plus roman numerals"
```

---

### Task 16: The on-stage chord readout

Spec §15.2's markup and placement, §15.3's roman numerals, and the settings that drive
both. This is the last task in the plan.

**Files:**
- Create: `src/ui/ChordReadout.tsx`, `src/ui/ChordReadout.test.tsx`
- Modify: `src/ui/StageText.tsx`, `src/ui/TextSettings.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `ChordReading`, `ChordTracker`, `detectChord`, `pitchesInWindow` from `src/music/chords.ts`; `toRomanNumeral` from `src/music/romanNumerals.ts`; `keyOfScore`, `KEY_OPTIONS`, `formatKey` from `src/music/keyOf.ts`; `textCss` from `src/ui/StageText.tsx`
- Produces:
  - `interface ChordDisplayValue { symbol: string; numeral: string | null; alternates: string[] }`
  - `chordDisplayText(v: ChordDisplayValue, mode: ChordDisplay): string`
  - `ChordReadout` React component, props `{ layout; value: ChordDisplayValue | null; text: TextSettingsType }`

- [ ] **Step 1: Write the failing tests**

`src/ui/ChordReadout.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ChordReadout, chordDisplayText } from './ChordReadout'
import { computeLayout } from '../render/geometry'
import { DEFAULT_SETTINGS } from '../settings/types'

const layout = computeLayout(1220, 700)
const text = (patch = {}) => ({ ...DEFAULT_SETTINGS.text, ...patch })
const value = { symbol: 'Cmaj7', numeral: 'Imaj7', alternates: ['Em7/C'] }

describe('chordDisplayText', () => {
  it('shows the symbol alone', () => {
    expect(chordDisplayText(value, 'symbol')).toBe('Cmaj7')
  })

  it('shows the numeral alone', () => {
    expect(chordDisplayText(value, 'numeral')).toBe('Imaj7')
  })

  it('shows both, symbol first', () => {
    expect(chordDisplayText(value, 'both')).toBe('Cmaj7  Imaj7')
  })

  it('falls back to the symbol when no numeral could be derived', () => {
    expect(chordDisplayText({ ...value, numeral: null }, 'numeral')).toBe('Cmaj7')
    expect(chordDisplayText({ ...value, numeral: null }, 'both')).toBe('Cmaj7')
  })

  it('shows nothing when the readout is off', () => {
    expect(chordDisplayText(value, 'off')).toBe('')
  })
})

describe('ChordReadout', () => {
  it('renders the spec’s markup, with the symbol as a data attribute', () => {
    const { container } = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'symbol' })} />,
    )
    const el = container.querySelector('#chord-readout')!
    expect(el.className).toContain('chord-readout')
    expect(el.getAttribute('data-symbol')).toBe('Cmaj7')
    expect(el.textContent).toContain('Cmaj7')
  })

  it('renders nothing when the readout is off', () => {
    const { container } = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'off' })} />,
    )
    expect(container.querySelector('#chord-readout')).toBeNull()
  })

  it('renders nothing before a chord has been identified', () => {
    const { container } = render(
      <ChordReadout layout={layout} value={null} text={text({ chord: 'symbol' })} />,
    )
    expect(container.querySelector('#chord-readout')).toBeNull()
  })

  it('shows alternates only when they are switched on', () => {
    const off = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'symbol' })} />,
    )
    expect(off.container.querySelector('.chord-alternates')).toBeNull()

    const on = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'symbol', chordAlternates: true })} />,
    )
    expect(on.container.querySelector('.chord-alternates')!.textContent).toContain('Em7/C')
  })

  it('carries a placement modifier class so a stylesheet can move it', () => {
    const { container } = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'symbol', chordPlacement: 'above-keys' })} />,
    )
    expect(container.querySelector('#chord-readout')!.className).toContain('chord-readout--above-keys')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/ui/ChordReadout.test.tsx`
Expected: FAIL — `Failed to resolve import "./ChordReadout"`.

- [ ] **Step 3: Write the readout**

`src/ui/ChordReadout.tsx`:

```tsx
import { textCss } from './StageText'
import type { KeyboardLayout } from '../render/geometry'
import type { ChordDisplay, TextSettings as TextSettingsType } from '../settings/types'

export interface ChordDisplayValue {
  symbol: string
  numeral: string | null
  alternates: string[]
}

/** The numeral can legitimately be null -- tonal cannot name every chord against
    every key -- so every mode degrades to the symbol rather than to nothing. */
export function chordDisplayText(v: ChordDisplayValue, mode: ChordDisplay): string {
  switch (mode) {
    case 'symbol': return v.symbol
    case 'numeral': return v.numeral ?? v.symbol
    case 'both': return v.numeral ? `${v.symbol}  ${v.numeral}` : v.symbol
    default: return ''
  }
}

function position(
  placement: TextSettingsType['chordPlacement'], layout: KeyboardLayout, size: number,
): React.CSSProperties {
  switch (placement) {
    case 'stage-centre':
      return { left: '50%', top: `${size * 0.6}px`, transform: 'translateX(-50%)' }
    case 'above-keys':
      return { left: '50%', top: `${layout.hitY - size * 2.6}px`, transform: 'translateX(-50%)' }
    default:
      return { left: `${size * 0.6}px`, top: `${size * 0.6}px` }
  }
}

export function ChordReadout(props: {
  layout: KeyboardLayout | null
  value: ChordDisplayValue | null
  text: TextSettingsType
}) {
  const { layout, value, text } = props
  if (!layout || !value || text.chord === 'off') return null

  const body = chordDisplayText(value, text.chord)
  if (!body) return null

  const size = text.style.sizeRatio * layout.whiteW * 1.8
  const css = textCss(text.style, layout.whiteW * 1.8)

  return (
    <div
      id="chord-readout"
      className={`chord-readout chord-readout--${text.chordPlacement}`}
      data-symbol={value.symbol}
      data-numeral={value.numeral ?? ''}
      style={{ ...css, position: 'absolute', whiteSpace: 'nowrap', lineHeight: 1.1, ...position(text.chordPlacement, layout, size) }}
    >
      {body}
      {text.chordAlternates && value.alternates.length > 0 && (
        <div className="chord-alternates" style={{ fontSize: '0.5em', opacity: 0.7 }}>
          {value.alternates.join('  ·  ')}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/ui/ChordReadout.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 5: Add the chord controls to the text settings**

In `src/ui/TextSettings.tsx`, add these rows above the typography rows, and import
`KEY_OPTIONS` from `../music/keyOf` plus the `ChordDisplay` and `ChordPlacement` types:

```tsx
      <SettingsRow label="Chord readout">
        <select
          aria-label="Chord readout"
          className="chord-display-select rounded border border-[var(--line)] bg-[var(--panel)] px-1 py-0.5 text-[11px] text-[var(--ink)]"
          value={text.chord}
          onChange={(e) => onChange({ chord: e.target.value as ChordDisplay })}
        >
          <option value="off">Off</option>
          <option value="symbol">Chord symbol</option>
          <option value="numeral">Roman numeral</option>
          <option value="both">Both</option>
        </select>
      </SettingsRow>

      <SettingsRow label="Chord position">
        <select
          aria-label="Chord position"
          className="chord-placement-select rounded border border-[var(--line)] bg-[var(--panel)] px-1 py-0.5 text-[11px] text-[var(--ink)]"
          value={text.chordPlacement}
          onChange={(e) => onChange({ chordPlacement: e.target.value as ChordPlacement })}
        >
          <option value="stage-left">Stage top-left</option>
          <option value="stage-centre">Stage top-centre</option>
          <option value="above-keys">Above the keys</option>
        </select>
      </SettingsRow>

      <SettingsRow label="Show alternates">
        <input
          type="checkbox" aria-label="Show alternates"
          className="chord-alternates-toggle accent-[var(--accent)]"
          checked={text.chordAlternates}
          onChange={(e) => onChange({ chordAlternates: e.target.checked })}
        />
      </SettingsRow>

      <SettingsRow label="Chord window" htmlFor="chord-window">
        <input
          id="chord-window" type="range" aria-label="Chord window"
          className="chord-window-slider h-1 w-28 accent-[var(--accent)]"
          min={100} max={2000} step={50} value={text.chordWindowMs}
          onChange={(e) => onChange({ chordWindowMs: Number(e.target.value) })}
        />
        <span className="chord-window-value w-12 text-right font-mono text-[10px] tabular-nums text-[var(--ink-dim)]">
          {text.chordWindowMs}ms
        </span>
      </SettingsRow>

      <SettingsRow label="Key">
        <select
          aria-label="Key"
          className="key-override-select rounded border border-[var(--line)] bg-[var(--panel)] px-1 py-0.5 text-[11px] text-[var(--ink)]"
          value={text.keyOverride ?? ''}
          onChange={(e) => onChange({ keyOverride: e.target.value || null })}
        >
          <option value="">From the file (C major if absent)</option>
          {KEY_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </SettingsRow>
```

- [ ] **Step 6: Drive the readout from the app**

In `src/App.tsx`, add the tracker and the chord state:

```tsx
  const trackerRef = useRef(new ChordTracker())
  const chordKeyRef = useRef('')
  const lastHeadRef = useRef(0)
  const [chord, setChord] = useState<ChordDisplayValue | null>(null)
```

In the draw callback, after `held` is derived:

```tsx
      // Scrubbing backwards runs the tracker's clock backwards, which would stall
      // its hysteresis. Reset on any backward jump, and on seek (below).
      if (head < lastHeadRef.current - 0.25) trackerRef.current.reset()
      lastHeadRef.current = head

      if (st.text.chord === 'off') {
        if (chordKeyRef.current !== '') { chordKeyRef.current = ''; setChord(null) }
      } else {
        // pitchesInWindow is a binary search plus a short forward scan, the same
        // order of cost as visibleNotes, and runs only while the readout is on.
        // detectChord -- the expensive half -- runs only when the SET changes.
        const set = pitchesInWindow(
          state.score?.notes ?? [], head, st.text.chordWindowMs / 1000, state.maxNoteDur,
        )
        const setKey = set.join(',')
        if (setKey !== chordKeyRef.current) {
          chordKeyRef.current = setKey
          const kc = keyOfScore(state.score, st.text.keyOverride)
          const reading = trackerRef.current.update(detectChord(set, kc), head * 1000)
          setChord(reading
            ? { symbol: reading.symbol, alternates: reading.alternates, numeral: toRomanNumeral(reading.symbol, kc) }
            : null)
        }
      }
```

Reset the tracker in `seek` and in `loadFile`, next to the scheduler re-seats:

```tsx
    trackerRef.current.reset()
    chordKeyRef.current = ''
```

Render it beside the labels, inside `stage-wrap`:

```tsx
        <ChordReadout layout={stageText.layout} value={chord} text={settings.text} />
```

- [ ] **Step 7: Verify the whole suite and the build**

Run: `npm test && npm run build && node tests/geometry-check.mjs`
Expected: everything passes.

- [ ] **Step 8: Manual check — the last one**

Run: `npm run dev -- --host 0.0.0.0` and load `docs/demo.mid`. With the chord readout on:

1. The right hand's **arpeggios resolve to a single chord symbol**, not to a new symbol
   per note — that is what the rolling window is for. Widen and narrow the window and
   watch the behaviour change.
2. The symbol does **not flicker** through a chord change.
3. Switch to **Roman numeral** and confirm minor chords are lowercase (`vi`, not `VIm`)
   and diminished chords carry `°`.
4. Set the **Key** override to something distant, such as `F# minor`, and confirm the
   numerals change and the note labels re-spell with sharps.
5. Scrub backwards during playback: the chord readout must recover rather than stick.
6. Try all three placements, and confirm the readout stays legible over the notes thanks
   to the dark outline.

- [ ] **Step 9: Commit**

```bash
git add src/ui/ChordReadout.tsx src/ui/ChordReadout.test.tsx src/ui/TextSettings.tsx src/App.tsx
git commit -m "feat: on-stage chord symbol and roman numeral readout"
```

---

### Task 17: Close plan 1's parked test gaps

The plan 1 handover parks six items with "belongs in plan 2's test pass" and two marked
FLAG FOR FINAL REVIEW. None is a suspected defect — all are code the reviewer verified by
reading rather than by test — but a regression in any of them would reach `master`
unnoticed. They are cheap, and every one of them is now touched by this plan's changes.

**Files:**
- Modify: `src/transport/useTransport.test.ts`, `src/render/geometry.test.ts`, `src/render/pianoRoll.test.ts`
- Create: `src/render/keyboard.test.ts`

**Interfaces:**
- Consumes: everything already built; this task adds no production code
- Produces: no new exports

- [ ] **Step 1: Test the end-of-playback stop and clearScore**

Append to `src/transport/useTransport.test.ts`:

```ts
describe('parked plan 1 gaps', () => {
  it('pausing at the end leaves the playhead exactly at the duration', () => {
    const s = makeScore()
    useTransport.getState().loadScore(s)
    const dur = useTransport.getState().score!.durationSec
    useTransport.getState().play(100)
    // This is what App's scheduler tick does when head >= durationSec.
    useTransport.getState().pause(100 + dur)
    expect(useTransport.getState().playing).toBe(false)
    expect(useTransport.getState().pausedAtSec).toBeCloseTo(dur, 9)
  })

  it('clearScore returns the store to its empty state', () => {
    useTransport.getState().loadScore(makeScore())
    useTransport.getState().play(10)
    useTransport.getState().clearScore()
    const s = useTransport.getState()
    expect(s.score).toBeNull()
    expect(s.playing).toBe(false)
    expect(s.pausedAtSec).toBe(0)
    expect(s.originSec).toBe(0)
    expect(s.maxNoteDur).toBe(0)
  })

  it('seek clamps to the score at both ends, paused and playing', () => {
    useTransport.getState().loadScore(makeScore())
    const dur = useTransport.getState().score!.durationSec

    useTransport.getState().seek(-5, 0)
    expect(useTransport.getState().pausedAtSec).toBe(0)

    useTransport.getState().seek(dur + 99, 0)
    expect(useTransport.getState().pausedAtSec).toBeCloseTo(dur, 9)

    useTransport.getState().play(50)
    useTransport.getState().seek(dur + 99, 50)
    expect(useTransport.getState().pausedAtSec).toBeCloseTo(dur, 9)
    expect(useTransport.getState().originSec).toBeCloseTo(50 - dur, 9)
  })

  it('seek on an empty store clamps to zero rather than to NaN', () => {
    useTransport.getState().clearScore()
    useTransport.getState().seek(10, 0)
    expect(useTransport.getState().pausedAtSec).toBe(0)
  })
})
```

- [ ] **Step 2: Rebuild the geometry boundary oracle so it cannot share a bug**

The handover flags that `geometry.test.ts`'s `boundaries()` helper re-derives the same
`wi` accumulation production uses, so a shared indexing bug would slip past all three
implementations. Compute the expected boundaries from the key widths **read off
`l.keys`** instead, which shares no arithmetic with production:

```ts
/** Independent oracle: the boundary before white key i is the sum of the WIDTHS
    of the white keys before it, read off the produced layout. Shares no index
    arithmetic with computeLayout, so a wi bug cannot hide in both. */
function boundariesFromWidths(l: KeyboardLayout): number[] {
  const out: number[] = []
  let x = 0
  for (const k of l.keys) {
    if (k.black) continue
    out.push(x)
    x += k.w
  }
  out.push(x)
  return out
}
```

Replace the existing `boundaries()` helper with this one at every call site in that file,
and add:

```ts
  it('agrees with an oracle built from key widths rather than key indices', () => {
    const l = computeLayout(1220, 700)
    const oracle = boundariesFromWidths(l)
    const whites = l.keys.filter((k) => !k.black)
    whites.forEach((k, i) => { expect(k.x).toBeCloseTo(oracle[i], 6) })
    expect(oracle[oracle.length - 1]).toBeCloseTo(l.stageW, 6)
  })
```

- [ ] **Step 3: Assert a bar's fill colour, not just that a bar was drawn**

The handover flags that the draw tests assert only relative call counts, never that a
bar's fill matches `noteColor`. Append to `src/render/pianoRoll.test.ts`:

```ts
  it('fills a bar with the gradient stops noteColor produces for its voice', () => {
    const ctx = recordingCtx()          // the existing stub helper in this file
    const state = baseState()           // one note, voice hue 207, velocity 100
    drawRoll(ctx, state, 0, state.notes)

    const stops = ctx.gradientStops     // extend the stub to record addColorStop args
    expect(stops).toContain(noteColor(207, 100, state.velocity))
    expect(stops).toContain(noteColor(207, 86, state.velocity))   // the -14 top stop
  })

  it('uses the theme's key colours for unheld keys', () => {
    const ctx = recordingCtx()
    const theme = { ...DEFAULT_THEME, keyWhite: '#111111', keyBlack: '#222222' }
    drawKeyboard(ctx, { ...baseState(), theme }, new Map())
    expect(ctx.fillStyles).toContain('#111111')
    expect(ctx.fillStyles).toContain('#222222')
  })
```

If the recording stub does not capture `addColorStop` arguments or the sequence of
`fillStyle` assignments, extend it — a stub that records only call names is exactly what
made this gap possible.

- [ ] **Step 4: Test the C4 label threshold**

`src/render/keyboard.test.ts` — this file does not exist yet; `keyboard.ts` has had no
render tests at all.

```ts
import { describe, it, expect } from 'vitest'
import { drawKeyboard } from './keyboard'
import { computeLayout } from './geometry'
import { DEFAULT_THEME } from './theme'
import { DEFAULT_SCHEME } from './colors'
import { recordingCtx, baseState } from './pianoRoll.test-helpers'   // extract if not already shared

describe('the middle C label', () => {
  it('is drawn when white keys are wide enough to read it', () => {
    const ctx = recordingCtx()
    const layout = computeLayout(1220, 700)    // whiteW ~= 23.5, above the 14px floor
    drawKeyboard(ctx, { ...baseState(), layout, theme: DEFAULT_THEME, velocity: DEFAULT_SCHEME, showMiddleC: true }, new Map())
    expect(ctx.texts).toContain('C4')
  })

  it('is skipped below the legibility floor rather than drawn as mush', () => {
    const ctx = recordingCtx()
    const layout = computeLayout(600, 700)     // whiteW ~= 11.5, below the 14px floor
    drawKeyboard(ctx, { ...baseState(), layout, theme: DEFAULT_THEME, velocity: DEFAULT_SCHEME, showMiddleC: true }, new Map())
    expect(ctx.texts).not.toContain('C4')
  })

  it('is skipped entirely when the middle C marker is switched off', () => {
    const ctx = recordingCtx()
    const layout = computeLayout(1220, 700)
    drawKeyboard(ctx, { ...baseState(), layout, theme: DEFAULT_THEME, velocity: DEFAULT_SCHEME, showMiddleC: false }, new Map())
    expect(ctx.texts).not.toContain('C4')
  })

  it('is skipped when middle C is outside the zoomed range', () => {
    const ctx = recordingCtx()
    const layout = computeLayout(1220, 700, { firstPitch: 72, lastPitch: 95 })
    drawKeyboard(ctx, { ...baseState(), layout, theme: DEFAULT_THEME, velocity: DEFAULT_SCHEME, showMiddleC: true }, new Map())
    expect(ctx.texts).not.toContain('C4')
  })
})
```

Move `recordingCtx` and `baseState` out of `pianoRoll.test.ts` into
`src/render/pianoRoll.test-helpers.ts` and import them in both files, rather than copying
them. Make sure the stub records `fillText` arguments in a `texts` array.

- [ ] **Step 5: Verify the whole suite**

Run: `npm test && npm run build && node tests/geometry-check.mjs`
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add src/transport/useTransport.test.ts src/render/geometry.test.ts src/render/pianoRoll.test.ts src/render/pianoRoll.test-helpers.ts src/render/keyboard.test.ts
git commit -m "test: close the coverage gaps parked by the plan 1 handover"
```

---

## Self-Review

**Spec coverage for this plan's slice.** §7 colour system (both schemes) — Task 5.
§8 keyboard zoom and `ensureFullBlackKeyGroups` — Task 6. §9 settings dropdown — Master
BPM Task 2, Voices Task 4, Velocity Task 5, Display Task 6, Audio and metronome Task 7,
Profile Task 8, Theme Task 12, Text Task 14 and 16. §10 persistence, export, import,
song-vs-global split — Task 8. §11's profile-version refusal — Task 8. §12 UI conventions
— every UI task. §13.1 transparent stage — Tasks 11 and 12. §13.2 solid matte with the
keying warning — Task 12. §14 token system — Task 10. §14.1 token set — Task 10.
§14.2 keyboard presets — Task 12. §15 DOM overlay — Task 14. §15.1 note labels — Task 14.
§15.2 chord identification — Tasks 15 and 16. §15.3 roman numerals — Tasks 15 and 16.
§15.4 typography and the dark stroke — Tasks 14 and 16. §16 debug mode — Task 9.
§17 testing — Task 17 closes the plan 1 gaps.

**Deferred by design, and where to.**
- **§13.3 alpha-preserving export** — the spec deliberately does not bundle it. Its own project.
- **§9's Notation display mode** and **§11's "notation mode with a MIDI file"** — plan 3.
- **§9's MIDI input device and sound-local-input**, and **§7's dedicated live-input hue** — plan 4.
- **§11's off-range marker** for notes outside MIDI 21–108 — not on the v2 checklist and not reachable from Fit zoom, which derives its range from the notes themselves. Left as a plan 1 residue.
- **Manual keyboard range.** §8 says zoom is "overridable to full-88 **or a manual range**". Task 6 ships `full` and `fit`; `ZoomMode` is a string union, so adding `{ kind: 'manual', lo, hi }` later is a type change plus a UI row, with `computeLayout` and `ensureFullBlackKeyGroups` already taking arbitrary bounds.

**Three places this plan corrects the spec rather than following it.** Each was verified by running the library, not by reading about it.

1. **§15.2's "Take the first result" is wrong.** `Chord.detect(['E3','C4','G4'], { assumePerfectFifth: true })` returns `["Em#5", "CM/E"]` in tonal 6.4.3 — a first-inverted C major would print as `Em#5`. Task 15 adds a stable demote-the-rare ranking pass and pins eight inversions against it.
2. **§14.1's `--tmi-flash-core` / `--tmi-flash-warm` cannot hold a complete `rgba()`.** The flash's alpha is a per-frame function of velocity and age. Task 10 names them `--tmi-flash-core-rgb` / `--tmi-flash-warm-rgb` holding a bare `r, g, b` triple. Every other token keeps the spec's exact name.
3. **§10's export shape gains `theme` and `text` blocks** at the same `schemaVersion: 1`, because §13–15 were specced after §10 was written. Task 1 defines the whole settings shape up front so this needs no migration.

**Two deliberate trade-offs, stated so they can be reversed.**
- **Gradient velocity mode ignores voice hue** (Task 5). Blending a per-voice hue into a multi-stop gradient produces muddy colour, and §7 introduces the gradient as an alternative colour *language* rather than a modifier. The UI says so in one line. Reversing it means deciding what hue-plus-gradient should mean.
- **`detectChord` refuses fewer than three pitches** (Task 15). tonal names two notes as a power chord (`['C4','G4']` → `C5`), which reads as noise under a piano roll. If a user wants dyads named, the constant is one line.

**Type consistency.**
- Three type names collide with component names: `DisplaySettings`, `TextSettings` and `ThemeSettings` are each both an interface in `src/settings/types.ts` and a component in `src/ui/`. Every consumer imports the type as `…SettingsType` (`import type { TextSettings as TextSettingsType }`), which is how Tasks 6, 12, 14 and 16 are written. `App.tsx` imports the components only, so it is unaffected.
- `RenderState` grows across four tasks and nowhere else: `velocity` (Task 5), `flashScale` and `showMiddleC` (Task 6), `theme` (Task 11), optional `held` (Task 14). Each of those tasks updates every `RenderState` literal in the render tests in the same step, and none of the fields is optional except `held` — an optional `showMiddleC` would reach `keyboard.ts` as `undefined` and silently hide the marker.
- `ScoreDocument` grows twice: `beatsPerBar` (Task 7) and `keySignature` (Task 13). Both are required, both are set in `parseMidi`, and both tasks say to add the field to every existing `ScoreDocument` literal in tests rather than making it optional.
- `drawKeyboard(ctx, state, held)` takes its new shape once, in Task 5, and Task 11 adds the theme to `RenderState` rather than to the argument list, so the signature changes exactly once.
- `noteColor(hue, velocity, scheme?)` is defined in Task 5 and called with `state.velocity` in both renderers from Task 5 onward.
- `layout.stageW` replaces every `whiteW * 52` in Task 6, before Task 11 needs it.
- `foldVelocity` is deleted in Task 3 with a `grep` check in the same step. Nothing after Task 3 may reference it.
- `AudioEngine`'s surface after Task 7 is: `currentTime`, `audioContext`, `masterNode`, `ready`, `resume`, `setMasterVolume`, `setVoiceVolume`, `loadVoice`, `retainVoices`, `play`, `stopAll`, `dispose`. `loadInstrument` no longer exists.

**Known seams, left alone deliberately.**
- `pitchesInWindow` runs once per frame while the chord readout is on, allocating a `Set` and an array. It is a binary search plus a short forward scan — the same order of cost as `visibleNotes`, which already runs per frame — and `detectChord`, the expensive half, runs only when the pitch set changes. Not pre-optimised, because nobody has profiled it.
- `ChordTracker` is the only stateful piece in `src/music/`. It sits outside the canvas render path and takes its clock as a parameter, so the "everything visible is a pure function of `t`" invariant still holds where it matters. Scrubbing backwards resets it rather than trying to make hysteresis time-symmetric.
- Task 14 removes plan 1's known seam as a side effect: `visibleNotes` and `heldNotes` are now computed once in the draw callback and passed in, instead of `drawRoll` and `drawStage` each filtering.
