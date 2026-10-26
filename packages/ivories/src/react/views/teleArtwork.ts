/**
 * Original, code-native Telecaster-inspired artwork: no logos, no traced photo paths.
 * Drawn front-on with the headstock at the left and the treble (high) string at the top,
 * so the single cutaway is above the neck and the bass shoulder is below it.
 * The neck is drawn wider than life so note circles stay readable; the headstock and
 * body keep the Tele's silhouette cues rather than being scaled up to match it.
 */

type Pt = readonly [number, number]
/** A cubic segment's control points and end point; it starts where the previous one ended. */
type Cubic = readonly [Pt, Pt, Pt]

export interface TeleLayout {
  nut: number; top: number; bottom: number
  /** Nut to the last fret wire. */
  length: number
  /** Fingerboard end, a short tail past the last fret, where the neck meets the body. */
  end: number
  width: number; height: number
  /** CSS min-width that keeps note circles readable; narrower slots scroll. */
  minWidth: number
}

export const TELE_STRING_GAP = 30
/** Six inline posts on a diagonal: high E furthest from the nut, low E nearest it. */
const POST_GAP = 55
const FIRST_POST = 370
/** The bass edge runs parallel to the post line, this far below it. */
const EDGE_DROP = 32
const SLOPE = TELE_STRING_GAP / POST_GAP
/** Visible body right of the fingerboard end before the deliberate crop. */
const BODY_VISIBLE = 185
const TAIL = 24
export const TELE_FADE = 60

export function teleLayout(frets: 12 | 24): TeleLayout {
  const nut = 450, top = 158, bottom = top + 180
  const length = frets === 24 ? 1900 : 740
  const end = nut + length + TAIL
  const width = end + BODY_VISIBLE
  return { nut, top, bottom, length, end, width, height: bottom + 162, minWidth: Math.round(width * 0.8) }
}

const f = (n: number) => Math.round(n * 10) / 10
const pt = ([x, y]: Pt) => `${f(x)} ${f(y)}`
const cubics = (segs: readonly Cubic[]) => segs.map((s) => ` C${s.map(pt).join(' ')}`).join('')
const toPath = (start: Pt, segs: readonly Cubic[]) => `M${pt(start)}` + cubics(segs)

/** String k from the top (0 = high E). */
export const teleStringY = (l: TeleLayout, k: number) => l.top + 15 + k * TELE_STRING_GAP

export interface TelePost { x: number; y: number }
export function telePosts(l: TeleLayout): TelePost[] {
  return Array.from({ length: 6 }, (_, k) => ({ x: l.nut - FIRST_POST + k * POST_GAP, y: teleStringY(l, k) }))
}
/** The round string tree holds down the two treble strings between their posts and the nut. */
export const teleStringTree = (l: TeleLayout) => ({ x: l.nut - 212, y: l.top + 30, r: 7.5 })
/** Tuner keys stand out square to the bass edge. */
export const TELE_KEY_ANGLE = Math.atan(SLOPE) * 180 / Math.PI
export const TELE_KEY_OFFSET = EDGE_DROP / Math.hypot(1, SLOPE)

export function teleHeadstockPath(l: TeleLayout): string {
  const { nut: n, top: t } = l
  const edge = (x: number) => t + 15 + EDGE_DROP + SLOPE * (x - (n - FIRST_POST))
  const knobFoot: Pt = [n - 402, edge(n - 402)]
  const chin: Pt = [n - 62, edge(n - 62)]
  return toPath([n + 6, t], [
    // Treble edge: a long low hump from the nut, a waist, then the rounded knob.
    [[n - 80, t - 3], [n - 170, t - 27], [n - 235, t - 41]],
    [[n - 258, t - 46], [n - 282, t - 21], [n - 304, t - 19]],
    [[n - 326, t - 17], [n - 342, t - 50], [n - 374, t - 51]],
    [[n - 410, t - 52], [n - 436, t - 30], [n - 436, t - 4]],
    [[n - 436, t + 14], [knobFoot[0] - 20, knobFoot[1] - 20 * SLOPE], knobFoot],
  ]) + ` L${pt(chin)}` + ` C${pt([chin[0] + 18, chin[1] + 18 * SLOPE])} ${pt([n - 14, l.bottom])} ${pt([n + 6, l.bottom])} Z`
}

