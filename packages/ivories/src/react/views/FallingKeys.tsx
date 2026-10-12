import { StageView } from './StageView'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import type { StageViewProps } from './StageView'

export interface FallingKeysProps extends StageViewProps {
  /** Seconds of music visible above the keys (default: the provider's fallSeconds). */
  lookahead?: number
  /** Live input (Task 17). */
  input?: 'none' | 'midi'
}

function FallingKeysView({ input: _input, ...props }: FallingKeysProps) {
  return <Guarded><StageView {...props} kind="falling" /></Guarded>
}

/** The falling roll over the keyboard (today's roll mode). */
export const FallingKeys = withProvider(FallingKeysView, 'FallingKeys')
