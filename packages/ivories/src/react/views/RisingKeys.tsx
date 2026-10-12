import { StageView } from './StageView'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import type { StageViewProps } from './StageView'
import type { Orientation } from '../../core/layout/types'

export interface RisingKeysProps extends StageViewProps {
  /** Live MIDI input: 'midi' lights, sounds (with liveAudio) and draws live notes rising from the keys. */
  input?: 'none' | 'midi'
  /** 'horizontal': keyboard up the left edge, notes leave it to the right. Default vertical. */
  orientation?: Orientation
  /** Beats visible between the keyboard and the far edge (default 8, 1-64). */
  visibleBeats?: number
  /** Live mode (no score): beats per bar for the stronger grid line (default 4). */
  beatsPerBar?: number
  /** Beat and bar grid lines (default true). */
  beatGrid?: boolean
}

function RisingKeysView(props: RisingKeysProps) {
  return <Guarded><StageView {...props} kind="rising" /></Guarded>
}

/**
 * Notes emitted at the keyboard that drift away from it (rising-roll spec §2).
 * Score notes on the score's clock, live notes on the provider clock; without a
 * score it runs on the provider's free-running live clock at `bpm`.
 */
export const RisingKeys = withProvider(RisingKeysView, 'RisingKeys')