/** Body outline anchors: points relative to the fingerboard end and the neck top (t) or bottom (b). */
type Anchor = readonly [number, number, 't' | 'b']
type Seg = readonly [Anchor, Anchor, Anchor]
const TREBLE_START: Anchor = [-17, 4, 't']
/** Cutaway, single horn, waist, then the upper bout rising into the crop. */
const TREBLE: readonly Seg[] = [
  [[-6, -8, 't'], [-2, -36, 't'], [-8, -54, 't']],
  [[-16, -72, 't'], [-45, -84, 't'], [-90, -89, 't']],
  [[-112, -92, 't'], [-128, -96, 't'], [-135, -108, 't']],
  [[-142, -120, 't'], [-134, -134, 't'], [-112, -139, 't']],
  [[-90, -144, 't'], [-50, -146, 't'], [-10, -137, 't']],
  [[25, -130, 't'], [60, -110, 't'], [95, -108, 't']],
  [[130, -106, 't'], [160, -118, 't'], [BODY_VISIBLE + 10, -131, 't']],
]
/** From the crop back along the bass side: waist, the rounded shoulder, into the neck heel. */
const BASS_START: Anchor = [BODY_VISIBLE + 10, 138, 'b']
const BASS: readonly Seg[] = [
  [[160, 130, 'b'], [130, 122, 'b'], [103, 123, 'b']],
  [[70, 125, 'b'], [20, 140, 'b'], [-30, 152, 'b']],
  [[-60, 156, 'b'], [-95, 157, 'b'], [-117, 146, 'b']],
  [[-138, 134, 'b'], [-146, 112, 'b'], [-145, 98, 'b']],
  [[-144, 74, 'b'], [-132, 44, 'b'], [-120, 28, 'b']],
  [[-112, 16, 'b'], [-104, 6, 'b'], [-100, -4, 'b']],
]
const place = (l: TeleLayout, [x, y, a]: Anchor): Pt => [l.end + x, (a === 't' ? l.top : l.bottom) + y]

export function teleBodyPath(l: TeleLayout): string {
  const segs = (s: readonly Seg[]) => s.map((c) => c.map((p) => place(l, p)) as unknown as Cubic)
  return toPath(place(l, TREBLE_START), segs(TREBLE)) + ` L${pt(place(l, BASS_START))}` + cubics(segs(BASS)) + ' Z'
}

const bezier = (p0: Pt, [c1, c2, p1]: Cubic, u: number): Pt => {
  const v = 1 - u
  return [v ** 3 * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u ** 3 * p1[0],
    v ** 3 * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u ** 3 * p1[1]]
}

/**
 * The pickguard follows the treble outline at a constant inset (a sampled offset of the
 * body curve), then turns along its own bass-side edge under the neck pickup.
 */
export function telePickguardPath(l: TeleLayout, inset = 9): string {
  let from = place(l, TREBLE_START)
  const samples: Pt[] = [from]
  for (const seg of TREBLE) {
    const c = seg.map((p) => place(l, p)) as unknown as Cubic
    for (let i = 1; i <= 16; i++) samples.push(bezier(from, c, i / 16))
    from = c[2]
  }
  // Inward is to the right of travel (clockwise in screen space).
  const offset = samples.map((p, i): Pt => {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
    return [p[0] - dy / len * inset, p[1] + dx / len * inset]
  })
  const e = l.end, b = l.bottom
  return `M${offset.map(pt).join(' L')}` +
    ` L${pt([e + BODY_VISIBLE + 10, b + 19])} L${pt([e + 165, b + 19])} L${pt([e + 165, b + 62])}` +
    ` Q${pt([e + 165, b + 71])} ${pt([e + 155, b + 71])}` +
    ` C${pt([e + 110, b + 77])} ${pt([e + 40, b + 79])} ${pt([e - 7, b + 73])}` +
    ` C${pt([e - 40, b + 62])} ${pt([e - 70, b + 44])} ${pt([e - 79, b + 22])}` +
    ` L${pt([e - 86, b - 10])} Z`
}

/** Guard screws and the chrome neck-pickup cover, just past the fingerboard end. */
export const teleScrews = (l: TeleLayout): TelePost[] => [{ x: l.end - 105, y: l.top - 110 }, { x: l.end - 64, y: l.bottom + 18 }]
export const teleNeckPickup = (l: TeleLayout) => ({ x: l.end + 22, y: l.top + 5, width: 26, height: l.bottom - l.top - 10 })
