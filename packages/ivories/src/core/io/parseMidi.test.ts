import { describe, it, expect } from 'vitest'
import { Midi } from '@tonejs/midi'
import { parseMidi, retimeScore } from './parseMidi'
import { LEFT_VOICE, RIGHT_VOICE } from './handSplit'
import type { TempoSetting } from '../model/types'

const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }

/** Build a MIDI file in memory so the test needs no fixture on disk. */
function makeMidi(tracks: { name: string; notes: [number, number, number][] }[]): ArrayBuffer {
  const midi = new Midi()
  midi.header.setTempo(120)
  for (const t of tracks) {
    const track = midi.addTrack()
    track.name = t.name
    for (const [pitch, time, dur] of t.notes) {
      track.addNote({ midi: pitch, time, duration: dur, velocity: 0.8 })
    }
  }
  return midi.toArray().buffer as ArrayBuffer
}

describe('parseMidi', () => {
  it('reads notes with pitch, timing and velocity', () => {
    const s = parseMidi(makeMidi([{ name: 'Piano', notes: [[60, 0, 0.5]] }]), 'a.mid', SCALE_1)
    expect(s.notes).toHaveLength(1)
    expect(s.notes[0].pitch).toBe(60)
    expect(s.notes[0].startSec).toBeCloseTo(0, 3)
    expect(s.notes[0].endSec).toBeCloseTo(0.5, 2)
    expect(s.notes[0].velocity).toBeGreaterThan(90)
  })

  it('returns notes sorted by startSec', () => {
    const s = parseMidi(makeMidi([
      { name: 'P', notes: [[72, 1, 0.2], [60, 0, 0.2], [64, 0.5, 0.2]] },
    ]), 'a.mid', SCALE_1)
    const starts = s.notes.map((n) => n.startSec)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  it('makes one voice per track when the file has several', () => {
    const s = parseMidi(makeMidi([
      { name: 'Right', notes: [[72, 0, 1]] },
      { name: 'Left', notes: [[40, 0, 1]] },
    ]), 'a.mid', SCALE_1)
    expect(s.voices).toHaveLength(2)
    expect(s.voices.map((v) => v.label)).toEqual(['Right', 'Left'])
    expect(new Set(s.notes.map((n) => n.voiceId)).size).toBe(2)
  })

  it('hand-splits a single-track file into left and right voices', () => {
    const s = parseMidi(makeMidi([
      { name: 'Piano', notes: [[40, 0, 1], [72, 0, 1]] },
    ]), 'a.mid', SCALE_1)
    expect(s.voices.map((v) => v.id).sort()).toEqual([LEFT_VOICE, RIGHT_VOICE].sort())
    expect(s.notes.find((n) => n.pitch === 40)!.voiceId).toBe(LEFT_VOICE)
    expect(s.notes.find((n) => n.pitch === 72)!.voiceId).toBe(RIGHT_VOICE)
  })

  it('assigns distinct hues to the voices', () => {
    const s = parseMidi(makeMidi([
      { name: 'R', notes: [[72, 0, 1]] }, { name: 'L', notes: [[40, 0, 1]] },
    ]), 'a.mid', SCALE_1)
    expect(s.voices[0].hue).not.toBe(s.voices[1].hue)
  })

  it('reports a duration covering the last note', () => {
    const s = parseMidi(makeMidi([{ name: 'P', notes: [[60, 0, 0.5], [62, 2, 1]] }]), 'a.mid', SCALE_1)
    expect(s.durationSec).toBeGreaterThanOrEqual(3)
  })

  it('drops empty tracks rather than creating colourless voices', () => {
    const midi = new Midi()
    midi.header.setTempo(120)
    midi.addTrack().name = 'Empty'
    const a = midi.addTrack(); a.name = 'Right'
    a.addNote({ midi: 72, time: 0, duration: 1, velocity: 0.8 })
    const b = midi.addTrack(); b.name = 'Left'
    b.addNote({ midi: 40, time: 0, duration: 1, velocity: 0.8 })
    const s = parseMidi(midi.toArray().buffer as ArrayBuffer, 'a.mid', SCALE_1)
    expect(s.voices).toHaveLength(2)
    expect(s.voices.map((v) => v.label)).toEqual(['Right', 'Left'])
  })

  it('defaults to 4/4 from tick 0 when the file carries no time signature', () => {
    const s = parseMidi(makeMidi([{ name: 'Piano', notes: [[60, 0, 0.5]] }]), 'x.mid', SCALE_1)
    expect(s.timeSignatures).toEqual([{ ticks: 0, numerator: 4, denominator: 4 }])
  })

  it('reads every time signature with its denominator', () => {
    const midi = new Midi()
    midi.header.setTempo(120)
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [6, 8] })
    midi.header.timeSignatures.push({ ticks: 1920, timeSignature: [2, 2] })
    const track = midi.addTrack()
    track.name = 'Piano'
    track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 })
    const s = parseMidi(midi.toArray().buffer as ArrayBuffer, 'x.mid', SCALE_1)
    expect(s.timeSignatures).toEqual([
      { ticks: 0, numerator: 6, denominator: 8 },
      { ticks: 1920, numerator: 2, denominator: 2 },
    ])
  })

  it('hand-splits a file whose only pitched track sits behind a conductor track', () => {
    // Type 1 MIDI almost always has a meta-only track 0. That must not stop
    // the hand split: the file still has exactly one PITCHED track.
    const midi = new Midi()
    midi.header.setTempo(120)
    midi.addTrack().name = 'Conductor'          // tempo/meta only, no notes
    const piano = midi.addTrack(); piano.name = 'Piano'
    piano.addNote({ midi: 40, time: 0, duration: 1, velocity: 0.8 })
    piano.addNote({ midi: 72, time: 0, duration: 1, velocity: 0.8 })
    const s = parseMidi(midi.toArray().buffer as ArrayBuffer, 'a.mid', SCALE_1)
    expect(s.voices.map((v) => v.id).sort()).toEqual([LEFT_VOICE, RIGHT_VOICE].sort())
    expect(s.notes.find((n) => n.pitch === 40)!.voiceId).toBe(LEFT_VOICE)
    expect(s.notes.find((n) => n.pitch === 72)!.voiceId).toBe(RIGHT_VOICE)
  })

  it('carries null for a file with no key signature', () => {
    const s = parseMidi(makeMidi([{ name: 'Piano', notes: [[60, 0, 0.5]] }]), 'x.mid', SCALE_1)
    expect(s.keySignature).toBeNull()
  })

  it('reads a minor key signature, correcting the tonic to the true minor (F34)', () => {
    // @tonejs/midi's own encoder round-trips the `key` field as undefined
    // (Encode.ts double-applies the +7 offset that Header.ts's decoder also
    // applies), so a fixture built via `header.keySignatures.push(...)` and
    // `midi.toArray()` cannot be used here. This builds the raw Standard MIDI
    // File bytes directly: a key-signature meta event with sf = -3 (3 flats,
    // C natural minor: Bb, Eb, Ab) and scale = 1 (minor), a tempo, one note,
    // and end-of-track. @tonejs/midi decodes sf=-3 as the major key sharing
    // those 3 flats, Eb -- reporting { key: 'Eb', scale: 'minor' } -- which is
    // exactly the wrong-tonic case F34 exists to correct back to C minor.
    const bytes = new Uint8Array([
      // MThd: format 0, 1 track, 480 ticks/quarter
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
      // MTrk
      0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x15,
      0x00, 0xff, 0x59, 0x02, 0xfd, 0x01,       // delta0 keySignature sf=-3 scale=1(minor)
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // delta0 setTempo 500000us (120bpm)
      0x00, 0x90, 0x3c, 0x50,                   // delta0 noteOn ch0 pitch60 vel80
      0x83, 0x60, 0x80, 0x3c, 0x00,             // delta480 noteOff ch0 pitch60
      0x00, 0xff, 0x2f, 0x00,                   // delta0 endOfTrack
    ])
    const s = parseMidi(bytes.buffer, 'minor.mid', SCALE_1)
    expect(s.keySignature).toEqual({ key: 'C', scale: 'minor' })
  })
})

