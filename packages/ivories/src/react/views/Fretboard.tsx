import { useEffect, useId } from 'react'
import type { CSSProperties } from 'react'
import { useActiveNotes, useIvories } from '../hooks'
import { withProvider } from '../withProvider'
import { cx } from '../cx'
import { resolveTemplate } from '../../core/template/resolve'
import type { TemplateRef } from '../../core/template/types'
import type { ThemeName } from '../../core/settings/types'
import { exactPitchPositions, fretBoundary, fretNoteName, FRETBOARD_TUNINGS, headstockFor } from '../../core/fretboard/model'
import type { FretboardOptions, HeadstockStyle } from '../../core/fretboard/types'
import { TELE_FADE, TELE_KEY_ANGLE, TELE_KEY_OFFSET, teleBodyPath, teleHeadstockPath, teleLayout, teleNeckPickup, telePickguardPath, telePosts, teleScrews, teleStringTree } from './teleArtwork'
import type { TeleLayout } from './teleArtwork'

export interface FretboardDiagramProps extends FretboardOptions {
  /** Sounding MIDI pitches. No pitch-class expansion or octave transposition. */
  pitches?: readonly number[]
  livePitches?: readonly number[]
  className?: string
  style?: CSSProperties
  theme?: ThemeName
  height?: number | string
}

const OUTLINES: Record<Exclude<HeadstockStyle, 'tele'>, string> = {
  strat: 'M320 85 L254 85 C232 81 239 48 218 42 L67 24 C32 17 12 40 22 70 C28 91 54 91 64 112 L111 210 C130 246 155 269 192 266 C231 263 224 230 247 238 L320 255 Z',
  precision: 'M320 85 L254 85 Q249 53 218 41 L69 22 Q25 15 20 54 Q17 87 62 100 L99 195 Q119 247 165 267 Q208 284 227 254 L249 239 L320 255 Z',
  violin: 'M320 85 Q260 106 220 80 L199 49 Q150 35 63 48 Q41 51 35 72 L35 268 Q41 289 63 292 Q150 305 199 291 L220 260 Q260 234 320 255 Z',
}

/** Original silhouette cues, without logos. Strat/P-Bass inline six/four/five, or violin bass 2+2 / 3+2. */
function Headstock({ style, strings }: { style: Exclude<HeadstockStyle, 'tele'>; strings: number }) {
  const violin = style === 'violin'
  const tuners = Array.from({ length: strings }, (_, i) => {
    if (violin) {
      const top = i < Math.ceil(strings / 2)
      const index = top ? i : i - Math.ceil(strings / 2)
      return { x: 72 + index * 49, y: top ? 78 : 260, top }
    }
    return { x: 51 + i * (169 / (strings - 1)), y: 49 + i * 3.4, top: true }
  })
  return <g className="ivories-fretboard-headstock" data-headstock={style}>
    <path className="ivories-fretboard-wood" d={OUTLINES[style]} />
    {violin && <path className="ivories-fretboard-detail" d="M79 129 Q124 110 178 129 L178 211 Q124 229 79 211 Z" />}
    {tuners.map((t, i) => <g key={i} className="ivories-fretboard-tuner" data-tuner={i}>
      <path d={`M${t.x} ${t.y} V${t.y + (t.top ? -29 : 29)}`} />
      <rect x={t.x - 10} y={t.y + (t.top ? -39 : 25)} width="20" height="14" rx="7" />
      <circle cx={t.x} cy={t.y} r="7" />
      <circle className="ivories-fretboard-post" cx={t.x} cy={t.y} r="2" />
    </g>)}
  </g>
}

const STYLE_NAME: Record<HeadstockStyle, string> = { strat: 'Strat', tele: 'Tele', precision: 'P-Bass', violin: 'Violin-bass' }

