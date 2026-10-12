import { StageView } from './StageView'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import type { StageViewProps } from './StageView'

export interface KeyboardProps extends StageViewProps {
  /** Live input (Task 17). */
  input?: 'none' | 'midi'
}

function KeyboardView({ input: _input, ...props }: KeyboardProps) {
  return <Guarded><StageView {...props} kind="keyboard" /></Guarded>
}

/** The 88-key keyboard lit by playback (and live input from Task 17). */
export const Keyboard = withProvider(KeyboardView, 'Keyboard')