describe('retimeScore', () => {
  it('halves every note time at scale 2 without touching ticks', () => {
    const s = parseMidi(makeMidi([{ name: 'P', notes: [[60, 2, 1]] }]), 'a.mid', SCALE_1)
    const fast = retimeScore(s, { mode: 'scale', scale: 2 })
    expect(fast.notes[0].startSec).toBeCloseTo(s.notes[0].startSec / 2, 6)
    expect(fast.notes[0].startTicks).toBe(s.notes[0].startTicks)
  })

  it('keeps the note array sorted after retiming', () => {
    const s = parseMidi(makeMidi([{ name: 'P', notes: [[60, 0, 1], [62, 1, 1], [64, 2, 1]] }]), 'a.mid', SCALE_1)
    const out = retimeScore(s, { mode: 'absolute', bpm: 200 }).notes.map((n) => n.startSec)
    expect([...out].sort((a, b) => a - b)).toEqual(out)
  })

  it('does not mutate the original score', () => {
    const s = parseMidi(makeMidi([{ name: 'P', notes: [[60, 2, 1]] }]), 'a.mid', SCALE_1)
    const before = s.notes[0].startSec
    retimeScore(s, { mode: 'scale', scale: 4 })
    expect(s.notes[0].startSec).toBe(before)
  })
})