/** Six inline Kluson-style keys under the bass edge; drawn before the wood so shafts emerge from it. */
function TeleKeys({ layout }: { layout: TeleLayout }) {
  return <g className="ivories-fretboard-tuner-keys">
    {telePosts(layout).map((p, k) => <g key={k} className="ivories-fretboard-tuner-key" data-key={k}
      transform={`translate(${p.x} ${p.y}) rotate(${TELE_KEY_ANGLE.toFixed(2)})`}>
      <rect className="ivories-fretboard-tuner-shaft" x="-3.5" y={TELE_KEY_OFFSET - 8} width="7" height="20" rx="2" />
      <path className="ivories-fretboard-tuner-button" d={`M-9 ${TELE_KEY_OFFSET + 10} H9 C15 ${TELE_KEY_OFFSET + 10} 15.5 ${TELE_KEY_OFFSET + 17} 14.5 ${TELE_KEY_OFFSET + 23} C13.5 ${TELE_KEY_OFFSET + 30} 9 ${TELE_KEY_OFFSET + 34} 0 ${TELE_KEY_OFFSET + 34} C-9 ${TELE_KEY_OFFSET + 34} -13.5 ${TELE_KEY_OFFSET + 30} -14.5 ${TELE_KEY_OFFSET + 23} C-15.5 ${TELE_KEY_OFFSET + 17} -15 ${TELE_KEY_OFFSET + 10} -9 ${TELE_KEY_OFFSET + 10} Z`} />
      <path className="ivories-fretboard-tuner-shine" d={`M-8 ${TELE_KEY_OFFSET + 16} Q0 ${TELE_KEY_OFFSET + 13} 8 ${TELE_KEY_OFFSET + 16}`} />
    </g>)}
  </g>
}

/** Bushing, string wrap and slotted post cap; string k ends at post k. */
function TelePosts({ layout }: { layout: TeleLayout }) {
  const tree = teleStringTree(layout)
  return <g className="ivories-fretboard-tuners">
    {telePosts(layout).map((p, k) => <g key={k} className="ivories-fretboard-tuner" data-tuner={k} data-string={5 - k}>
      <circle className="ivories-fretboard-tuner-bushing" cx={p.x} cy={p.y} r="10.5" />
      <circle className="ivories-fretboard-string-wrap" cx={p.x} cy={p.y} r="7" />
      <circle className="ivories-fretboard-post" cx={p.x} cy={p.y} r="4.5" />
      <path className="ivories-fretboard-post-slot" d={`M${p.x - 3} ${p.y} H${p.x + 3}`} />
    </g>)}
    <g className="ivories-fretboard-string-tree">
      <circle cx={tree.x} cy={tree.y} r={tree.r} />
      <circle className="ivories-fretboard-string-tree-screw" cx={tree.x} cy={tree.y} r="2.5" />
    </g>
  </g>
}

/** Upper body at the neck joint: cutaway horn, bass shoulder, pickguard and neck pickup, cropped at right. */
function TeleBody({ layout, ids }: { layout: TeleLayout; ids: { clip: string; burst: string } }) {
  const body = teleBodyPath(layout)
  const pickup = teleNeckPickup(layout)
  return <g className="ivories-fretboard-body" data-body="tele">
    <defs>
      <clipPath id={ids.clip}><path d={body} /></clipPath>
      <radialGradient id={ids.burst} gradientUnits="userSpaceOnUse" cx={layout.end + 90} cy={(layout.top + layout.bottom) / 2} r="300">
        <stop className="ivories-fretboard-burst-centre" offset="0.42" />
        <stop className="ivories-fretboard-burst-edge" offset="1" />
      </radialGradient>
    </defs>
    <path className="ivories-fretboard-body-finish" d={body} />
    <path className="ivories-fretboard-body-burst" d={body} fill={`url(#${ids.burst})`} />
    <path className="ivories-fretboard-body-rim" d={body} clipPath={`url(#${ids.clip})`} />
    <path className="ivories-fretboard-pickguard" d={telePickguardPath(layout)} clipPath={`url(#${ids.clip})`} />
    {teleScrews(layout).map((s, i) => <circle key={i} className="ivories-fretboard-pickguard-screw" cx={s.x} cy={s.y} r="3.5" />)}
    <path className="ivories-fretboard-body-outline" d={body} />
    <g className="ivories-fretboard-pickup" data-pickup="neck">
      <rect x={pickup.x} y={pickup.y} width={pickup.width} height={pickup.height} rx={pickup.width / 2} />
      {[pickup.y + 13, pickup.y + pickup.height - 13].map((cy) => <circle key={cy} className="ivories-fretboard-pickup-screw" cx={pickup.x + pickup.width / 2} cy={cy} r="3" />)}
    </g>
  </g>
}

