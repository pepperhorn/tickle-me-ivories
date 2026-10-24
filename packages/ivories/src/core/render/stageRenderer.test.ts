import { describe, it, expect } from 'vitest'
import { StageRenderer, rangeFromProp } from './stageRenderer'
import { computeLayout, ensureFullBlackKeyGroups } from './geometry'
import { DEFAULT_THEME } from './theme'
import { stubCtx } from './pianoRoll.test-helpers'
import { DEFAULT_SETTINGS } from '../settings/types'
import type { StageInput } from './stageRenderer'
import { buildTempoMap } from '../model/tempoMap'
import type { ScoreDocument } from '../model/types'
import { resolveTemplate } from '../template/resolve'

const input = (patch: Partial<StageInput> = {}): StageInput => ({
  score: null, settings: structuredClone(DEFAULT_SETTINGS), fallSeconds: 3, maxNoteDur: 0,
  showRoll: true, range: null, ...patch,
})

describe('StageRenderer', () => {
  it('caches the layout by size and range (no per-frame allocation)', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const a = r.draw(ctx, 800, 400, 0, input())
    const b = r.draw(ctx, 800, 400, 1, input())
    expect(b.layout).toBe(a.layout)
    const c = r.draw(ctx, 900, 400, 1, input())
    expect(c.layout).not.toBe(a.layout)
  })

  it('reads the theme once per layout, not per frame', () => {
    let reads = 0
    const r = new StageRenderer(() => { reads++; return DEFAULT_THEME })
    const { ctx } = stubCtx()
    for (let i = 0; i < 5; i++) r.draw(ctx, 800, 400, i, input())
    expect(reads).toBe(1)
  })

  it('an explicit range overrides the zoom setting', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const f = r.draw(ctx, 800, 400, 0, input({ range: [48, 72] }))
    expect(f.layout.keys[0].pitch).toBe(48)
    expect(f.layout.keys.at(-1)!.pitch).toBe(72)
  })

  it('draws at 0x0 (hidden container) without NaN geometry (Review Focus 5)', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const f = r.draw(ctx, 0, 0, 0, input())
    for (const k of f.layout.keys) expect(Number.isFinite(k.x) && Number.isFinite(k.w)).toBe(true)
    expect(Number.isFinite(f.layout.hitY)).toBe(true)
  })
})

describe('range crop equals the full keyboard scaled to the range (spec §4, R5)', () => {
  it('matches key positions of the 88-key geometry, scaled and shifted', () => {
    const [lo, hi] = ensureFullBlackKeyGroups(48, 72)
    const crop = computeLayout(700, 400, { firstPitch: lo, lastPitch: hi })
    const fullW = 700 * (52 / crop.whiteCount)
    const full = computeLayout(fullW, 400)
    const shift = full.byPitch.get(lo)!.x
    for (const k of crop.keys) {
      const f = full.byPitch.get(k.pitch)!
      expect(k.x).toBeCloseTo(f.x - shift, 6)
      expect(k.w).toBeCloseTo(f.w, 6)
    }
  })

  it('rangeFromProp: full, a tuple widened to whole groups, or none', () => {
    expect(rangeFromProp('full')).toEqual([21, 108])
    expect(rangeFromProp([62, 70])).toEqual([60, 71])
    expect(rangeFromProp(undefined)).toBeNull()
  })
})

