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
  stageW: number
  whiteCount: number
}

export interface GeometryOpts {
  aspect: number          // white key length : width
  blackWRatio: number     // black key width as a fraction of white
  blackLenRatio: number   // black key length as a fraction of keyboard height
  trueOffsets: boolean    // false reproduces the naive boundary-centred bug
  firstPitch: number      // lowest pitch on the visible keyboard
  lastPitch: number       // highest pitch on the visible keyboard
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
  firstPitch: FIRST_PITCH,
  lastPitch: LAST_PITCH,
}

export function isBlackKey(pitch: number): boolean {
  return BLACK_PC.has(((pitch % 12) + 12) % 12)
}

export function whiteKeyCount(lo: number, hi: number): number {
  let n = 0
  for (let p = lo; p <= hi; p++) if (!isBlackKey(p)) n++
  return n
}

/** White-key pitch classes a range boundary may safely land on. Anything else
    cuts a black-key group in half, which reads as a broken keyboard. */
const START_SAFE = new Set([0, 4, 5, 11])   // C, E, F, B
const END_SAFE = new Set([0, 4, 5, 11])     // C, E, F, B

export const MIN_FIT_SEMITONES = 24

const pc = (p: number) => ((p % 12) + 12) % 12

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

export function computeLayout(
  stageW: number, stageH: number, opts: Partial<GeometryOpts> = {},
): KeyboardLayout {
  const o = { ...DEFAULT_GEOMETRY, ...opts }
  const count = Math.max(1, whiteKeyCount(o.firstPitch, o.lastPitch))
  const whiteW = stageW / count
  const blackW = Math.max(3, whiteW * o.blackWRatio)
  // Height derives from key WIDTH, never from the viewport. Taking it from stage
  // height gave 19.5:1 in phone portrait. The cap only bites on short windows.
  const keyboardH = Math.min(whiteW * o.aspect, stageH * 0.55)
  const blackH = keyboardH * o.blackLenRatio
  const hitY = stageH - keyboardH

  const keys: KeyRect[] = []
  let wi = 0
  for (let p = o.firstPitch; p <= o.lastPitch; p++) {
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
    stageW, whiteCount: count,
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
