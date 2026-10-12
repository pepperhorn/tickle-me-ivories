import { StageView } from './StageView'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import type { StageViewProps } from './StageView'

export interface KeyboardProps extends StageViewProps {
  /** Live MIDI input (spec §4.1): 'midi' lights, reports and (with the provider's liveAudio) sounds
      live keys while this view is mounted. Default 'none'. */
  input?: 'none' | 'midi'
}

function KeyboardView(props: KeyboardProps) {
  return <Guarded><StageView {...props} kind="keyboard" /></Guarded>
}

/** The 88-key keyboard lit by playback and, with input="midi", live keys. */
export const Keyboard = withProvider(KeyboardView, 'Keyboard')
