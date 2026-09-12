# Core Playback Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load a MIDI file and watch it play on a true-scale 88-key piano keyboard with a falling piano roll and a white strike flash, with audio in sync.

**Architecture:** `AudioContext.currentTime` is the single clock. A 25 ms lookahead scheduler hands smplr the next 150 ms of notes with exact start times; a `requestAnimationFrame` draw loop reads the same clock and derives every visible thing as a pure function of `t`. Musical time (ticks) is the truth in the data model; seconds are derived through a tempo map, so tempo changes re-time without corrupting the score.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS v4, Zustand, Canvas 2D, `@tonejs/midi`, `smplr`, `@fontsource/poppins`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-piano-visualizer-design.md`

## Global Constraints

- **Typography:** Poppins, self-hosted via `@fontsource/poppins`. Never a CDN font link.
- **CSS:** Tailwind utilities, and **every element carries a contextual semantic class name alongside them** — `className="voice-row flex items-center gap-3"`. Non-negotiable; it is how elements are found in the inspector and in tests.
- **Dev server:** always `--host 0.0.0.0`. The phone-landscape layout must be testable on a real device.
- **Keyboard geometry is fixed by the spec and measured against `docs/reference-sheetmusicboss.png`.** Do not adjust these while implementing:
  - White key width `= stageWidth / 52`. 52 white keys tile the width exactly.
  - Black key width `= 0.5652 * whiteW` (matches chordl).
  - Black key centre offsets from the white-key boundary, in units of black-key width `b`: **C# `-b/6`, D# `+b/6`, F# `-b/4`, G# `0`, A# `+b/4`**. G# is the only one on a boundary.
  - `keyboardH = min(whiteW * 5.8, stageH * 0.55)`. **Derived from key width, never from viewport height** — deriving it from height is the defect this replaced.
  - Black key length `= 0.655 * keyboardH`.
- **Flash constants:** `FLASH_MS = 220`, bloom radius `2.2 * whiteW`, intensity floor `0.45`, 5 sparks, spark length `1.6 * whiteW`, spread `±50°`.
- **Voice hues:** left hand `207`, right hand `28`. Velocity lightness ramps `78% → 38%`, saturation `85%`.
- **Pitch range:** MIDI 21–108 inclusive is the keyboard. Notes outside it stay in the model and stay audible.
- **The flash must remain a pure function of `t`.** No particle pool, no spawned state. Scrubbing backwards must produce the correct flash.
- **Reference rig:** `tools/strike-lab.html` is the authority on visual constants. If code and spec disagree, the rig is right.

---

## File Structure

```
src/
  main.tsx                     React entry, mounts App
  App.tsx                      Shell: file drop, stage, transport bar
  index.css                    Tailwind import, Poppins, CSS tokens

  model/
    types.ts                   NoteEvent, Voice, ScoreDocument, TempoEvent
    tempoMap.ts                ticks<->seconds; scale% and absolute-BPM modes

  io/
    parseMidi.ts               @tonejs/midi -> ScoreDocument
    handSplit.ts               single-track MIDI -> two voices at a pitch point
    hashFile.ts                SHA-256 of file bytes (profile key, used in plan 2)

  audio/
    engine.ts                  AudioContext + smplr instrument cache
    scheduler.ts               lookahead loop; clock injected for tests

  transport/
    useTransport.ts            Zustand store: play/pause/seek/tempo, clock origin

  render/
    geometry.ts                pitch -> x/width/height for all 88 keys
    colors.ts                  (hue, velocity) -> css; flash intensity
    keyboard.ts                canvas draw: keys + held tint
    pianoRoll.ts               canvas draw: windowed bars + impact layer
    useCanvasStage.ts          rAF loop, DPR, ResizeObserver

  ui/
    TransportBar.tsx           play/pause, scrub, time, mode switch
    FileDropZone.tsx           drag-drop + file picker
```

**Boundaries.** `render/*` is pure: every function takes `(ctx, state, t)` and holds no state. `audio/scheduler.ts` takes its clock as a parameter, so it tests with a fake clock and no AudioContext. `model/tempoMap.ts` is pure arithmetic with no dependencies — it is the most-tested file in the plan.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a running dev server and `npm test` running Vitest.

- [ ] **Step 1: Scaffold and install**

```bash
cd /home/shaun/tickle-me-ivorys
npm create vite@latest . -- --template react-ts
npm install
npm install zustand @tonejs/midi smplr @fontsource/poppins
npm install -D tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react
```

If `npm create vite` refuses because the directory is not empty, scaffold into a temp dir and copy in: `npm create vite@latest /tmp/tmi -- --template react-ts && cp -r /tmp/tmi/{src,index.html,vite.config.ts,tsconfig*.json,package.json} .` — then re-add the existing `docs/`, `tools/`, `tests/` which must not be deleted.

- [ ] **Step 2: Configure Vite for Tailwind, tests, and LAN access**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '0.0.0.0' },
  test: { environment: 'jsdom', globals: true },
})
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

If TypeScript complains that `test` is not a valid Vite config key, change the first line to `/// <reference types="vitest/config" />` above the imports.

- [ ] **Step 3: Set up global styles**

`src/index.css`:

```css
@import "tailwindcss";
@import "@fontsource/poppins/400.css";
@import "@fontsource/poppins/500.css";
@import "@fontsource/poppins/600.css";
@import "@fontsource/poppins/700.css";

:root {
  --stage: #000000;
  --ground: #07070a;
  --panel: #101119;
  --line: #22232e;
  --ink: #e9eaf2;
  --ink-dim: #9698ad;
  --accent: #ff9c1a;
}

html, body, #root { height: 100%; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;
}
```

`src/App.tsx`:

```tsx
export default function App() {
  return (
    <div className="app-shell flex h-full flex-col items-center justify-center gap-2">
      <h1 className="app-title text-lg font-semibold">Tickle Me Ivorys</h1>
      <p className="app-tagline text-sm text-[var(--ink-dim)]">Core playback engine</p>
    </div>
  )
}
```

Ensure `src/main.tsx` imports `./index.css`.

- [ ] **Step 4: Write the smoke test**

`src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs typescript under vitest', () => {
    const doubled: number[] = [1, 2, 3].map((n) => n * 2)
    expect(doubled).toEqual([2, 4, 6])
  })
})
```

- [ ] **Step 5: Verify both the test run and the dev server**

```bash
npm test
```
Expected: 1 test passing.

```bash
npm run dev -- --host 0.0.0.0
```
Expected: Vite prints both a `Local:` and a `Network:` URL. The Network line is what makes phone testing possible — if it is absent, the `server.host` config did not take. Stop the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Tailwind + Vitest"
```

---

### Task 2: Core types and tempo map

**Files:**
- Create: `src/model/types.ts`, `src/model/tempoMap.ts`
- Test: `src/model/tempoMap.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface NoteEvent { id: number; pitch: number; startTicks: number; durTicks: number; startSec: number; endSec: number; velocity: number; voiceId: string }`
  - `interface Voice { id: string; label: string; hue: number; instrument: string; visible: boolean; audible: boolean; volume: number }`
  - `interface TempoEvent { ticks: number; sec: number; bpm: number }`
  - `interface ScoreDocument { id: string; name: string; ppq: number; tempoMap: TempoEvent[]; voices: Voice[]; notes: NoteEvent[]; durationSec: number; sourceFormat: 'midi' | 'musicxml' }`
  - `type TempoSetting = { mode: 'scale'; scale: number } | { mode: 'absolute'; bpm: number }`
  - `buildTempoMap(changes: {ticks:number;bpm:number}[], ppq:number): TempoEvent[]`
  - `ticksToSec(map: TempoEvent[], ppq: number, ticks: number, setting: TempoSetting): number`
  - `secToTicks(map: TempoEvent[], ppq: number, sec: number, setting: TempoSetting): number`

- [ ] **Step 1: Write the failing tests**

`src/model/tempoMap.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTempoMap, ticksToSec, secToTicks } from './tempoMap'
import type { TempoSetting } from './types'

const PPQ = 480
const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }

describe('buildTempoMap', () => {
  it('inserts a 120bpm entry at tick 0 when the file has none', () => {
    const map = buildTempoMap([], PPQ)
    expect(map).toEqual([{ ticks: 0, sec: 0, bpm: 120 }])
  })

  it('accumulates seconds across tempo changes', () => {
    // 4 beats at 120bpm = 2s, then the tempo doubles
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 240 }], PPQ)
    expect(map[1].sec).toBeCloseTo(2, 9)
  })

  it('sorts unsorted input', () => {
    const map = buildTempoMap([{ ticks: 960, bpm: 90 }, { ticks: 0, bpm: 120 }], PPQ)
    expect(map.map((e) => e.ticks)).toEqual([0, 960])
  })
})

describe('ticksToSec', () => {
  it('converts at a constant tempo', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }], PPQ)
    expect(ticksToSec(map, PPQ, PPQ, SCALE_1)).toBeCloseTo(0.5, 9)  // 1 beat @120 = 0.5s
  })

  it('honours a tempo change partway through', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 240 }], PPQ)
    // 4 beats @120 (2s) + 4 beats @240 (1s)
    expect(ticksToSec(map, PPQ, 8 * PPQ, SCALE_1)).toBeCloseTo(3, 9)
  })

  it('scale mode compresses time uniformly and preserves tempo changes', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 240 }], PPQ)
    const half: TempoSetting = { mode: 'scale', scale: 2 }
    expect(ticksToSec(map, PPQ, 8 * PPQ, half)).toBeCloseTo(1.5, 9)
    // the ritardando survives: second half still takes half as long as the first
    const a = ticksToSec(map, PPQ, 4 * PPQ, half)
    const b = ticksToSec(map, PPQ, 8 * PPQ, half) - a
    expect(a / b).toBeCloseTo(2, 9)
  })

  it('absolute mode flattens the tempo map entirely', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 240 }], PPQ)
    const flat: TempoSetting = { mode: 'absolute', bpm: 60 }
    expect(ticksToSec(map, PPQ, 8 * PPQ, flat)).toBeCloseTo(8, 9)  // 8 beats @60 = 8s
  })
})

describe('secToTicks', () => {
  it('round-trips against ticksToSec in every mode', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 100 }, { ticks: 3 * PPQ, bpm: 175 }], PPQ)
    const settings: TempoSetting[] = [
      { mode: 'scale', scale: 1 },
      { mode: 'scale', scale: 0.5 },
      { mode: 'scale', scale: 2.4 },
      { mode: 'absolute', bpm: 90 },
    ]
    for (const s of settings) {
      for (const ticks of [0, 240, 1440, 5000, 12345]) {
        const sec = ticksToSec(map, PPQ, ticks, s)
        expect(secToTicks(map, PPQ, sec, s)).toBeCloseTo(ticks, 6)
      }
    }
  })
})

describe('tempo change preserves musical position', () => {
  it('the tick at a given playhead maps back to the same tick after a tempo change', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }], PPQ)
    const before: TempoSetting = { mode: 'scale', scale: 1 }
    const after: TempoSetting = { mode: 'scale', scale: 1.75 }
    const playheadSec = 3.2
    const ticks = secToTicks(map, PPQ, playheadSec, before)
    const rebasedSec = ticksToSec(map, PPQ, ticks, after)
    expect(secToTicks(map, PPQ, rebasedSec, after)).toBeCloseTo(ticks, 6)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/model/tempoMap.test.ts`
Expected: FAIL — `Failed to resolve import "./tempoMap"`.

- [ ] **Step 3: Write the types**

`src/model/types.ts`:

```ts
export interface NoteEvent {
  id: number
  pitch: number          // MIDI 0-127; 21-108 are on the keyboard
  startTicks: number
  durTicks: number
  startSec: number       // derived from tempoMap + TempoSetting
  endSec: number
  velocity: number       // 0-127
  voiceId: string
}

export interface Voice {
  id: string
  label: string
  hue: number            // 0-360
  instrument: string     // smplr instrument id
  visible: boolean
  audible: boolean
  volume: number         // 0-1
}

export interface TempoEvent {
  ticks: number
  sec: number            // seconds at this tick, at the file's own tempi
  bpm: number
}

export type TempoSetting =
  | { mode: 'scale'; scale: number }
  | { mode: 'absolute'; bpm: number }

export interface ScoreDocument {
  id: string
  name: string
  ppq: number
  tempoMap: TempoEvent[]
  voices: Voice[]
  notes: NoteEvent[]     // sorted ascending by startSec
  durationSec: number
  sourceFormat: 'midi' | 'musicxml'
}
```

- [ ] **Step 4: Write the tempo map**

`src/model/tempoMap.ts`:

```ts
import type { TempoEvent, TempoSetting } from './types'

const DEFAULT_BPM = 120

/**
 * Builds the tick->second table at the FILE'S OWN tempi. A TempoSetting is
 * applied later, in ticksToSec/secToTicks, so changing tempo never rewrites
 * this table and never accumulates rounding error.
 */
