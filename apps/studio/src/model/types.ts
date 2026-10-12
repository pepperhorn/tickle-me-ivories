/** Moved here from transport/useTransport.ts (preflight F4): this module has
    no runtime imports, so anything platform/types.ts needs must live in a
    type-only module like this one, not one that drags in zustand. useTransport
    re-exports this so no call site changes. */
export type DisplayMode = 'keyboard' | 'roll'

export interface NoteEvent {
  id: number
  pitch: number          // MIDI 0-127; 21-108 are on the keyboard
  startTicks: number
  durTicks: number
  startSec: number       // derived from tempoMap + TempoSetting
  endSec: number
  velocity: number       // 0-127
  voiceId: string
}

export interface Voice {
  id: string
  label: string
  hue: number            // 0-360
  instrument: string     // smplr instrument id
  /** Where the voice came from (spec §4). Set for MusicXML voices; absent otherwise. */
  source?: { kind: 'midi-track'; index: number; channel: number } | { kind: 'xml-part'; partId: string; staff: number }
  visible: boolean
  audible: boolean
  volume: number         // 0-1
  /** Unpitched percussion (spec §6.1): its bars fall on the roll, but it never
      lights keyboard keys (or the key flash, or the chord readout). */
  percussion?: boolean
}

export interface TempoEvent {
  ticks: number
  sec: number            // seconds at this tick, at the file's own tempi
  bpm: number
}

/** A MIDI time-signature meta event: `numerator`/`denominator` as written, e.g. 6/8. */
export interface TimeSigEvent {
  ticks: number
  numerator: number
  denominator: number
}

export type TempoSetting =
  | { mode: 'scale'; scale: number }
  | { mode: 'absolute'; bpm: number }

export interface ScoreDocument {
  id: string
  name: string
  ppq: number
  tempoMap: TempoEvent[]
  voices: Voice[]
  notes: NoteEvent[]     // sorted ascending by startSec
  durationSec: number
  sourceFormat: 'midi' | 'musicxml'
  /** Every time signature in the file, sorted, starting at tick 0 (4/4 when
      the file carries none). The metronome's pulse and accents come from it. */
  timeSignatures: TimeSigEvent[]
  /** From the MIDI key-signature meta event; null when the file carries none. */
  keySignature: { key: string; scale: string } | null
  /** MusicXML only: the score's XML text, retained verbatim for a later notation view (spec §4). */
  rawXml?: string
}
