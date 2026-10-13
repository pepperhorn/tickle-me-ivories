import { describe, it, expect } from 'vitest'
import { computeLayout } from './geometry'
import { applyOrientation, canonicalSize, fromScreen, pitchAtScreen, toScreen } from './orientation'
import type { KeyRect, KeyboardLayout } from './geometry'

const W = 1220   // screen width
const H = 600    // screen height
const [cw, ch] = canonicalSize('horizontal', W, H)
const layout = computeLayout(cw, ch)

/** A key's screen rectangle under the horizontal map. */
function screenRect(l: KeyboardLayout, k: KeyRect) {
  const a = toScreen('horizontal', l, k.x, l.hitY)
  const b = toScreen('horizontal', l, k.x + k.w, l.hitY + (k.black ? l.blackH : l.keyboardH))
  return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) }
}

describe('horizontal orientation (rising-roll spec §2 Orientation, R-H)', () => {
  it('lays the canonical geometry out on the swapped box', () => {
    expect([cw, ch]).toEqual([600, 1220])
    expect(layout.stageW).toBe(600)
    expect(layout.hitY + layout.keyboardH).toBe(1220)
    expect(canonicalSize('vertical', W, H)).toEqual([W, H])
    expect(canonicalSize(undefined, W, H)).toEqual([W, H])
  })

  it('keeps the chordl ratios (it is the same computeLayout)', () => {
    expect(layout.keyboardH / layout.whiteW).toBeCloseTo(5.8, 9)
    expect(layout.blackW / layout.whiteW).toBeCloseTo(0.5652, 9)
    expect(layout.blackH / layout.keyboardH).toBeCloseTo(0.655, 9)
  })

  it('stands the keyboard on the left edge with low notes at the bottom; white keys tile the height', () => {
    const whites = layout.keys.filter((k) => !k.black)
    const a0 = screenRect(layout, whites[0])
    expect(a0.left).toBeCloseTo(0, 9)
    expect(a0.right).toBeCloseTo(layout.keyboardH, 9)
    expect(a0.bottom).toBeCloseTo(H, 9)
    expect(screenRect(layout, whites.at(-1)!).top).toBeCloseTo(0, 9)
    for (let i = 1; i < whites.length; i++) {
      expect(screenRect(layout, whites[i]).bottom).toBeCloseTo(screenRect(layout, whites[i - 1]).top, 9)
    }
    // Black keys sit on the roll side of the keyboard (their tails face the stage).
    const cs = screenRect(layout, layout.byPitch.get(22)!)
    expect(cs.right).toBeCloseTo(layout.keyboardH, 9)
    expect(cs.left).toBeCloseTo(layout.keyboardH - layout.blackH, 9)
  })

  it('fromScreen inverts toScreen; pitchAtScreen hit-tests the rotated keys', () => {
    const p = toScreen('horizontal', layout, 123.4, 567.8)
    const back = fromScreen('horizontal', layout, p.x, p.y)
    expect(back.x).toBeCloseTo(123.4, 9)
    expect(back.y).toBeCloseTo(567.8, 9)
    expect(pitchAtScreen(layout, 'horizontal', layout.keyboardH * 0.2, H - layout.whiteW / 2)).toBe(21)
    expect(pitchAtScreen(layout, 'horizontal', layout.keyboardH + 5, H / 2)).toBe(-1)
  })

  it('vertical is the identity', () => {
    const v = computeLayout(W, H)
    expect(toScreen('vertical', v, 10, 20)).toEqual({ x: 10, y: 20 })
    expect(fromScreen(undefined, v, 10, 20)).toEqual({ x: 10, y: 20 })
  })

  it('applyOrientation sets the reflection transform only for horizontal', () => {
    const calls: number[][] = []
    const ctx = { transform: (...a: number[]) => { calls.push(a) } } as unknown as CanvasRenderingContext2D
    applyOrientation(ctx, 'vertical', layout)
    expect(calls).toEqual([])
    applyOrientation(ctx, 'horizontal', layout)
    expect(calls).toEqual([[0, -1, -1, 0, 1220, 600]])
  })
})