export function buildTempoMap(
  changes: { ticks: number; bpm: number }[],
  ppq: number,
): TempoEvent[] {
  const sorted = [...changes].sort((a, b) => a.ticks - b.ticks)
  if (sorted.length === 0 || sorted[0].ticks !== 0) {
    sorted.unshift({ ticks: 0, bpm: DEFAULT_BPM })
  }
  const out: TempoEvent[] = []
  let sec = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1]
      sec += ((sorted[i].ticks - prev.ticks) / ppq) * (60 / prev.bpm)
    }
    out.push({ ticks: sorted[i].ticks, sec, bpm: sorted[i].bpm })
  }
  return out
}

function segmentAtTicks(map: TempoEvent[], ticks: number): TempoEvent {
  let i = map.length - 1
  while (i > 0 && map[i].ticks > ticks) i--
  return map[i]
}

function segmentAtSec(map: TempoEvent[], sec: number): TempoEvent {
  let i = map.length - 1
  while (i > 0 && map[i].sec > sec) i--
  return map[i]
}

export function ticksToSec(
  map: TempoEvent[], ppq: number, ticks: number, setting: TempoSetting,
): number {
  if (setting.mode === 'absolute') return (ticks / ppq) * (60 / setting.bpm)
  const e = segmentAtTicks(map, ticks)
  const base = e.sec + ((ticks - e.ticks) / ppq) * (60 / e.bpm)
  return base / setting.scale
}

export function secToTicks(
  map: TempoEvent[], ppq: number, sec: number, setting: TempoSetting,
): number {
  if (setting.mode === 'absolute') return (sec * setting.bpm / 60) * ppq
  const base = sec * setting.scale
  const e = segmentAtSec(map, base)
  return e.ticks + ((base - e.sec) * (e.bpm / 60)) * ppq
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/model/tempoMap.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/model
git commit -m "feat: note model types and tempo map with scale/absolute modes"
```

---

### Task 3: Keyboard geometry

**Files:**
- Create: `src/render/geometry.ts`
- Test: `src/render/geometry.test.ts`
- Reference: `tests/geometry-check.mjs` (already in the repo — port its assertions)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface KeyRect { pitch: number; black: boolean; x: number; w: number; h: number }`
  - `interface KeyboardLayout { keys: KeyRect[]; byPitch: Map<number, KeyRect>; whiteW: number; blackW: number; keyboardH: number; blackH: number; hitY: number }`
  - `computeLayout(stageW: number, stageH: number, opts?: Partial<GeometryOpts>): KeyboardLayout`
  - `const BLACK_OFFSET: Record<number, number>`
  - `pitchAt(layout: KeyboardLayout, x: number, y: number): number` — returns -1 for a miss

- [ ] **Step 1: Write the failing tests**

`src/render/geometry.test.ts`. This ports `tests/geometry-check.mjs`, whose oracle is 36 black-key centres measured from `docs/reference-sheetmusicboss.png`.

```ts
import { describe, it, expect } from 'vitest'
import { computeLayout, pitchAt } from './geometry'

const BLACK_PC = new Set([1, 3, 6, 8, 10])
const REF_W = 1220          // reference frame width; whiteW = 23.462

/** Offset of each black key centre from the white-key boundary, in px at REF_W.
 *  Measured from all 36 black keys in docs/reference-sheetmusicboss.png. */
const MEASURED: Record<number, number> = { 1: -2.08, 3: 1.96, 6: -3.53, 8: -0.07, 10: 3.42 }

function boundaries(whiteW: number): Record<number, number> {
  const out: Record<number, number> = {}
  let wi = 0
  for (let p = 21; p <= 108; p++) {
    if (BLACK_PC.has(p % 12)) out[p] = wi * whiteW
    else wi++
  }
  return out
}

describe('computeLayout', () => {
  it('produces 88 keys: 52 white and 36 black', () => {
    const l = computeLayout(REF_W, 600)
    expect(l.keys).toHaveLength(88)
    expect(l.keys.filter((k) => !k.black)).toHaveLength(52)
    expect(l.keys.filter((k) => k.black)).toHaveLength(36)
  })

  it('tiles white keys across the full width with no gap or overhang', () => {
    const l = computeLayout(REF_W, 600)
    const whites = l.keys.filter((k) => !k.black)
    expect(whites[0].x).toBeCloseTo(0, 9)
    expect(whites[51].x + whites[51].w).toBeCloseTo(REF_W, 9)
    for (let i = 1; i < whites.length; i++) {
      expect(whites[i].x).toBeCloseTo(whites[i - 1].x + whites[i - 1].w, 9)
    }
  })

  it('places black key centres to match the reference frame within 0.5px', () => {
    const l = computeLayout(REF_W, 600)
    const b = boundaries(l.whiteW)
    for (const k of l.keys.filter((k) => k.black)) {
      const centre = k.x + k.w / 2
      expect(Math.abs(centre - b[k.pitch] - MEASURED[k.pitch % 12])).toBeLessThan(0.5)
    }
  })

  it('puts G# alone exactly on the boundary', () => {
    const l = computeLayout(REF_W, 600)
    const b = boundaries(l.whiteW)
    for (const k of l.keys.filter((k) => k.black)) {
      const d = Math.abs(k.x + k.w / 2 - b[k.pitch])
      if (k.pitch % 12 === 8) expect(d).toBeCloseTo(0, 9)
      else expect(d).toBeGreaterThan(1)
    }
  })

  it('makes the white tails behind the black keys equal within each group', () => {
    const l = computeLayout(REF_W, 600)
    const at = (p: number) => l.byPitch.get(p)!
    const tails = (whites: number[], blacks: number[]) => {
      const edges = [at(whites[0]).x]
      for (const p of blacks) edges.push(at(p).x, at(p).x + at(p).w)
      const last = at(whites[whites.length - 1])
      edges.push(last.x + last.w)
      const out: number[] = []
      for (let i = 0; i < edges.length; i += 2) out.push(edges[i + 1] - edges[i])
      return out
    }
    for (const [w, b] of [[[60, 62, 64], [61, 63]], [[65, 67, 69, 71], [66, 68, 70]]]) {
      const ts = tails(w, b)
      for (const t of ts) expect(t).toBeCloseTo(ts[0], 6)
    }
  })

  it('derives keyboard height from key width at 5.8:1, honouring any ratio', () => {
    const l = computeLayout(REF_W, 600)
    expect(l.keyboardH / l.whiteW).toBeCloseTo(5.8, 9)
    for (const aspect of [4, 5.8, 6.15, 6.31, 8]) {
      const k = computeLayout(REF_W, 6000, { aspect })
      expect(k.keyboardH / k.whiteW).toBeCloseTo(aspect, 9)
    }
  })

  it('never lets the aspect move with viewport height (portrait regression)', () => {
    // The original defect: keyboardH = clamp(stageH*0.28, 46, 150) gave a passable
    // 6.68:1 in phone landscape but 19.50:1 in portrait, keys 2.5x too long.
    const viewports: [number, number][] = [[400, 800], [400, 2000], [850, 390], [1400, 800], [820, 1180]]
    for (const [w, h] of viewports) {
      const l = computeLayout(w, h)
      expect(l.keyboardH / l.whiteW).toBeCloseTo(5.8, 9)
    }
  })

  it('caps the keyboard at 55% of stage height only on a short window', () => {
    expect(computeLayout(1400, 800).keyboardH / computeLayout(1400, 800).whiteW).toBeCloseTo(5.8, 9)
    const squat = computeLayout(1400, 200)   // 5.8 would want 156px of 200
    expect(squat.keyboardH).toBeCloseTo(110, 9)
    expect(squat.keyboardH / squat.whiteW).toBeLessThan(5.8)
  })

  it('places the hit line at the top of the keyboard', () => {
    const l = computeLayout(1000, 600)
    expect(l.hitY).toBeCloseTo(600 - l.keyboardH, 9)
  })
})

describe('pitchAt', () => {
  it('returns -1 above the keyboard', () => {
    const l = computeLayout(1000, 600)
    expect(pitchAt(l, 500, 10)).toBe(-1)
  })

  it('hits the black key when the point is inside one', () => {
    const l = computeLayout(1000, 600)
    const cs = l.byPitch.get(61)!    // C#4
    expect(pitchAt(l, cs.x + cs.w / 2, l.hitY + 4)).toBe(61)
  })

  it('hits the white key below the black keys', () => {
    const l = computeLayout(1000, 600)
    const c = l.byPitch.get(60)!     // C4
    expect(pitchAt(l, c.x + 2, l.hitY + l.keyboardH - 4)).toBe(60)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/render/geometry.test.ts`
Expected: FAIL — `Failed to resolve import "./geometry"`.

- [ ] **Step 3: Write the geometry**

`src/render/geometry.ts`:

```ts
export interface KeyRect {
  pitch: number
  black: boolean
  x: number
  w: number
  h: number
}

export interface KeyboardLayout {
  keys: KeyRect[]
  byPitch: Map<number, KeyRect>
  whiteW: number
  blackW: number
  keyboardH: number
  blackH: number
  hitY: number
}

export interface GeometryOpts {
  aspect: number          // white key length : width
  blackWRatio: number     // black key width as a fraction of white
  blackLenRatio: number   // black key length as a fraction of keyboard height
  trueOffsets: boolean    // false reproduces the naive boundary-centred bug
}

export const FIRST_PITCH = 21
export const LAST_PITCH = 108
export const WHITE_KEY_COUNT = 52

const BLACK_PC = new Set([1, 3, 6, 8, 10])

/**
 * A piano is built so the white-key TAILS behind the black keys are equal width:
 * 3 equal tails across C-D-E, 4 across F-G-A-B. That construction reduces to a
 * fixed offset of each black key from the white-key boundary, in units of black
 * key width b -- independent of b itself. Corroborated three ways: derived from
 * the construction, measured off all 36 black keys in the reference frame (to
 * within 0.32px on a 23.5px key), and matching chordl's BLACK_KEY_OFFSETS.
 * DIN 8996 and BDO Normzeichnung 12 both give G# as exactly 0.
 */
export const BLACK_OFFSET: Record<number, number> = {
  1: -1 / 6,   // C#
  3: 1 / 6,    // D#
  6: -1 / 4,   // F#
  8: 0,        // G#  -- the only one on a boundary
  10: 1 / 4,   // A#
}

export const DEFAULT_GEOMETRY: GeometryOpts = {
  aspect: 5.8,
  blackWRatio: 0.5652,    // 13/23, matching chordl
  blackLenRatio: 0.655,   // JIS 95mm / DIN 145mm = 0.6552; reference measures 0.6554
  trueOffsets: true,
}

export function isBlackKey(pitch: number): boolean {
  return BLACK_PC.has(((pitch % 12) + 12) % 12)
}

export function computeLayout(
  stageW: number, stageH: number, opts: Partial<GeometryOpts> = {},
): KeyboardLayout {
  const o = { ...DEFAULT_GEOMETRY, ...opts }
  const whiteW = stageW / WHITE_KEY_COUNT
  const blackW = Math.max(3, whiteW * o.blackWRatio)
  // Height derives from key WIDTH, never from the viewport. Taking it from stage
  // height gave 19.5:1 in phone portrait. The cap only bites on short windows.
  const keyboardH = Math.min(whiteW * o.aspect, stageH * 0.55)
  const blackH = keyboardH * o.blackLenRatio
  const hitY = stageH - keyboardH

  const keys: KeyRect[] = []
  let wi = 0
  for (let p = FIRST_PITCH; p <= LAST_PITCH; p++) {
    if (isBlackKey(p)) {
      const off = o.trueOffsets ? BLACK_OFFSET[p % 12] * blackW : 0
      keys.push({ pitch: p, black: true, x: wi * whiteW + off - blackW / 2, w: blackW, h: blackH })
    } else {
      keys.push({ pitch: p, black: false, x: wi * whiteW, w: whiteW, h: keyboardH })
      wi++
    }
  }
  return {
    keys,
    byPitch: new Map(keys.map((k) => [k.pitch, k])),
    whiteW, blackW, keyboardH, blackH, hitY,
  }
}

/** Hit-test a point. Black keys are tested first because they sit on top. */
export function pitchAt(layout: KeyboardLayout, x: number, y: number): number {
  if (y < layout.hitY) return -1
  for (const k of layout.keys) {
    if (k.black && x >= k.x && x <= k.x + k.w && y <= layout.hitY + layout.blackH) return k.pitch
  }
  for (const k of layout.keys) {
    if (!k.black && x >= k.x && x < k.x + k.w) return k.pitch
  }
  return -1
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/render/geometry.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Confirm the standalone rig check still agrees**

Run: `node tests/geometry-check.mjs`
Expected: `all passed`. Both implementations are checked against the same measured oracle; if they disagree, the port is wrong.

- [ ] **Step 6: Commit**

```bash
git add src/render/geometry.ts src/render/geometry.test.ts
git commit -m "feat: true-scale 88-key geometry with equal-tails black key offsets"
```

---

### Task 4: Colour and flash intensity

**Files:**
- Create: `src/render/colors.ts`
- Test: `src/render/colors.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface ColorOpts { lMax: number; lMin: number; sat: number }`
  - `const DEFAULT_COLORS: ColorOpts` — `{ lMax: 78, lMin: 38, sat: 85 }`
  - `const VOICE_HUES: number[]` — `[207, 28]`
  - `velocityLightness(velocity: number, o: ColorOpts): number`
  - `noteColor(hue: number, velocity: number, o?: ColorOpts): string`
  - `flashIntensity(ageSec: number, velocity: number, flashMs?: number, floor?: number): number`
  - `const FLASH_MS: number` — `220`
  - `const INTENSITY_FLOOR: number` — `0.45`
  - `hueForVoiceIndex(i: number, total: number): number`

- [ ] **Step 1: Write the failing tests**

`src/render/colors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  velocityLightness, noteColor, flashIntensity,
  hueForVoiceIndex, DEFAULT_COLORS, FLASH_MS,
} from './colors'

