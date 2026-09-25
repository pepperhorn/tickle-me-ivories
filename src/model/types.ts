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
  visible: boolean
  audible: boolean
  volume: number         // 0-1
}

export interface TempoEvent {
  ticks: number
  sec: number            // seconds at this tick, at the file's own tempi
  bpm: number
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
  beatsPerBar: number    // from the file's first time signature; 4 if absent
}
