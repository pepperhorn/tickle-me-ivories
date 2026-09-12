import { Midi } from '@tonejs/midi'
import { buildTempoMap, ticksToSec } from '../model/tempoMap'
import { hueForVoiceIndex } from '../render/colors'
import { DEFAULT_SPLIT_PITCH, LEFT_VOICE, RIGHT_VOICE, splitHands } from './handSplit'
import type { NoteEvent, ScoreDocument, TempoSetting, Voice } from '../model/types'

const DEFAULT_INSTRUMENT = 'acoustic_grand_piano'

function makeVoice(id: string, label: string, index: number, total: number): Voice {
  return {
    id, label,
    hue: hueForVoiceIndex(index, total),
    instrument: DEFAULT_INSTRUMENT,
    visible: true, audible: true, volume: 1,
  }
}

export function parseMidi(
  bytes: ArrayBuffer, name: string, setting: TempoSetting,
): ScoreDocument {
  const midi = new Midi(bytes)
  const ppq = midi.header.ppq
  const tempoMap = buildTempoMap(
    midi.header.tempos.map((t) => ({ ticks: t.ticks, bpm: t.bpm })), ppq,
  )

  const notes: NoteEvent[] = []
  let voices: Voice[] = []
  let id = 0

  // The hand-split decision is made on the file's own track layout, not on
  // the post-filter count: a file that ships one real track plus an empty
  // placeholder track is still a "several tracks" file for labelling
  // purposes, it just happens to have one track worth keeping.
  if (midi.tracks.length === 1) {
    // One track: split into two hands so the roll is legible.
    voices = [
      makeVoice(LEFT_VOICE, 'Left hand', 0, 2),
      makeVoice(RIGHT_VOICE, 'Right hand', 1, 2),
    ]
    const raw = midi.tracks[0].notes.map((n) => ({
      id: id++, pitch: n.midi, startTicks: n.ticks, durTicks: n.durationTicks,
      startSec: 0, endSec: 0, velocity: Math.round(n.velocity * 127), voiceId: LEFT_VOICE,
    }))
    const assign = splitHands(raw, DEFAULT_SPLIT_PITCH)
    raw.forEach((n, i) => { n.voiceId = assign[i].voiceId })
    notes.push(...raw)
  } else {
    const played = midi.tracks.filter((t) => t.notes.length > 0)
    voices = played.map((t, i) =>
      makeVoice(`track-${i}`, t.name?.trim() || `Track ${i + 1}`, i, played.length))
    played.forEach((t, i) => {
      for (const n of t.notes) {
        notes.push({
          id: id++, pitch: n.midi, startTicks: n.ticks, durTicks: n.durationTicks,
          startSec: 0, endSec: 0, velocity: Math.round(n.velocity * 127),
          voiceId: `track-${i}`,
        })
      }
    })
  }

  const score: ScoreDocument = {
    id: '', name, ppq, tempoMap, voices, notes, durationSec: 0, sourceFormat: 'midi',
  }
  return retimeScore(score, setting)
}

/**
 * Recomputes seconds from ticks under a new tempo setting. Ticks are the truth;
 * seconds are always derived, so tempo can be changed repeatedly without the
 * score degrading. Returns a new object -- callers rely on immutability.
 */
export function retimeScore(score: ScoreDocument, setting: TempoSetting): ScoreDocument {
  const notes = score.notes.map((n) => ({
    ...n,
    startSec: ticksToSec(score.tempoMap, score.ppq, n.startTicks, setting),
    endSec: ticksToSec(score.tempoMap, score.ppq, n.startTicks + n.durTicks, setting),
  }))
  notes.sort((a, b) => a.startSec - b.startSec)
  const durationSec = notes.reduce((m, n) => Math.max(m, n.endSec), 0)
  return { ...score, notes, durationSec }
}