describe('velocityLightness', () => {
  it('is lightest at the softest velocity and darkest at the hardest', () => {
    expect(velocityLightness(1, DEFAULT_COLORS)).toBeGreaterThan(70)
    expect(velocityLightness(127, DEFAULT_COLORS)).toBeCloseTo(38, 9)
  })

  it('decreases monotonically across the whole velocity range', () => {
    let prev = Infinity
    for (let v = 0; v <= 127; v++) {
      const l = velocityLightness(v, DEFAULT_COLORS)
      expect(l).toBeLessThanOrEqual(prev)
      prev = l
    }
  })

  it('stays inside the configured endpoints', () => {
    for (let v = 0; v <= 127; v++) {
      const l = velocityLightness(v, DEFAULT_COLORS)
      expect(l).toBeLessThanOrEqual(DEFAULT_COLORS.lMax)
      expect(l).toBeGreaterThanOrEqual(DEFAULT_COLORS.lMin)
    }
  })
})

describe('noteColor', () => {
  it('emits an hsl string carrying the voice hue', () => {
    expect(noteColor(207, 64)).toMatch(/^hsl\(207 85% [\d.]+%\)$/)
  })
})

describe('flashIntensity', () => {
  it('is zero before the note starts', () => {
    expect(flashIntensity(-0.01, 127)).toBe(0)
  })

  it('peaks at onset and reaches zero at FLASH_MS', () => {
    expect(flashIntensity(0, 127)).toBeCloseTo(1, 9)
    expect(flashIntensity(FLASH_MS / 1000, 127)).toBe(0)
    expect(flashIntensity(FLASH_MS / 1000 + 0.1, 127)).toBe(0)
  })

  it('decays monotonically and never goes negative', () => {
    let prev = Infinity
    for (let ms = 0; ms <= 400; ms += 5) {
      const i = flashIntensity(ms / 1000, 100)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThanOrEqual(prev + 1e-12)
      prev = i
    }
  })

  it('scales with velocity but keeps a floor so soft notes still flare', () => {
    expect(flashIntensity(0, 1)).toBeGreaterThan(0.4)
    expect(flashIntensity(0, 1)).toBeLessThan(flashIntensity(0, 127))
  })

  it('is a pure function of age, so scrubbing backwards is correct', () => {
    const a = flashIntensity(0.05, 90)
    flashIntensity(0.2, 90)          // advance
    expect(flashIntensity(0.05, 90)).toBe(a)   // and go back
  })
})

