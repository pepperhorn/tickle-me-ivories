import { createContext } from 'react'
import type { AudioEngine } from '../core/audio/engine'
import type { Clock } from '../core/clock/types'
import type { FrameLoop } from '../core/render/frameLoop'
import type { IvoriesError } from '../core/errors'
import type { LiveNote } from '../core/midi/types'
import type { MidiNoteEvent } from '../core/midi/MidiInput'
import type { TrailNote } from '../core/midi/trail'
import type { NoteEvent, ScoreDocument, TempoSetting } from '../core/model/types'
import type { AudioSettings, Settings } from '../core/settings/types'
import type { ValueStore } from './ValueStore'
import type { CountInBars, LeadIn } from '../core/model/countIn'

export interface IvoriesNoteEvent { midi: number; velocity: number; time: number; source: 'score' | 'live' }
export interface ActiveNotes { score: ReadonlyMap<number, NoteEvent>; live: ReadonlyMap<number, LiveNote> }
export interface ProviderStatus { loading: boolean; error: IvoriesError | null }

export interface IvoriesContextValue {
  score: ScoreDocument | null
  /** The TempoSetting the score is timed at (scale 1 except a studio-retimed controlled score). */
  tempo: TempoSetting
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
  /** Live BPM (no score): speed and grid of the rising roll (R-P). */
  bpm: number
  /** Clamped to 20-300 and rounded; non-finite values are ignored; calls onBpmChange. */
  setBpm(bpm: number): void
  /** A rising view without a score asks for the free-running live clock; returns the release (R-L). Stable. */
  requestLiveClock(): () => void
  /** The provider's free-running live clock is the active clock (no score source, no host clock; R-L). BPM only matters then. */
  liveClockActive: boolean
  /** Starts playback: from the top it runs the count-in first (see IvoriesProviderProps.countIn). Stable per clock. */
  play(): void
  /** Bars of count-in (0, 1, 2) and its setter (the Transport's Count-in select). */
  countIn: CountInBars
  setCountIn(bars: CountInBars): void
  /** The lead-in a Play from the top runs before t = 0 (beats = 0: a silent pre-roll). */
  lead: LeadIn
  /** Beats per counted bar, for the on-stage count ("1 2 3 4 1 2 3 4"). */
  countInPerBar: number
  /** Views draw the count during the lead-in (provider prop showCountIn). */
  showCountIn: boolean
  /** Live MIDI input (spec §4.1), started only while a view asks for it. */
  live: {
    held: ValueStore<ReadonlyMap<number, LiveNote>>
    /** Live notes stamped on this provider's clock, for the rising roll (R-T). */
    trail: ValueStore<readonly TrailNote[]>
    /** Starts MIDI input (ref-counted); returns the release. */
    enable(): () => void
    /** Every live note event, on and off; returns the unsubscribe. */
    subscribe(fn: (e: MidiNoteEvent) => void): () => void
  }
}

export const IvoriesContext = createContext<IvoriesContextValue | null>(null)
