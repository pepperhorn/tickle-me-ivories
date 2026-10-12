import { useContext } from 'react'
import type { ComponentType } from 'react'
import { IvoriesContext } from './context'
import { IvoriesProvider } from './IvoriesProvider'
import type { IvoriesProviderProps } from './IvoriesProvider'

/** Props a self-contained component hands to the provider it creates (spec §3.2). */
export const PROVIDER_KEYS = [
  'score', 'scoreUrl', 'file', 'musicXml', 'midi', 'clock', 'engine', 'audio', 'tempo',
  'theme', 'look', 'settings', 'fallSeconds', 'liveAudio', 'midiDeviceId',
  'onReady', 'onNoteOn', 'onNoteOff', 'onTimeUpdate', 'onError',
] as const

export type SelfContainedProps = Omit<IvoriesProviderProps, 'children' | 'ref'> & {
  liveAudio?: boolean
  midiDeviceId?: string | null
}

/** Inside a provider: render the view. Outside: wrap it in its own provider. */
export function withProvider<P extends object>(View: ComponentType<P>, displayName: string) {
  function Wrapped(props: P & SelfContainedProps) {
    const inside = useContext(IvoriesContext) !== null
    if (inside) return <View {...props} />
    const providerProps: Record<string, unknown> = {}
    const viewProps: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(props)) {
      if ((PROVIDER_KEYS as readonly string[]).includes(k)) providerProps[k] = v
      if (!(PROVIDER_KEYS as readonly string[]).includes(k) || k === 'theme') viewProps[k] = v
    }
    return (
      <IvoriesProvider {...(providerProps as IvoriesProviderProps)}>
        <View {...(viewProps as P)} />
      </IvoriesProvider>
    )
  }
  Wrapped.displayName = displayName
  return Wrapped
}