describe('hueForVoiceIndex', () => {
  it('uses the reference hues for the first two voices', () => {
    expect(hueForVoiceIndex(0, 2)).toBe(207)
    expect(hueForVoiceIndex(1, 2)).toBe(28)
  })

  it('spreads additional voices around the wheel without repeating', () => {
    const hues = Array.from({ length: 6 }, (_, i) => hueForVoiceIndex(i, 6))
    expect(new Set(hues).size).toBe(6)
    for (const h of hues) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(360) }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/render/colors.test.ts`
Expected: FAIL — `Failed to resolve import "./colors"`.

- [ ] **Step 3: Write the colour module**

`src/render/colors.ts`:

```ts
export interface ColorOpts { lMax: number; lMin: number; sat: number }

export const DEFAULT_COLORS: ColorOpts = { lMax: 78, lMin: 38, sat: 85 }

/** Left hand, right hand -- taken from the SheetMusicBoss reference frame. */
export const VOICE_HUES = [207, 28]

export const FLASH_MS = 220
export const INTENSITY_FLOOR = 0.45

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Soft notes light, hard notes dark. Monotonic by construction. */
export function velocityLightness(velocity: number, o: ColorOpts = DEFAULT_COLORS): number {
  const t = clamp(velocity, 0, 127) / 127
  return o.lMax + (o.lMin - o.lMax) * t
}

export function noteColor(hue: number, velocity: number, o: ColorOpts = DEFAULT_COLORS): string {
  return `hsl(${hue} ${o.sat}% ${velocityLightness(velocity, o).toFixed(1)}%)`
}

/**
 * Impact flash intensity. A PURE FUNCTION OF AGE -- nothing is spawned, stored
 * or ticked, so scrubbing backwards, pausing mid-flash and changing tempo all
 * produce exactly the right state with no particle pool to reset.
 */
export function flashIntensity(
  ageSec: number, velocity: number,
  flashMs: number = FLASH_MS, floor: number = INTENSITY_FLOOR,
): number {
  if (ageSec < 0) return 0
  const a = 1 - ageSec / (flashMs / 1000)
  if (a <= 0) return 0
  return a * a * (floor + (1 - floor) * (clamp(velocity, 0, 127) / 127))
}

/** First two voices take the reference hues; the rest spread around the wheel. */
export function hueForVoiceIndex(i: number, total: number): number {
  if (i < VOICE_HUES.length) return VOICE_HUES[i]
  return Math.round((207 + (i * 360) / Math.max(total, 1)) % 360)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/render/colors.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/colors.ts src/render/colors.test.ts
git commit -m "feat: velocity colour ramp and pure-function flash intensity"
```

---

### Task 5: MIDI parsing and hand split

**Files:**
- Create: `src/io/parseMidi.ts`, `src/io/handSplit.ts`, `src/io/hashFile.ts`
- Test: `src/io/parseMidi.test.ts`, `src/io/handSplit.test.ts`

**Interfaces:**
- Consumes: `ScoreDocument`, `NoteEvent`, `Voice`, `TempoSetting` (Task 2); `buildTempoMap`, `ticksToSec` (Task 2); `hueForVoiceIndex` (Task 4)
- Produces:
  - `parseMidi(bytes: ArrayBuffer, name: string, setting: TempoSetting): ScoreDocument`
  - `retimeScore(score: ScoreDocument, setting: TempoSetting): ScoreDocument` — recomputes every `startSec`/`endSec`; returns a new object
  - `splitHands(notes: NoteEvent[], splitPitch: number): { voiceId: string }[]` — mutates nothing, returns per-note voice assignment
  - `hashFile(bytes: ArrayBuffer): Promise<string>`

- [ ] **Step 1: Write the failing tests**

`src/io/handSplit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { splitHands, LEFT_VOICE, RIGHT_VOICE, DEFAULT_SPLIT_PITCH } from './handSplit'
import type { NoteEvent } from '../model/types'

const note = (pitch: number): NoteEvent => ({
  id: pitch, pitch, startTicks: 0, durTicks: 480,
  startSec: 0, endSec: 0.5, velocity: 100, voiceId: 't0',
})

describe('splitHands', () => {
  it('sends notes below the split point to the left hand', () => {
    expect(splitHands([note(40)], DEFAULT_SPLIT_PITCH)[0].voiceId).toBe(LEFT_VOICE)
  })

  it('sends notes at and above the split point to the right hand', () => {
    expect(splitHands([note(60)], DEFAULT_SPLIT_PITCH)[0].voiceId).toBe(RIGHT_VOICE)
    expect(splitHands([note(84)], DEFAULT_SPLIT_PITCH)[0].voiceId).toBe(RIGHT_VOICE)
  })

  it('defaults the split point to middle C', () => {
    expect(DEFAULT_SPLIT_PITCH).toBe(60)
  })

  it('honours a moved split point', () => {
    expect(splitHands([note(60)], 72)[0].voiceId).toBe(LEFT_VOICE)
    expect(splitHands([note(72)], 72)[0].voiceId).toBe(RIGHT_VOICE)
  })

  it('returns one assignment per note, in order', () => {
    const out = splitHands([note(30), note(90), note(55)], DEFAULT_SPLIT_PITCH)
    expect(out.map((a) => a.voiceId)).toEqual([LEFT_VOICE, RIGHT_VOICE, LEFT_VOICE])
  })
})
```

`src/io/parseMidi.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Midi } from '@tonejs/midi'
import { parseMidi, retimeScore } from './parseMidi'
import { LEFT_VOICE, RIGHT_VOICE } from './handSplit'
import type { TempoSetting } from '../model/types'

const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }

/** Build a MIDI file in memory so the test needs no fixture on disk. */
function makeMidi(tracks: { name: string; notes: [number, number, number][] }[]): ArrayBuffer {
  const midi = new Midi()
  midi.header.setTempo(120)
  for (const t of tracks) {
    const track = midi.addTrack()
    track.name = t.name
    for (const [pitch, time, dur] of t.notes) {
      track.addNote({ midi: pitch, time, duration: dur, velocity: 0.8 })
    }
  }
  return midi.toArray().buffer as ArrayBuffer
}

describe('parseMidi', () => {
  it('reads notes with pitch, timing and velocity', () => {
    const s = parseMidi(makeMidi([{ name: 'Piano', notes: [[60, 0, 0.5]] }]), 'a.mid', SCALE_1)
    expect(s.notes).toHaveLength(1)
    expect(s.notes[0].pitch).toBe(60)
    expect(s.notes[0].startSec).toBeCloseTo(0, 3)
    expect(s.notes[0].endSec).toBeCloseTo(0.5, 2)
    expect(s.notes[0].velocity).toBeGreaterThan(90)
  })

  it('returns notes sorted by startSec', () => {
    const s = parseMidi(makeMidi([
      { name: 'P', notes: [[72, 1, 0.2], [60, 0, 0.2], [64, 0.5, 0.2]] },
    ]), 'a.mid', SCALE_1)
    const starts = s.notes.map((n) => n.startSec)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  it('makes one voice per track when the file has several', () => {
    const s = parseMidi(makeMidi([
      { name: 'Right', notes: [[72, 0, 1]] },
      { name: 'Left', notes: [[40, 0, 1]] },
    ]), 'a.mid', SCALE_1)
    expect(s.voices).toHaveLength(2)
    expect(s.voices.map((v) => v.label)).toEqual(['Right', 'Left'])
    expect(new Set(s.notes.map((n) => n.voiceId)).size).toBe(2)
  })

  it('hand-splits a single-track file into left and right voices', () => {
    const s = parseMidi(makeMidi([
      { name: 'Piano', notes: [[40, 0, 1], [72, 0, 1]] },
    ]), 'a.mid', SCALE_1)
    expect(s.voices.map((v) => v.id).sort()).toEqual([LEFT_VOICE, RIGHT_VOICE].sort())
    expect(s.notes.find((n) => n.pitch === 40)!.voiceId).toBe(LEFT_VOICE)
    expect(s.notes.find((n) => n.pitch === 72)!.voiceId).toBe(RIGHT_VOICE)
  })

  it('assigns distinct hues to the voices', () => {
    const s = parseMidi(makeMidi([
      { name: 'R', notes: [[72, 0, 1]] }, { name: 'L', notes: [[40, 0, 1]] },
    ]), 'a.mid', SCALE_1)
    expect(s.voices[0].hue).not.toBe(s.voices[1].hue)
  })

  it('reports a duration covering the last note', () => {
    const s = parseMidi(makeMidi([{ name: 'P', notes: [[60, 0, 0.5], [62, 2, 1]] }]), 'a.mid', SCALE_1)
    expect(s.durationSec).toBeGreaterThanOrEqual(3)
  })

  it('drops empty tracks rather than creating colourless voices', () => {
    const midi = new Midi()
    midi.header.setTempo(120)
    midi.addTrack().name = 'Empty'
    const t = midi.addTrack(); t.name = 'Real'
    t.addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
    const s = parseMidi(midi.toArray().buffer as ArrayBuffer, 'a.mid', SCALE_1)
    expect(s.voices).toHaveLength(1)
    expect(s.voices[0].label).toBe('Real')
  })
})

describe('retimeScore', () => {
  it('halves every note time at scale 2 without touching ticks', () => {
    const s = parseMidi(makeMidi([{ name: 'P', notes: [[60, 2, 1]] }]), 'a.mid', SCALE_1)
    const fast = retimeScore(s, { mode: 'scale', scale: 2 })
    expect(fast.notes[0].startSec).toBeCloseTo(s.notes[0].startSec / 2, 6)
    expect(fast.notes[0].startTicks).toBe(s.notes[0].startTicks)
  })

  it('keeps the note array sorted after retiming', () => {
    const s = parseMidi(makeMidi([{ name: 'P', notes: [[60, 0, 1], [62, 1, 1], [64, 2, 1]] }]), 'a.mid', SCALE_1)
    const out = retimeScore(s, { mode: 'absolute', bpm: 200 }).notes.map((n) => n.startSec)
    expect([...out].sort((a, b) => a - b)).toEqual(out)
  })

  it('does not mutate the original score', () => {
    const s = parseMidi(makeMidi([{ name: 'P', notes: [[60, 2, 1]] }]), 'a.mid', SCALE_1)
    const before = s.notes[0].startSec
    retimeScore(s, { mode: 'scale', scale: 4 })
    expect(s.notes[0].startSec).toBe(before)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/io/`
Expected: FAIL — unresolved imports for `./handSplit` and `./parseMidi`.

- [ ] **Step 3: Write the hand split**

`src/io/handSplit.ts`:

```ts
import type { NoteEvent } from '../model/types'

export const LEFT_VOICE = 'hand-left'
export const RIGHT_VOICE = 'hand-right'
export const DEFAULT_SPLIT_PITCH = 60   // middle C

/**
 * Most piano MIDI puts both hands in one track. Split at a movable pitch;
 * notes at or above the split point are the right hand.
 */
export function splitHands(notes: NoteEvent[], splitPitch: number): { voiceId: string }[] {
  return notes.map((n) => ({ voiceId: n.pitch >= splitPitch ? RIGHT_VOICE : LEFT_VOICE }))
}
```

- [ ] **Step 4: Write the parser**

`src/io/parseMidi.ts`:

```ts
import { Midi } from '@tonejs/midi'
import { buildTempoMap, ticksToSec } from '../model/tempoMap'
import { hueForVoiceIndex } from '../render/colors'
import { DEFAULT_SPLIT_PITCH, LEFT_VOICE, RIGHT_VOICE, splitHands } from './handSplit'
import type { NoteEvent, ScoreDocument, TempoSetting, Voice } from '../model/types'

const DEFAULT_INSTRUMENT = 'acoustic_grand_piano'

function makeVoice(id: string, label: string, index: number, total: number): Voice {
  return {
    id, label,
    hue: hueForVoiceIndex(index, total),
    instrument: DEFAULT_INSTRUMENT,
    visible: true, audible: true, volume: 1,
  }
}

export function parseMidi(
  bytes: ArrayBuffer, name: string, setting: TempoSetting,
): ScoreDocument {
  const midi = new Midi(bytes)
  const ppq = midi.header.ppq
  const tempoMap = buildTempoMap(
    midi.header.tempos.map((t) => ({ ticks: t.ticks, bpm: t.bpm })), ppq,
  )

  const played = midi.tracks.filter((t) => t.notes.length > 0)
  const notes: NoteEvent[] = []
  let voices: Voice[] = []
  let id = 0

  if (played.length === 1) {
    // One track: split into two hands so the roll is legible.
    voices = [
      makeVoice(LEFT_VOICE, 'Left hand', 0, 2),
      makeVoice(RIGHT_VOICE, 'Right hand', 1, 2),
    ]
    const raw = played[0].notes.map((n) => ({
      id: id++, pitch: n.midi, startTicks: n.ticks, durTicks: n.durationTicks,
      startSec: 0, endSec: 0, velocity: Math.round(n.velocity * 127), voiceId: LEFT_VOICE,
    }))
    const assign = splitHands(raw, DEFAULT_SPLIT_PITCH)
    raw.forEach((n, i) => { n.voiceId = assign[i].voiceId })
    notes.push(...raw)
  } else {
    voices = played.map((t, i) =>
      makeVoice(`track-${i}`, t.name?.trim() || `Track ${i + 1}`, i, played.length))
    played.forEach((t, i) => {
      for (const n of t.notes) {
        notes.push({
          id: id++, pitch: n.midi, startTicks: n.ticks, durTicks: n.durationTicks,
          startSec: 0, endSec: 0, velocity: Math.round(n.velocity * 127),
          voiceId: `track-${i}`,
        })
      }
    })
  }

  const score: ScoreDocument = {
    id: '', name, ppq, tempoMap, voices, notes, durationSec: 0, sourceFormat: 'midi',
  }
  return retimeScore(score, setting)
}

/**
 * Recomputes seconds from ticks under a new tempo setting. Ticks are the truth;
 * seconds are always derived, so tempo can be changed repeatedly without the
 * score degrading. Returns a new object -- callers rely on immutability.
 */
export function retimeScore(score: ScoreDocument, setting: TempoSetting): ScoreDocument {
  const notes = score.notes.map((n) => ({
    ...n,
    startSec: ticksToSec(score.tempoMap, score.ppq, n.startTicks, setting),
    endSec: ticksToSec(score.tempoMap, score.ppq, n.startTicks + n.durTicks, setting),
  }))
  notes.sort((a, b) => a.startSec - b.startSec)
  const durationSec = notes.reduce((m, n) => Math.max(m, n.endSec), 0)
  return { ...score, notes, durationSec }
}
```

`src/io/hashFile.ts`:

```ts
/** Content hash of a loaded file. Used in plan 2 as the per-song profile key. */
export async function hashFile(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/io/`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add src/io
git commit -m "feat: MIDI parsing, hand split, and tempo-setting retiming"
```

---

### Task 6: Lookahead scheduler

**Files:**
- Create: `src/audio/scheduler.ts`
- Test: `src/audio/scheduler.test.ts`

**Interfaces:**
- Consumes: `NoteEvent` (Task 2)
- Produces:
  - `interface ScheduledNote { note: NoteEvent; atSec: number }`
  - `class Scheduler` with `seek(playheadSec: number): void`, `collect(playheadSec: number): ScheduledNote[]`
  - `const LOOKAHEAD_SEC: number` — `0.15`
  - `const TICK_MS: number` — `25`

The scheduler holds only a cursor index. It never touches an AudioContext, so it tests with plain numbers.

- [ ] **Step 1: Write the failing tests**

`src/audio/scheduler.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Scheduler, LOOKAHEAD_SEC } from './scheduler'
import type { NoteEvent } from '../model/types'

const n = (id: number, startSec: number): NoteEvent => ({
  id, pitch: 60 + id, startTicks: 0, durTicks: 480,
  startSec, endSec: startSec + 0.4, velocity: 100, voiceId: 'v',
})

const NOTES = [n(0, 0), n(1, 0.1), n(2, 0.5), n(3, 1.0), n(4, 5.0)]

describe('Scheduler', () => {
  it('collects only notes inside the lookahead window', () => {
    const s = new Scheduler(NOTES)
    const got = s.collect(0)
    expect(got.map((g) => g.note.id)).toEqual([0, 1])   // 0 and 0.1 are within 0.15s
  })

  it('never schedules the same note twice', () => {
    const s = new Scheduler(NOTES)
    const seen: number[] = []
    for (let t = 0; t <= 6; t += LOOKAHEAD_SEC / 2) {
      for (const g of s.collect(t)) seen.push(g.note.id)
    }
    expect(seen).toEqual([...new Set(seen)])
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('reports the absolute time each note should sound', () => {
    const s = new Scheduler(NOTES)
    expect(s.collect(0)[0].atSec).toBeCloseTo(0, 9)
    const later = new Scheduler(NOTES)
    later.seek(0.45)
    expect(later.collect(0.45)[0].note.id).toBe(2)
    expect(later.collect(0.45).length).toBe(0)   // already consumed
  })

  it('re-seats the cursor on seek, forwards and backwards', () => {
    const s = new Scheduler(NOTES)
    s.collect(0); s.collect(1.0)
    s.seek(0)
    expect(s.collect(0).map((g) => g.note.id)).toEqual([0, 1])
  })

  it('skips notes already passed when seeking forward', () => {
    const s = new Scheduler(NOTES)
    s.seek(4.9)
    expect(s.collect(4.9).map((g) => g.note.id)).toEqual([])
    expect(s.collect(5.0).map((g) => g.note.id)).toEqual([4])
  })

  it('handles an empty score without throwing', () => {
    const s = new Scheduler([])
    expect(s.collect(0)).toEqual([])
    s.seek(10)
    expect(s.collect(10)).toEqual([])
  })

  it('tolerates a playhead beyond the end of the score', () => {
    const s = new Scheduler(NOTES)
    expect(s.collect(999)).toHaveLength(5)
    expect(s.collect(1000)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/audio/scheduler.test.ts`
Expected: FAIL — `Failed to resolve import "./scheduler"`.

- [ ] **Step 3: Write the scheduler**

`src/audio/scheduler.ts`:

```ts
import type { NoteEvent } from '../model/types'

export const LOOKAHEAD_SEC = 0.15
export const TICK_MS = 25

export interface ScheduledNote { note: NoteEvent; atSec: number }

/**
 * Walks a time-sorted note array and hands back everything starting within the
 * next LOOKAHEAD_SEC. Holds only a cursor index -- no audio, no timers -- so it
 * is driven by a plain number in tests and by AudioContext.currentTime in the app.
 */
export class Scheduler {
  private cursor = 0

  constructor(private notes: NoteEvent[]) {}

  /** Re-seat the cursor after a seek. Works in both directions. */
  seek(playheadSec: number): void {
    let lo = 0, hi = this.notes.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.notes[mid].startSec < playheadSec) lo = mid + 1
      else hi = mid
    }
    this.cursor = lo
  }

  /** Everything due before playheadSec + LOOKAHEAD_SEC, each returned once. */
  collect(playheadSec: number): ScheduledNote[] {
    const horizon = playheadSec + LOOKAHEAD_SEC
    const out: ScheduledNote[] = []
    while (this.cursor < this.notes.length && this.notes[this.cursor].startSec < horizon) {
      const note = this.notes[this.cursor++]
      out.push({ note, atSec: note.startSec })
    }
    return out
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/audio/scheduler.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/audio/scheduler.ts src/audio/scheduler.test.ts
git commit -m "feat: lookahead scheduler with injectable clock"
```

---

### Task 7: Audio engine

**Files:**
- Create: `src/audio/engine.ts`

**Interfaces:**
- Consumes: `Voice` (Task 2), `ScheduledNote` (Task 6)
- Produces:
  - `class AudioEngine` with:
    - `get currentTime(): number`
    - `resume(): Promise<void>`
    - `loadInstrument(id: string): Promise<void>`
    - `play(s: ScheduledNote, voice: Voice, originSec: number): void`
    - `stopAll(): void`
    - `get ready(): boolean`

No unit test: this wraps browser audio APIs that jsdom does not implement. It is exercised in Task 10's integration check. Keep it thin so there is little to get wrong.

- [ ] **Step 1: Write the engine**

`src/audio/engine.ts`:

```ts
import { SplendidGrandPiano, Soundfont } from 'smplr'
import type { Voice } from '../model/types'
import type { ScheduledNote } from './scheduler'

type Instrument = { start: (o: Record<string, unknown>) => void; stop: () => void }

/**
 * Owns the AudioContext and a cache of smplr instruments. AudioContext.currentTime
 * is the app's single clock; everything visible derives from it.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private instruments = new Map<string, Instrument>()
  private loading = new Map<string, Promise<void>>()

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  get currentTime(): number { return this.context().currentTime }

  get ready(): boolean { return this.instruments.size > 0 }

  /** Browsers require a user gesture before audio will sound. */
  async resume(): Promise<void> {
    const ctx = this.context()
    if (ctx.state === 'suspended') await ctx.resume()
  }

  async loadInstrument(id: string): Promise<void> {
    if (this.instruments.has(id)) return
    const existing = this.loading.get(id)
    if (existing) return existing

    const task = (async () => {
      const ctx = this.context()
      const inst = id === 'acoustic_grand_piano'
        ? new SplendidGrandPiano(ctx)
        : new Soundfont(ctx, { instrument: id })
      await inst.load
      this.instruments.set(id, inst as unknown as Instrument)
    })().catch(async () => {
      // Retry once, then fall back to the grand piano so a missing soundfont
      // never blocks playback or the visuals.
      try {
        const inst = new SplendidGrandPiano(this.context())
        await inst.load
        this.instruments.set(id, inst as unknown as Instrument)
      } catch {
        /* leave it unloaded; play() becomes a no-op for this instrument */
      }
    }).finally(() => { this.loading.delete(id) })

    this.loading.set(id, task)
    return task
  }

  /**
   * Schedules one note at an exact AudioContext time. originSec is the context
   * time corresponding to playhead zero, so atSec (a score time) becomes an
   * absolute context time.
   */
  play(s: ScheduledNote, voice: Voice, originSec: number): void {
    if (!voice.audible) return
    const inst = this.instruments.get(voice.instrument)
    if (!inst) return
    const when = originSec + s.atSec
    inst.start({
      note: s.note.pitch,
      time: Math.max(when, this.currentTime),
      duration: Math.max(0.02, s.note.endSec - s.note.startSec),
      velocity: s.note.velocity,
      gain: voice.volume,
    })
  }

  stopAll(): void {
    for (const inst of this.instruments.values()) {
      try { inst.stop() } catch { /* smplr throws if nothing is sounding */ }
    }
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. If smplr's exported names differ in the installed version, run `node -e "console.log(Object.keys(require('smplr')))"` and use the actual class names — do not stub them out.

- [ ] **Step 3: Commit**

```bash
git add src/audio/engine.ts
git commit -m "feat: smplr audio engine with instrument cache and fallback"
```

---

### Task 8: Canvas renderers

**Files:**
- Create: `src/render/keyboard.ts`, `src/render/pianoRoll.ts`
- Test: `src/render/pianoRoll.test.ts`

**Interfaces:**
- Consumes: `KeyboardLayout` (Task 3), `noteColor`/`flashIntensity` (Task 4), `NoteEvent`/`Voice` (Task 2)
- Produces:
  - `interface RenderState { notes: NoteEvent[]; voices: Map<string, Voice>; layout: KeyboardLayout; fallSeconds: number; showGrid: boolean; showFlash: boolean }`
  - `visibleNotes(notes: NoteEvent[], t: number, fallSeconds: number): NoteEvent[]`
  - `heldNotes(visible: NoteEvent[], t: number): Map<number, NoteEvent>`
  - `drawKeyboard(ctx: CanvasRenderingContext2D, layout: KeyboardLayout, voices: Map<string, Voice>, held: Map<number, NoteEvent>): void`
  - `drawRoll(ctx: CanvasRenderingContext2D, state: RenderState, t: number): void`
  - `drawStage(ctx: CanvasRenderingContext2D, state: RenderState, t: number, progress: number): void`

- [ ] **Step 1: Write the failing tests**

`src/render/pianoRoll.test.ts`. The windowing functions are pure, so they test directly; the draw functions are smoke-tested against a recording stub.

```ts
import { describe, it, expect } from 'vitest'
import { visibleNotes, heldNotes, drawStage } from './pianoRoll'
import { computeLayout } from './geometry'
import type { NoteEvent, Voice } from '../model/types'

const n = (id: number, pitch: number, startSec: number, dur = 0.4): NoteEvent => ({
  id, pitch, startTicks: 0, durTicks: 480,
  startSec, endSec: startSec + dur, velocity: 100, voiceId: 'v',
})

describe('visibleNotes', () => {
  const notes = [n(0, 60, 0), n(1, 62, 1), n(2, 64, 2), n(3, 66, 10), n(4, 68, 100)]

  it('includes notes inside the fall window', () => {
    expect(visibleNotes(notes, 0, 3).map((x) => x.id)).toEqual([0, 1, 2])
  })

  it('excludes notes beyond the window', () => {
    expect(visibleNotes(notes, 0, 3).some((x) => x.id === 3)).toBe(false)
  })

  it('still includes a note that has started but not finished', () => {
    expect(visibleNotes(notes, 0.2, 3).map((x) => x.id)).toContain(0)
  })

  it('drops notes whose flash has fully decayed', () => {
    expect(visibleNotes(notes, 5, 3).map((x) => x.id)).toEqual([])
  })

  it('costs the same for a dense score as a sparse one (windowed, not scanned)', () => {
    const dense: NoteEvent[] = []
    for (let i = 0; i < 20000; i++) dense.push(n(i, 21 + (i % 88), i * 0.01))
    const got = visibleNotes(dense, 100, 3)
    expect(got.length).toBeLessThan(400)          // only ~3s worth, not 20000
    expect(got[0].startSec).toBeGreaterThan(99)
  })
})

describe('heldNotes', () => {
  it('reports notes sounding at t, keyed by pitch', () => {
    const vis = [n(0, 60, 0, 1), n(1, 64, 0.5, 1)]
    const held = heldNotes(vis, 0.6)
    expect([...held.keys()].sort()).toEqual([60, 64])
  })

  it('excludes notes that have ended', () => {
    expect(heldNotes([n(0, 60, 0, 0.2)], 0.5).size).toBe(0)
  })

  it('excludes notes that have not started', () => {
    expect(heldNotes([n(0, 60, 1, 0.2)], 0.5).size).toBe(0)
  })

  it('keeps the loudest when two notes share a pitch', () => {
    const a = { ...n(0, 60, 0, 1), velocity: 40 }
    const b = { ...n(1, 60, 0, 1), velocity: 120 }
    expect(heldNotes([a, b], 0.5).get(60)!.velocity).toBe(120)
  })
})

describe('drawStage', () => {
  /** Records calls so we can assert what was drawn without a real canvas. */
  function stubCtx() {
    const calls: string[] = []
    const rec = (name: string) => (...args: unknown[]) => { calls.push(`${name}(${args.length})`) }
    return {
      calls,
      ctx: new Proxy({} as CanvasRenderingContext2D, {
        get(_t, prop: string) {
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => ({ addColorStop() {} })
          }
          if (prop === 'canvas') return { width: 1000, height: 600 }
          if (typeof prop === 'string' && prop.startsWith('global')) return 'source-over'
          return rec(prop)
        },
        set() { return true },
      }),
    }
  }

  const state = (notes: NoteEvent[]) => ({
    notes,
    voices: new Map<string, Voice>([['v', {
      id: 'v', label: 'V', hue: 207, instrument: 'acoustic_grand_piano',
      visible: true, audible: true, volume: 1,
    }]]),
    layout: computeLayout(1000, 600),
    fallSeconds: 3,
    showGrid: true,
    showFlash: true,
  })

  it('draws without throwing on an empty score', () => {
    const { ctx } = stubCtx()
    expect(() => drawStage(ctx, state([]), 0, 0)).not.toThrow()
  })

  it('draws more when notes are on screen than when none are', () => {
    const empty = stubCtx()
    drawStage(empty.ctx, state([]), 50, 0)
    const full = stubCtx()
    drawStage(full.ctx, state([n(0, 60, 0), n(1, 64, 0.5), n(2, 67, 1)]), 0, 0)
    expect(full.calls.length).toBeGreaterThan(empty.calls.length)
  })

  it('skips notes belonging to a hidden voice', () => {
    const hidden = state([n(0, 60, 0)])
    hidden.voices.get('v')!.visible = false
    const a = stubCtx(); drawStage(a.ctx, hidden, 0, 0)
    const b = stubCtx(); drawStage(b.ctx, state([n(0, 60, 0)]), 0, 0)
    expect(a.calls.length).toBeLessThan(b.calls.length)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/render/pianoRoll.test.ts`
Expected: FAIL — `Failed to resolve import "./pianoRoll"`.

- [ ] **Step 3: Write the keyboard renderer**

`src/render/keyboard.ts`:

```ts
import { noteColor } from './colors'
import type { KeyboardLayout } from './geometry'
import type { NoteEvent, Voice } from '../model/types'

const WHITE_FILL = '#f6f2e4'
const BLACK_FILL = '#0c0c10'
const MIDDLE_C = 60

export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  voices: Map<string, Voice>,
  held: Map<number, NoteEvent>,
): void {
  const { hitY, keyboardH, blackH } = layout

  for (const k of layout.keys) {
    if (k.black) continue
    const h = held.get(k.pitch)
    const v = h ? voices.get(h.voiceId) : undefined
    ctx.fillStyle = h && v ? noteColor(v.hue, h.velocity) : WHITE_FILL
    ctx.fillRect(k.x, hitY, k.w - 1, keyboardH)

    // Middle C carries a dark border so orientation survives phone scale,
    // where 88 keys means ~16px per white key.
    if (k.pitch === MIDDLE_C) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(k.x, hitY, 1.5, keyboardH)
      ctx.fillRect(k.x + k.w - 2.5, hitY, 1.5, keyboardH)
    }
  }

  for (const k of layout.keys) {
    if (!k.black) continue
    const h = held.get(k.pitch)
    const v = h ? voices.get(h.voiceId) : undefined
    ctx.fillStyle = h && v ? noteColor(v.hue, h.velocity) : BLACK_FILL
    ctx.fillRect(k.x, hitY, k.w, blackH)
    if (h) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(k.x, hitY, k.w, 2)
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.fillRect(0, hitY, layout.whiteW * 52, 1)
}
```

- [ ] **Step 4: Write the roll renderer**

`src/render/pianoRoll.ts`:

```ts
import { drawKeyboard } from './keyboard'
import { FLASH_MS, flashIntensity, noteColor } from './colors'
import type { KeyboardLayout } from './geometry'
import type { NoteEvent, Voice } from '../model/types'

export interface RenderState {
  notes: NoteEvent[]           // sorted by startSec
  voices: Map<string, Voice>
  layout: KeyboardLayout
  fallSeconds: number
  showGrid: boolean
  showFlash: boolean
}

const BAR_RADIUS = 4
const MAX_NOTE_DUR = 8         // search back this far for still-sounding notes
const FLASH_TAIL = FLASH_MS / 1000

function lowerBound(notes: NoteEvent[], startSec: number): number {
  let lo = 0, hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (notes[mid].startSec < startSec) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Binary-searches the sorted array for the visible slice. Cost scales with notes
 * ON SCREEN, not notes in the file -- a 20k-note score draws no slower than a
 * 200-note one.
 */
export function visibleNotes(notes: NoteEvent[], t: number, fallSeconds: number): NoteEvent[] {
  const out: NoteEvent[] = []
  for (let i = lowerBound(notes, t - MAX_NOTE_DUR); i < notes.length; i++) {
    const n = notes[i]
    if (n.startSec > t + fallSeconds) break
    if (n.endSec >= t - FLASH_TAIL) out.push(n)
  }
  return out
}

/** Which pitches are sounding at t. Derived each frame; never stored. */
export function heldNotes(visible: NoteEvent[], t: number): Map<number, NoteEvent> {
  const held = new Map<number, NoteEvent>()
  for (const n of visible) {
    if (n.startSec <= t && t < n.endSec) {
      const prev = held.get(n.pitch)
      if (!prev || n.velocity > prev.velocity) held.set(n.pitch, n)
    }
  }
  return held
}

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 3, Math.abs(h) / 2))
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fill()
  } else {
    ctx.fillRect(x, y, w, h)
  }
}

export function drawRoll(ctx: CanvasRenderingContext2D, state: RenderState, t: number): void {
  const { layout, voices, fallSeconds } = state
  const pps = layout.hitY / fallSeconds
  const stageH = layout.hitY + layout.keyboardH
  const vis = visibleNotes(state.notes, t, fallSeconds)

  // White-key bars first, then black-key bars on top, so accidentals are never
  // hidden behind the naturals beside them.
  for (let pass = 0; pass < 2; pass++) {
    for (const n of vis) {
      const k = layout.byPitch.get(n.pitch)
      const v = voices.get(n.voiceId)
      if (!k || !v || !v.visible) continue
      if ((k.black ? 0 : 1) === pass) continue

      // A bar does not stop at the hit line: while held it continues down over
      // the key, so bar and lit key read as one object.
      const bottom = Math.min(layout.hitY + (t - n.startSec) * pps, stageH)
      const top = layout.hitY + (t - n.endSec) * pps
      if (bottom <= 0) continue
      const h = Math.max(1, bottom - top)

      const g = ctx.createLinearGradient(0, top, 0, top + h)
      g.addColorStop(0, noteColor(v.hue, Math.max(1, n.velocity - 14)))
      g.addColorStop(1, noteColor(v.hue, n.velocity))
      ctx.fillStyle = g
      roundRect(ctx, k.x + (k.black ? 0.5 : 1), top, k.w - (k.black ? 1 : 2), h, BAR_RADIUS)
    }
  }
}

function drawImpact(ctx: CanvasRenderingContext2D, state: RenderState, t: number): void {
  const { layout, voices } = state
  const vis = visibleNotes(state.notes, t, state.fallSeconds)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const n of vis) {
    const v = voices.get(n.voiceId)
    if (!v || !v.visible) continue
    const i = flashIntensity(t - n.startSec, n.velocity)
    if (i <= 0.003) continue
    const k = layout.byPitch.get(n.pitch)
    if (!k) continue

    const cx = k.x + k.w / 2
    const cy = layout.hitY
    const R = Math.max(2, 2.2 * layout.whiteW * i)

    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
    rg.addColorStop(0, `rgba(255,255,255,${(0.9 * i).toFixed(3)})`)
    rg.addColorStop(0.35, `rgba(255,242,214,${(0.34 * i).toFixed(3)})`)
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = rg
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()

    const bg = ctx.createLinearGradient(0, cy - 26, 0, cy + 20)
    bg.addColorStop(0, 'rgba(255,255,255,0)')
    bg.addColorStop(0.5, `rgba(255,255,255,${(0.85 * i).toFixed(3)})`)
    bg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = bg
    ctx.fillRect(cx - k.w * 0.45, cy - 26, k.w * 0.9, 46)

    const len = 1.6 * layout.whiteW * i
    ctx.strokeStyle = `rgba(255,255,255,${(0.7 * i).toFixed(3)})`
    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let s = 0; s < 5; s++) {
      const ang = ((-50 + 100 * (s / 4)) * Math.PI) / 180
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** The whole frame, in spec draw order. Pure function of t. */
export function drawStage(
  ctx: CanvasRenderingContext2D, state: RenderState, t: number, progress: number,
): void {
  const { layout } = state
  const stageW = layout.whiteW * 52
  const stageH = layout.hitY + layout.keyboardH

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, stageW, stageH)

  if (state.showGrid) {
    for (let p = 24; p <= 108; p += 12) {
      const k = layout.byPitch.get(p)
      if (!k) continue
      ctx.fillStyle = p === 60 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'
      ctx.fillRect(k.x, 0, 1, layout.hitY)
    }
  }

  drawRoll(ctx, state, t)

  const vis = visibleNotes(state.notes, t, state.fallSeconds)
  const held = heldNotes(
    vis.filter((n) => state.voices.get(n.voiceId)?.visible !== false), t,
  )
  drawKeyboard(ctx, layout, state.voices, held)

  if (state.showFlash) drawImpact(ctx, state, t)

  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(0, stageH - 3, stageW, 3)
  ctx.fillStyle = '#e8384f'
  ctx.fillRect(0, stageH - 3, stageW * Math.min(1, Math.max(0, progress)), 3)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/render/pianoRoll.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add src/render/keyboard.ts src/render/pianoRoll.ts src/render/pianoRoll.test.ts
git commit -m "feat: windowed piano roll, keyboard renderer and impact flash"
```

---

### Task 9: Transport store

**Files:**
- Create: `src/transport/useTransport.ts`
- Test: `src/transport/useTransport.test.ts`

**Interfaces:**
- Consumes: `ScoreDocument`, `TempoSetting` (Task 2); `retimeScore` (Task 5); `secToTicks`, `ticksToSec` (Task 2)
- Produces:
  - `interface TransportState { score: ScoreDocument | null; playing: boolean; originSec: number; pausedAtSec: number; tempo: TempoSetting; fallSeconds: number; mode: 'keyboard' | 'roll' }`
  - `useTransport` Zustand store with actions `loadScore`, `play(now)`, `pause(now)`, `seek(sec, now)`, `setTempo(setting, now)`, `setMode`, `setFallSeconds`
  - `playheadAt(state: TransportState, now: number): number` — pure selector

- [ ] **Step 1: Write the failing tests**

`src/transport/useTransport.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useTransport, playheadAt } from './useTransport'
import { buildTempoMap } from '../model/tempoMap'
import type { ScoreDocument } from '../model/types'

const PPQ = 480
const score = (): ScoreDocument => ({
  id: 'x', name: 'test.mid', ppq: PPQ,
  tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], PPQ),
  voices: [{ id: 'v', label: 'V', hue: 207, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1 }],
  notes: [
    { id: 0, pitch: 60, startTicks: 0, durTicks: 480, startSec: 0, endSec: 0.5, velocity: 100, voiceId: 'v' },
    { id: 1, pitch: 64, startTicks: PPQ * 8, durTicks: 480, startSec: 4, endSec: 4.5, velocity: 100, voiceId: 'v' },
  ],
  durationSec: 4.5, sourceFormat: 'midi',
})

beforeEach(() => {
  useTransport.setState({
    score: null, playing: false, originSec: 0, pausedAtSec: 0,
    tempo: { mode: 'scale', scale: 1 }, fallSeconds: 3, mode: 'roll',
  })
})

describe('playheadAt', () => {
  it('is the paused position while stopped, whatever the clock says', () => {
    useTransport.getState().loadScore(score())
    useTransport.getState().seek(2, 100)
    expect(playheadAt(useTransport.getState(), 999)).toBeCloseTo(2, 9)
  })

  it('advances with the clock while playing', () => {
    useTransport.getState().loadScore(score())
    useTransport.getState().play(10)
    expect(playheadAt(useTransport.getState(), 12.5)).toBeCloseTo(2.5, 9)
  })
})

describe('play / pause', () => {
  it('resumes from where it paused, not from zero', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.play(0)
    t.pause(1.5)
    expect(playheadAt(useTransport.getState(), 99)).toBeCloseTo(1.5, 9)
    useTransport.getState().play(50)
    expect(playheadAt(useTransport.getState(), 51)).toBeCloseTo(2.5, 9)
  })
})

describe('seek', () => {
  it('moves the playhead while playing without stopping', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.play(0)
    t.seek(3, 2)
    expect(useTransport.getState().playing).toBe(true)
    expect(playheadAt(useTransport.getState(), 2)).toBeCloseTo(3, 9)
  })

  it('clamps to the score bounds', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.seek(-5, 0)
    expect(playheadAt(useTransport.getState(), 0)).toBeCloseTo(0, 9)
    t.seek(9999, 0)
    expect(playheadAt(useTransport.getState(), 0)).toBeCloseTo(4.5, 9)
  })
})

describe('setTempo', () => {
  it('retimes the score', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.setTempo({ mode: 'scale', scale: 2 }, 0)
    expect(useTransport.getState().score!.notes[1].startSec).toBeCloseTo(2, 6)
  })

  it('preserves the musical position of the playhead', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.seek(4, 0)                                   // sitting exactly on note 1
    t.setTempo({ mode: 'scale', scale: 2 }, 0)
    // Same musical moment, now at half the wall-clock time.
    expect(playheadAt(useTransport.getState(), 0)).toBeCloseTo(2, 6)
  })

  it('keeps playing across a tempo change', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.play(0)
    t.setTempo({ mode: 'absolute', bpm: 240 }, 1)
    expect(useTransport.getState().playing).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/transport/useTransport.test.ts`
Expected: FAIL — `Failed to resolve import "./useTransport"`.

- [ ] **Step 3: Write the store**

`src/transport/useTransport.ts`:

```ts
import { create } from 'zustand'
import { retimeScore } from '../io/parseMidi'
import { secToTicks, ticksToSec } from '../model/tempoMap'
import type { ScoreDocument, TempoSetting } from '../model/types'

export type DisplayMode = 'keyboard' | 'roll'

export interface TransportState {
  score: ScoreDocument | null
  playing: boolean
  originSec: number      // clock time corresponding to playhead 0
  pausedAtSec: number
  tempo: TempoSetting
  fallSeconds: number
  mode: DisplayMode
}

export interface TransportActions {
  loadScore: (score: ScoreDocument) => void
  play: (now: number) => void
  pause: (now: number) => void
  seek: (sec: number, now: number) => void
  setTempo: (setting: TempoSetting, now: number) => void
  setMode: (mode: DisplayMode) => void
  setFallSeconds: (sec: number) => void
}

/** The playhead is derived, never stored while running. */
export function playheadAt(s: TransportState, now: number): number {
  return s.playing ? now - s.originSec : s.pausedAtSec
}

const clampToScore = (s: TransportState, sec: number) =>
  Math.min(Math.max(0, sec), s.score?.durationSec ?? 0)

export const useTransport = create<TransportState & TransportActions>((set, get) => ({
  score: null,
  playing: false,
  originSec: 0,
  pausedAtSec: 0,
  tempo: { mode: 'scale', scale: 1 },
  fallSeconds: 3,
  mode: 'roll',

  loadScore: (score) => set({ score, playing: false, pausedAtSec: 0, originSec: 0 }),

  play: (now) => set((s) => ({ playing: true, originSec: now - s.pausedAtSec })),

  pause: (now) => set((s) => ({ playing: false, pausedAtSec: playheadAt(s, now) })),

  seek: (sec, now) => set((s) => {
    const target = clampToScore(s, sec)
    return s.playing
      ? { originSec: now - target, pausedAtSec: target }
      : { pausedAtSec: target }
  }),

  /**
   * Capture the playhead's MUSICAL position, retime the score, then rebase the
   * clock so the same musical moment is under the playhead. The playhead never
   * jumps and the score never degrades -- ticks are the truth.
   */
  setTempo: (setting, now) => {
    const s = get()
    if (!s.score) { set({ tempo: setting }); return }
    const ticks = secToTicks(s.score.tempoMap, s.score.ppq, playheadAt(s, now), s.tempo)
    const score = retimeScore(s.score, setting)
    const target = ticksToSec(score.tempoMap, score.ppq, ticks, setting)
    set({
      tempo: setting, score,
      pausedAtSec: target,
      originSec: s.playing ? now - target : s.originSec,
    })
  },

  setMode: (mode) => set({ mode }),
  setFallSeconds: (fallSeconds) => set({ fallSeconds }),
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/transport/useTransport.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/transport
git commit -m "feat: transport store with clock-origin seeking and tempo rebasing"
```

---

### Task 10: Canvas stage hook and app shell

**Files:**
- Create: `src/render/useCanvasStage.ts`, `src/ui/FileDropZone.tsx`, `src/ui/TransportBar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–9
- Produces: a running app.

- [ ] **Step 1: Write the canvas stage hook**

`src/render/useCanvasStage.ts`:

```ts
import { useEffect, useRef } from 'react'

/**
 * Owns the canvas sizing and the rAF loop. Calls draw(ctx, w, h) every frame.
 * The draw callback is held in a ref so changing it never restarts the loop.
 */
export function useCanvasStage(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0, h = 0, raf = 0

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, r.width)
      h = Math.max(1, r.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const frame = () => { raf = requestAnimationFrame(frame); drawRef.current(ctx, w, h) }
    raf = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return canvasRef
}
```

- [ ] **Step 2: Write the file drop zone**

`src/ui/FileDropZone.tsx`:

```tsx
import { useCallback, useRef, useState } from 'react'

export function FileDropZone({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const accept = useCallback((file: File | undefined) => {
    if (!file) return
    if (!/\.midi?$/i.test(file.name)) {
      setError(`${file.name} is not a MIDI file. Choose a .mid or .midi file.`)
      return
    }
    setError(null)
    onFile(file)
  }, [onFile])

  return (
    <div
      className={`file-drop flex flex-col items-center gap-3 rounded-xl border border-dashed px-8 py-10 transition-colors ${
        over ? 'border-[var(--accent)] bg-white/5' : 'border-[var(--line)]'
      }`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]) }}
    >
      <p className="file-drop-headline text-base font-medium">Drop a MIDI file to play it</p>
      <button
        type="button"
        className="btn-choose-file rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black"
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </button>
      <input
        id="file-input"
        ref={inputRef}
        type="file"
        accept=".mid,.midi"
        className="file-input hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
      {error && <p className="file-drop-error text-sm text-[#ff6b6b]">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Write the transport bar**

`src/ui/TransportBar.tsx`:

```tsx
import type { DisplayMode } from '../transport/useTransport'

const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TransportBar(props: {
  playing: boolean
  playhead: number
  duration: number
  mode: DisplayMode
  name: string
  onToggle: () => void
  onSeek: (sec: number) => void
  onMode: (mode: DisplayMode) => void
}) {
  const { playing, playhead, duration, mode, name } = props
  return (
    <div className="transport-bar flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-2">
      <button
        type="button"
        className="btn-play rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-black"
        onClick={props.onToggle}
      >
        {playing ? 'Pause' : 'Play'}
      </button>

      <span className="transport-time font-mono text-xs tabular-nums text-[var(--ink-dim)]">
        {mmss(playhead)} / {mmss(duration)}
      </span>

      <input
        id="scrub"
        type="range"
        className="transport-scrub h-1 min-w-40 flex-1 accent-[var(--accent)]"
        min={0}
        max={Math.max(duration, 0.001)}
        step={0.01}
        value={Math.min(playhead, duration)}
        onChange={(e) => props.onSeek(Number(e.target.value))}
      />

      <div className="mode-switch flex gap-1">
        {(['roll', 'keyboard'] as DisplayMode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            className={`btn-mode rounded-md border px-3 py-1 text-xs capitalize ${
              mode === m ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-[var(--ink-dim)]'
            }`}
            onClick={() => props.onMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <span className="transport-filename truncate text-xs text-[var(--ink-dim)]">{name}</span>
    </div>
  )
}
```

- [ ] **Step 4: Wire the app together**

`src/App.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from './audio/engine'
import { Scheduler, TICK_MS } from './audio/scheduler'
import { parseMidi } from './io/parseMidi'
import { hashFile } from './io/hashFile'
import { computeLayout } from './render/geometry'
import { drawStage } from './render/pianoRoll'
import { useCanvasStage } from './render/useCanvasStage'
import { playheadAt, useTransport } from './transport/useTransport'
import { FileDropZone } from './ui/FileDropZone'
import { TransportBar } from './ui/TransportBar'
import type { RenderState } from './render/pianoRoll'

export default function App() {
  const t = useTransport()
  const engineRef = useRef<AudioEngine | null>(null)
  const schedulerRef = useRef<Scheduler | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [error, setError] = useState<string | null>(null)

  if (!engineRef.current) engineRef.current = new AudioEngine()
  const engine = engineRef.current

  // Rebuild the scheduler whenever the note array is replaced (load or retime).
  useEffect(() => {
    if (!t.score) { schedulerRef.current = null; return }
    const s = new Scheduler(t.score.notes)
    s.seek(playheadAt(useTransport.getState(), engine.currentTime))
    schedulerRef.current = s
  }, [t.score, engine])

  // The scheduler tick. Runs on a plain interval; audio timing comes from the
  // exact `time` passed to smplr, not from when this fires.
  useEffect(() => {
    const id = setInterval(() => {
      const state = useTransport.getState()
      const s = schedulerRef.current
      if (!state.playing || !s || !state.score) return
      const now = engine.currentTime
      const head = playheadAt(state, now)
      for (const sched of s.collect(head)) {
        const voice = state.score.voices.find((v) => v.id === sched.note.voiceId)
        if (voice) engine.play(sched, voice, state.originSec)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [engine])

  const canvasRef = useCanvasStage(
    useCallback((ctx, w, h) => {
      const state = useTransport.getState()
      const now = engine.currentTime
      const head = playheadAt(state, now)
      setPlayhead(head)

      const layout = computeLayout(w, h)
      const rs: RenderState = {
        notes: state.score?.notes ?? [],
        voices: new Map((state.score?.voices ?? []).map((v) => [v.id, v])),
        layout,
        fallSeconds: state.mode === 'keyboard' ? 0.001 : state.fallSeconds,
        showGrid: state.mode === 'roll',
        showFlash: true,
      }
      drawStage(ctx, rs, head, state.score ? head / state.score.durationSec : 0)
    }, [engine]),
  )

  const loadFile = useCallback(async (file: File) => {
    try {
      const bytes = await file.arrayBuffer()
      const score = parseMidi(bytes, file.name, useTransport.getState().tempo)
      score.id = await hashFile(bytes)
      if (score.notes.length === 0) { setError(`${file.name} contains no notes.`); return }
      setError(null)
      useTransport.getState().loadScore(score)
      await engine.resume()
      await Promise.all([...new Set(score.voices.map((v) => v.instrument))]
        .map((i) => engine.loadInstrument(i)))
    } catch (e) {
      setError(`Could not read ${file.name}: ${(e as Error).message}`)
    }
  }, [engine])

  const toggle = useCallback(async () => {
    await engine.resume()
    const state = useTransport.getState()
    const now = engine.currentTime
    if (state.playing) { state.pause(now); engine.stopAll() }
    else {
      state.play(now)
      schedulerRef.current?.seek(playheadAt(useTransport.getState(), now))
    }
  }, [engine])

  const seek = useCallback((sec: number) => {
    const now = engine.currentTime
    useTransport.getState().seek(sec, now)
    schedulerRef.current?.seek(sec)
    engine.stopAll()
  }, [engine])

  return (
    <div className="app-shell flex h-full flex-col bg-[var(--ground)]">
      <div className="stage-wrap relative min-h-0 flex-1 bg-[var(--stage)]">
        <canvas ref={canvasRef} className="stage-canvas block h-full w-full" />
        {!t.score && (
          <div className="stage-empty absolute inset-0 flex items-center justify-center p-4">
            <FileDropZone onFile={loadFile} />
          </div>
        )}
        {error && (
          <p className="stage-error absolute left-4 top-4 rounded bg-black/70 px-3 py-2 text-sm text-[#ff6b6b]">
            {error}
          </p>
        )}
      </div>

      {t.score && (
        <TransportBar
          playing={t.playing}
          playhead={playhead}
          duration={t.score.durationSec}
          mode={t.mode}
          name={t.score.name}
          onToggle={toggle}
          onSeek={seek}
          onMode={t.setMode}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify the whole suite and type-check**

```bash
npx tsc --noEmit
npm test
node tests/geometry-check.mjs
```
Expected: no type errors; all Vitest suites pass; `all passed` from the rig check.

- [ ] **Step 6: Verify in the browser**

```bash
npm run dev -- --host 0.0.0.0
```

Open the Local URL and confirm, in order:

1. The drop zone is visible on a black stage.
2. Dropping a `.mid` file replaces it with the keyboard and transport bar.
3. Pressing Play sounds audio and drops notes onto the keys.
4. Notes flash white on impact and the struck key tints in the voice colour.
5. Dragging the scrub bar moves the playhead and the visuals follow; audio resumes cleanly.
6. Switching to `keyboard` mode hides the falling bars but keys still light.
7. Resizing the window rescales the keyboard with no stretching.

Then open the **Network** URL on a phone in landscape and confirm the keyboard is proportioned like `tools/strike-lab.html`, with middle C's dark border visible.

If audio does not sound, check the console for an AudioContext warning — browsers require a user gesture, which `engine.resume()` inside the click handler provides; loading a file via drag-drop alone is not a gesture.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: canvas stage, file drop, transport bar, and app wiring"
```

---

## Self-Review

**Spec coverage for this plan's slice.** §3 architecture — Tasks 6, 7, 9, 10. §4 data model — Task 2. §5 modules — all. §6.1 MIDI input path — Task 5. §7 colour system (file playback) — Task 4. §8 geometry and rendering — Tasks 3, 8. §8.1 visual style — Task 8. §11 error handling — the unparseable-file, no-notes and suspended-AudioContext cases are in Task 10; the smplr fallback is in Task 7. §12 UI conventions — Tasks 1, 10.

**Deferred by design, and to which plan.** Settings dropdown, BPM mode UI, voice editing, keyboard zoom with `ensureFullBlackKeyGroups`, profile JSON, debug route (plan 2). MusicXML, Verovio (plan 3). Live MIDI input, metronome, per-voice instrument selection UI (plan 4). The engine already accepts per-voice instruments, so plan 4 adds UI, not plumbing.

**Type consistency.** `ScoreDocument`, `NoteEvent`, `Voice`, `TempoEvent`, `TempoSetting` are defined once in Task 2 and imported everywhere after. `KeyboardLayout`/`KeyRect` come from Task 3, `RenderState` from Task 8, `ScheduledNote` from Task 6. `retimeScore` is defined in Task 5 and consumed in Task 9. `playheadAt` is defined in Task 9 and consumed in Task 10. `computeLayout(stageW, stageH, opts?)` keeps the same signature in Tasks 3, 8 and 10.

**Known seam.** Task 10 filters `visibleNotes` twice per frame — once in `drawRoll` and once in `drawStage` for the held set. Correct but wasteful. Left alone deliberately: it is a measurable optimisation, and the plan should not pre-optimise something no one has profiled. If the dense-file check in Task 10 Step 6 shows frame drops, hoist the call.