/** Pure SVG view for static cards or host-controlled pitches; no provider required. */
export function FretboardDiagram({ instrument = 'guitar', headstock, noteLabels = 'note', appearance = 'dark', frets = 12,
  pitches = [], livePitches = [], className, style, theme = 'classic', height }: FretboardDiagramProps) {
  const tuning = FRETBOARD_TUNINGS[instrument]
  const silhouette = headstockFor(instrument, headstock)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const tele = silhouette === 'tele' ? teleLayout(frets) : undefined
  const width = tele?.width ?? (frets === 24 ? 2300 : 1260)
  const viewHeight = tele?.height ?? 340
  const nut = tele?.nut ?? 320, top = tele?.top ?? 80, bottom = top + 180
  const length = tele?.length ?? width - nut - 25
  const neckEnd = tele?.end ?? nut + length
  const stringEnd = tele ? width + 10 : width - 25
  const boundary = (fret: number) => nut + fretBoundary(fret, frets, length)
  const center = (fret: number) => fret === 0 ? nut - 25 : (boundary(fret - 1) + boundary(fret)) / 2
  const y = (string: number) => top + 15 + (tuning.length - 1 - string) * (150 / (tuning.length - 1))
  /** Strings start at their own tuner post on the Tele; the treble pair dips under the string tree. */
  const stringPath = (string: number) => {
    if (!tele) return `M${nut - 44} ${y(string)} H${stringEnd}`
    const k = tuning.length - 1 - string, post = telePosts(tele)[k], tree = teleStringTree(tele)
    const via = k < 2 ? ` L${tree.x} ${k === 0 ? tree.y - tree.r : tree.y + tree.r}` : ''
    return `M${post.x} ${post.y}${via} L${nut} ${y(string)} H${stringEnd}`
  }
  const all = [...new Set([...pitches, ...livePitches])].sort((a, b) => a - b)
  const positions = exactPitchPositions(all, instrument, frets)
  const placed = new Set(positions.map((p) => p.midi))
  const outside = all.filter((p) => !placed.has(p))
  const live = new Set(livePitches)
  const name = instrument === 'guitar' ? 'Guitar' : instrument === 'bass4' ? '4-string bass' : '5-string bass'
  const art = tele ? `${STYLE_NAME[silhouette]}-inspired headstock and upper body` : `${STYLE_NAME[silhouette]}-inspired headstock`
  return <div className={cx('ivories', 'ivories-view', 'ivories-fretboard', `ivories-theme-${theme}`, className)}
    data-ivories-view="fretboard" data-appearance={appearance} data-instrument={instrument} data-note-labels={noteLabels} data-headstock-style={silhouette}
    style={{ ...style, ...(height !== undefined ? { height } : {}) }}>
    <div className="ivories-fretboard-heading"><strong>{name}</strong><span>Exact pitch · all positions</span></div>
    <div className="ivories-fretboard-scroll" tabIndex={0} role="region" aria-label={`${name} fretboard, scroll horizontally to see all frets`}>
      <svg className="ivories-fretboard-svg" viewBox={`0 0 ${width} ${viewHeight}`} style={{ minWidth: tele?.minWidth ?? (frets === 24 ? 1840 : 1008) }} role="img"
        aria-label={`${name}, ${art}, high string at top. ${all.length ? `Sounding: ${all.map((p) => fretNoteName(p, true)).join(', ')}.` : 'No sounding notes.'} ${noteLabels === 'note' ? 'Note' : 'Fret'} labels.`}>
        {tele && <defs>
          <linearGradient id={`${uid}-fade`} gradientUnits="userSpaceOnUse" x1={width - TELE_FADE} x2={width} y1="0" y2="0">
            <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" />
          </linearGradient>
          <mask id={`${uid}-crop`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={viewHeight}>
            <rect width={width} height={viewHeight} fill={`url(#${uid}-fade)`} />
          </mask>
        </defs>}
        <g className="ivories-fretboard-instrument" mask={tele ? `url(#${uid}-crop)` : undefined}>
          {tele ? <g className="ivories-fretboard-headstock" data-headstock="tele">
            <TeleKeys layout={tele} />
            <path className="ivories-fretboard-wood" d={teleHeadstockPath(tele)} />
          </g> : silhouette !== 'tele' && <Headstock style={silhouette} strings={tuning.length} />}
          {tele && <TeleBody layout={tele} ids={{ clip: `${uid}-body`, burst: `${uid}-burst` }} />}
          <rect className="ivories-fretboard-neck" x={nut} y={top} width={neckEnd - nut} height="180" rx="5" />
          {[3, 5, 7, 9, 12, 15, 17, 19, 21, 24].filter((f) => f <= frets).map((f) => <g key={f} className="ivories-fretboard-inlay">
            {((f % 12 === 0) ? [top + 45, top + 135] : [top + 90]).map((cy) => <circle key={cy} cx={center(f)} cy={cy} r="6" />)}
          </g>)}
          {Array.from({ length: frets }, (_, i) => i + 1).map((f) =>
            <line key={f} className="ivories-fretboard-fret" x1={boundary(f)} x2={boundary(f)} y1={top} y2={bottom} />)}
          <rect className="ivories-fretboard-nut" x={nut - 4} y={top} width="8" height="180" rx="2" />
          {tuning.map((_, string) => <path key={string} className="ivories-fretboard-string" data-string={string} d={stringPath(string)}
            style={{ strokeWidth: 1 + (tuning.length - 1 - string) * (instrument === 'guitar' ? 0.38 : 0.65) }} />)}
          {tele && <TelePosts layout={tele} />}
        </g>
        {Array.from({ length: frets + 1 }, (_, f) => <text key={f} className="ivories-fretboard-number" x={center(f)} y={bottom + 28}>{f}</text>)}
        {tuning.map((open, string) => <g key={string} className="ivories-fretboard-tuning-group">
          <rect className="ivories-fretboard-tuning-badge" x={nut - 78} y={y(string) - 10} width="32" height="20" rx="5" />
          <text className="ivories-fretboard-tuning" x={nut - 62} y={y(string)}>{fretNoteName(open, true)}</text>
        </g>)}
        {positions.map((p) => <g key={`${p.string}:${p.fret}`} className="ivories-fretboard-note" data-string={p.string} data-fret={p.fret} data-midi={p.midi} data-live={live.has(p.midi)}>
          <title>{fretNoteName(p.midi, true)}, string {tuning.length - p.string}, {p.fret === 0 ? 'open' : `fret ${p.fret}`}</title>
          <circle cx={center(p.fret)} cy={y(p.string)} r="13" />
          <text x={center(p.fret)} y={y(p.string)}>{noteLabels === 'fret' ? p.fret : fretNoteName(p.midi)}</text>
        </g>)}
        <text className="ivories-fretboard-caption" x={nut} y={bottom + 61}>HIGH STRING AT TOP · OPEN STRINGS AT 0</text>
      </svg>
    </div>
    <div className="ivories-fretboard-footer"><span>Every matching location; not a playable fingering.</span>
      <span>{outside.length ? `Outside displayed range: ${outside.map((p) => fretNoteName(p, true)).join(', ')}` : all.length ? `${all.length} sounding ${all.length === 1 ? 'pitch' : 'pitches'}` : 'Play a score or connect MIDI to light notes.'}</span>
    </div>
  </div>
}

export interface FretboardProps extends Omit<FretboardDiagramProps, 'pitches' | 'livePitches'> {
  input?: 'none' | 'midi'
  template?: TemplateRef
}
function FretboardView({ input = 'none', template, ...props }: FretboardProps) {
  const iv = useIvories()
  const active = useActiveNotes()
  useEffect(() => input === 'midi' ? iv.live.enable() : undefined, [input, iv.live])
  const ref = template ?? (props.theme ? undefined : iv.settings.theme.template)
  const tpl = resolveTemplate(ref)
  return <FretboardDiagram {...props} theme={props.theme ?? (ref ? tpl.cssTheme : iv.settings.theme.name)}
    style={{ ...(ref ? tpl.tokens as CSSProperties : {}), ...(iv.settings.theme.stageBgOverride ? { '--ivories-stage-bg': iv.settings.theme.stageBgOverride } : {}), ...props.style } as CSSProperties}
    pitches={[...active.score.keys()]} livePitches={[...active.live.keys()]} />
}
/** Score and live MIDI view, using the nearest provider's existing clock and active-note feed. */
export const Fretboard = withProvider(FretboardView, 'Fretboard')
