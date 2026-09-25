import { Midi } from '@tonejs/midi'
import { Key } from 'tonal'
import { buildTempoMap, ticksToSec } from '../model/tempoMap'
import { normaliseTimeSignatures } from '../model/timeSignatures'
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
  // @tonejs/midi exposes timeSignature as [numerator, denominator].
  const timeSignatures = normaliseTimeSignatures(midi.header.timeSignatures.map((ts) => ({
    ticks: ts.ticks, numerator: ts.timeSignature?.[0] ?? 4, denominator: ts.timeSignature?.[1] ?? 4,
  })))

  // @tonejs/midi's KeySignatureEvent is { ticks, key, scale }, e.g. { key: 'Ab', scale: 'major' }.
  // F34: for a minor key it reports the MAJOR key sharing the same accidental
  // count (Header.js derives `key` from the accidental count alone, ignoring
  // `scale`), so an A-minor file (no sharps/flats) comes back as key: 'C',
  // scale: 'minor'. Recover the true minor tonic via its relative major.
  const rawKeySig = midi.header.keySignatures[0]
  const keySignature = rawKeySig
    ? {
        key: rawKeySig.scale === 'minor'
          ? Key.majorKey(rawKeySig.key).minorRelative
          : rawKeySig.key,
        scale: rawKeySig.scale,
      }
    : null

  const played = midi.tracks.filter((t) => t.notes.length > 0)
  const notes: NoteEvent[] = []
  let voices: Voice[] = []
  let id = 0

  // The hand-split decision is made on the count of PITCHED tracks (tracks
  // with at least one note), not the raw track count: Type 1 MIDI files
  // almost always carry a conductor track (tempo/meta only, no notes) ahead
  // of the piano track, and that must not stop the hand split from firing.
  if (played.length === 1) {
    // One pitched track: split into two hands so the roll is legible.
    voices = [
      makeVoice(LEFT_VOICE, 'Left hand', 0, 2),
      makeVoice(RIGHT_VOICE, 'Right hand', 1, 2),
    ]
    const raw = played[0].notes.map((n) => ({
      id: id++, pitch: n.midi, startTicks: n.ticks, durTicks: n.durationTicks,
      startSec: 0, endSec: 0, velocity: Math.round(n.velocity * 127), voiceId: LEFT_VOICE,
    }))
    const assign = splitHands(raw, DEFAULT_SPLIT_PITCH)
    raw.forEach((n, i) => { n.voiceId = assign[i].voiceId })
    notes.push(...raw)
  } else {
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
    id: '', name, ppq, tempoMap, voices, notes,
    durationSec: 0, sourceFormat: 'midi', timeSignatures, keySignature,
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