describe('StageRenderer orientation (R-H, Review Focus 2)', () => {
  it('horizontal: canonical geometry on the swapped box, drawn under the reflection', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx, calls } = stubCtx()
    const f = r.draw(ctx, 800, 400, 0, input({ orientation: 'horizontal' }))
    expect(f.layout.stageW).toBe(400)
    expect(f.layout.hitY + f.layout.keyboardH).toBe(800)
    expect(calls[0]).toBe('save(0)')
    expect(calls).toContain('transform(6)')
    expect(calls.at(-1)).toBe('restore(0)')
  })

  it('vertical: same geometry as before and no transform', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx, calls } = stubCtx()
    const f = r.draw(ctx, 800, 400, 0, input())
    expect(f.layout.stageW).toBe(800)
    expect(calls).not.toContain('transform(6)')
  })

  it('horizontal at 0x0 stays finite', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const f = r.draw(ctx, 0, 0, 0, input({ orientation: 'horizontal' }))
    for (const k of f.layout.keys) expect(Number.isFinite(k.x) && Number.isFinite(k.w)).toBe(true)
    expect(Number.isFinite(f.layout.hitY)).toBe(true)
  })
})
describe('StageRenderer rising input', () => {
  const rising = { bpm: 120, beatsPerBar: 4, tempo: { mode: 'scale', scale: 1 } as const, visibleBeats: 8, trail: [], grid: true }

  it('caches the live beat clock by bpm and beats per bar', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const a = r.beatClockFor(null, rising)
    expect(r.beatClockFor(null, { ...rising })).toBe(a)
    expect(r.beatClockFor(null, { ...rising, bpm: 60 })).not.toBe(a)
  })

  it('caches the score beat clock for the same score and an equal tempo; a new tempo rebuilds it', () => {
    const score: ScoreDocument = {
      id: 's', name: 's', ppq: 480, tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480), voices: [], notes: [],
      durationSec: 4, sourceFormat: 'midi', timeSignatures: [], keySignature: null,
    }
    const r = new StageRenderer(() => DEFAULT_THEME)
    const a = r.beatClockFor(score, rising)
    expect(r.beatClockFor(score, { ...rising, tempo: { mode: 'scale', scale: 1 } })).toBe(a)
    const b = r.beatClockFor(score, { ...rising, tempo: { mode: 'scale', scale: 2 } })
    expect(b).not.toBe(a)
    expect(r.beatClockFor(score, { ...rising, tempo: { mode: 'absolute', bpm: 90 } })).not.toBe(b)
  })

  it('draws the rising roll (no octave grid lines from the falling path) under the orientation', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx, calls } = stubCtx()
    const f = r.draw(ctx, 800, 400, 1, input({ rising, orientation: 'horizontal' }))
    expect(f.layout.stageW).toBe(400)
    expect(calls).toContain('transform(6)')
    // The falling path's octave grid uses setLineDash; the rising path never does.
    expect(calls).not.toContain('setLineDash(1)')
  })
})

describe('StageRenderer template (Review Focus 5)', () => {
  it('re-reads the theme when the template changes, never per frame', () => {
    let reads = 0
    const r = new StageRenderer(() => { reads++; return DEFAULT_THEME })
    const { ctx } = stubCtx()
    const classic = resolveTemplate('classic')
    const cards = resolveTemplate('chord-cards')
    for (let i = 0; i < 5; i++) r.draw(ctx, 800, 400, i, input({ template: classic }))
    for (let i = 0; i < 5; i++) r.draw(ctx, 800, 400, i, input({ template: cards }))
    for (let i = 0; i < 5; i++) r.draw(ctx, 800, 400, i, input({ template: classic }))
    expect(reads).toBe(3)
  })

  it('the default template draws exactly as no template', () => {
    const score: ScoreDocument = {
      id: 's', name: 's', ppq: 480, tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480),
      voices: [{ id: 'v', name: 'v', hand: 'right' } as unknown as ScoreDocument['voices'][number]],
      notes: [{ id: 1, pitch: 60, startTicks: 0, durTicks: 960, startSec: 0, endSec: 2, velocity: 90, voiceId: 'v' }],
      durationSec: 4, sourceFormat: 'midi', timeSignatures: [], keySignature: null,
    }
    const rising = { bpm: 120, beatsPerBar: 4, tempo: { mode: 'scale', scale: 1 } as const, visibleBeats: 8, trail: [], grid: true }
    const variants: Partial<StageInput>[] = [
      {}, { showRoll: false }, { rising }, { orientation: 'horizontal' }, { rising, orientation: 'horizontal' },
    ]
    for (const v of variants) {
      const run = (template: ReturnType<typeof resolveTemplate> | undefined) => {
        const r = new StageRenderer(() => DEFAULT_THEME)
        const s = stubCtx()
        r.draw(s.ctx, 800, 400, 1, input({ score, barLabel: () => 'C', ...v, template }))
        return { calls: s.calls, fillStyles: s.fillStyles, gradientStops: s.gradientStops, texts: s.texts }
      }
      expect(run(resolveTemplate('classic'))).toEqual(run(undefined))
    }
  })
})
