import { IvoriesProvider } from '../IvoriesProvider'
import { Keyboard } from './Keyboard'
import { FallingKeys } from './FallingKeys'
import { RisingKeys } from './RisingKeys'
import { Transport } from './Transport'
import { Notation } from '../notation/Notation'
import { cx } from '../cx'
import type { PepperScoreClockHandle } from '../notation/loadPepperscore'
import type { NotationTheme } from '../notation/Notation'
import type { Ref } from 'react'
import type { IvoriesProviderProps } from '../IvoriesProvider'
import type { TransportControls } from './Transport'
import type { LabelsProp } from './labels'
import type { Orientation } from '../../core/layout/types'

export type IvoriesPreset = 'falling' | 'rising' | 'keyboard' | 'keyboard+notation' | 'endless+falling' | 'endless+keyboard'
/** Same semantics as pepperscore: full controls, a play button, or none. */
export type Chrome = 'full' | 'minimal' | 'none'

export interface IvoriesProps extends IvoriesProviderProps {
  view?: IvoriesPreset
  chrome?: Chrome
  labels?: LabelsProp
  height?: number | string
  className?: string
  range?: 'full' | [number, number]
  lookahead?: number
  input?: 'none' | 'midi'
  /** Notation zoom for the notation presets. */
  zoom?: number
  /** Handle of the pepperscore clock-driven notation, for the notation presets. */
  notationRef?: Ref<PepperScoreClockHandle>
  /** Notation presets: `paper` (default, a light card) or `ink-on-dark` (light engraving on the dark stage). */
  notationTheme?: NotationTheme
  /** The main roll view's orientation (falling and rising presets). Default vertical. */
  orientation?: Orientation
  /** Rising preset: beats visible above the keys (default 8). */
  visibleBeats?: number
  /** Rising preset, live mode: beats per bar for the grid (default 4). */
  beatsPerBar?: number
}

const MINIMAL: TransportControls = { seek: false, tempo: false, metronome: false, bpm: false }
const slug = (v: string) => v.replace(/\+/g, '-')

/** One-line preset combos (spec §4). Always its own provider; `ref` is the provider handle. */
export function Ivories(props: IvoriesProps) {
  const {
    view = 'falling', chrome = 'full', labels, height, className, range, lookahead, input, zoom, notationRef, notationTheme,
    orientation, visibleBeats, beatsPerBar, ...provider
  } = props
  const notation = view === 'keyboard+notation' ? 'vertical' : view.startsWith('endless') ? 'endless' : null
  const keysOnly = view === 'keyboard' || view === 'keyboard+notation' || view === 'endless+keyboard'
  const main = view === 'rising'
    ? <RisingKeys labels={labels} range={range} input={input} orientation={orientation} visibleBeats={visibleBeats} beatsPerBar={beatsPerBar} />
    : keysOnly
      ? <Keyboard labels={labels} range={range} input={input} />
      : <FallingKeys labels={labels} range={range} lookahead={lookahead} input={input} orientation={orientation} />
  return (
    <IvoriesProvider {...provider}>
      <div className={cx('ivories', 'ivories-preset', `ivories-preset-${slug(view)}`, className)} style={height !== undefined ? { height } : undefined}>
        {notation && <div className="ivories-preset-notation"><Notation view={notation} zoom={zoom} scoreRef={notationRef} notationTheme={notationTheme} /></div>}
        <div className="ivories-preset-main" data-with-notation={notation ? '' : undefined}>{main}</div>
        {chrome !== 'none' && <Transport controls={chrome === 'minimal' ? MINIMAL : undefined} />}
      </div>
    </IvoriesProvider>
  )
}
