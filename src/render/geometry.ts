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
