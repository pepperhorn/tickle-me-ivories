import { describe, it, expect } from 'vitest'
import {
  computeLayout, pitchAt, ensureFullBlackKeyGroups, fitRange, whiteKeyCount,
  FIRST_PITCH, LAST_PITCH,
} from './geometry'

const BLACK_PC = new Set([1, 3, 6, 8, 10])
const REF_W = 1220          // reference frame width; whiteW = 23.462

/** Offset of each black key centre from the white-key boundary, in px at REF_W.
 *  Measured from all 36 black keys of a SheetMusicBoss reference frame. */
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
