import { buildTempoMap } from '../model/tempoMap'
import type { NoteEvent, ScoreDocument, Voice } from '../model/types'

export interface RecordedNote { midi: number; velocity: number; start: number; end: number }

const PPQ = 480
const BPM = 120
const TICKS_PER_SEC = (PPQ * BPM) / 60

/** A captured performance as a score: one track, tempo 120 (spec §4.2). `id` is set by the caller. */
export function buildRecordedScore(notes: RecordedNote[], name = 'Recording'): ScoreDocument {
  const voice: Voice = {
    id: 'live', label: 'Live', hue: 35, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1,
  }
  const events: NoteEvent[] = notes
    .filter((n) => n.end > n.start)
    .sort((a, b) => a.start - b.start || a.midi - b.midi)
    .map((n, i) => ({
      id: i, pitch: n.midi, velocity: n.velocity, voiceId: voice.id,
      startTicks: Math.round(n.start * TICKS_PER_SEC),
      durTicks: Math.max(1, Math.round((n.end - n.start) * TICKS_PER_SEC)),
      startSec: n.start, endSec: n.end,
    }))
  return {
    id: '', name, ppq: PPQ, tempoMap: buildTempoMap([{ ticks: 0, bpm: BPM }], PPQ),
    voices: [voice], notes: events,
    durationSec: events.reduce((m, n) => Math.max(m, n.endSec), 0),
    sourceFormat: 'midi', timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }], keySignature: null,
  }
}
