import { IvoriesProvider } from '../IvoriesProvider'
import { Keyboard } from './Keyboard'
import { FallingKeys } from './FallingKeys'
import { Transport } from './Transport'
import { Notation } from '../notation/Notation'
import { cx } from '../cx'
import type { PepperScoreClockHandle } from '../notation/loadPepperscore'
import type { Ref } from 'react'
import type { IvoriesProviderProps } from '../IvoriesProvider'
import type { TransportControls } from './Transport'
import type { LabelsProp } from './labels'

export type IvoriesPreset = 'falling' | 'keyboard' | 'keyboard+notation' | 'endless+falling' | 'endless+keyboard'
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
}

const MINIMAL: TransportControls = { seek: false, tempo: false, metronome: false }
const slug = (v: string) => v.replace(/\+/g, '-')

/** One-line preset combos (spec §4). Always its own provider; `ref` is the provider handle. */
export function Ivories(props: IvoriesProps) {
  const { view = 'falling', chrome = 'full', labels, height, className, range, lookahead, input, zoom, notationRef, ...provider } = props
  const notation = view === 'keyboard+notation' ? 'vertical' : view.startsWith('endless') ? 'endless' : null
  const keysOnly = view === 'keyboard' || view === 'keyboard+notation' || view === 'endless+keyboard'
  const main = keysOnly
    ? <Keyboard labels={labels} range={range} input={input} />
    : <FallingKeys labels={labels} range={range} lookahead={lookahead} input={input} />
  return (
    <IvoriesProvider {...provider}>
      <div className={cx('ivories', 'ivories-preset', `ivories-preset-${slug(view)}`, className)} style={height !== undefined ? { height } : undefined}>
        {notation && <div className="ivories-preset-notation"><Notation view={notation} zoom={zoom} scoreRef={notationRef} /></div>}
        <div className="ivories-preset-main" data-with-notation={notation ? '' : undefined}>{main}</div>
        {chrome !== 'none' && <Transport controls={chrome === 'minimal' ? MINIMAL : undefined} />}
      </div>
    </IvoriesProvider>
  )
}
