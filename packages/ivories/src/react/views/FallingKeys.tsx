import { useEffect } from 'react'
import { StageView } from './StageView'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import type { StageViewProps } from './StageView'
import type { Orientation } from '../../core/layout/types'

export interface FallingKeysProps extends StageViewProps {
  /** Seconds of music visible above the keys (default: the provider's fallSeconds). */
  lookahead?: number
  /** Live MIDI input (spec §4.1): 'midi' lights, reports and (with the provider's liveAudio) sounds
      live keys while this view is mounted. Default 'none'. */
  input?: 'none' | 'midi'
  /**
   * @deprecated Falling is vertical only: 'horizontal' is ignored (the view draws
   * vertical) and warns once. For a horizontal roll use <RisingKeys orientation="horizontal">,
   * whose tiles emanate from the keys.
   */
  orientation?: Orientation
}

let warnedHorizontal = false

function FallingKeysView(props: FallingKeysProps) {
  const horizontal = props.orientation === 'horizontal'
  useEffect(() => {
    if (!horizontal || warnedHorizontal || isProduction()) return
    warnedHorizontal = true
    console.warn('[ivories] <FallingKeys orientation="horizontal"> is deprecated and draws vertical. Use <RisingKeys orientation="horizontal"> (tiles emanate from the keys).')
  }, [horizontal])
  return <Guarded><StageView {...props} orientation={undefined} kind="falling" /></Guarded>
}

function isProduction(): boolean {
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
  return env === 'production'
}

/** The falling roll over the keyboard (today's roll mode). */
export const FallingKeys = withProvider(FallingKeysView, 'FallingKeys')
