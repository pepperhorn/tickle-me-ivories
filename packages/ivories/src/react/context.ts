import { createContext } from 'react'
import type { AudioEngine } from '../core/audio/engine'
import type { Clock } from '../core/clock/types'
import type { FrameLoop } from '../core/render/frameLoop'
import type { IvoriesError } from '../core/errors'
import type { LiveNote } from '../core/midi/types'
import type { NoteEvent, ScoreDocument } from '../core/model/types'
import type { AudioSettings, Settings } from '../core/settings/types'
import type { ValueStore } from './ValueStore'

export interface IvoriesNoteEvent { midi: number; velocity: number; time: number; source: 'score' | 'live' }
export interface ActiveNotes { score: ReadonlyMap<number, NoteEvent>; live: ReadonlyMap<number, LiveNote> }
export interface ProviderStatus { loading: boolean; error: IvoriesError | null }

export interface IvoriesContextValue {
  score: ScoreDocument | null
  clock: Clock
  engine: AudioEngine
  settings: Settings
  fallSeconds: number
  maxNoteDur: number
  /** This provider schedules audio (spec §3.1 rule). */
  audio: boolean
  frames: FrameLoop
  active: ValueStore<ActiveNotes>
  status: ValueStore<ProviderStatus>
  setAudio(patch: Partial<AudioSettings>): void
  reportError(e: IvoriesError): void
}

export const IvoriesContext = createContext<IvoriesContextValue | null>(null)
