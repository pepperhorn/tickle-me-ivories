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

  it('defaults beatsPerBar to 4 when the file carries no time signature', () => {
    const s = parseMidi(makeMidi([{ name: 'Piano', notes: [[60, 0, 0.5]] }]), 'x.mid', SCALE_1)
    expect(s.beatsPerBar).toBe(4)
  })

  it("reads beatsPerBar from the file's first time signature", () => {
    const midi = new Midi()
    midi.header.setTempo(120)
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] })
    const track = midi.addTrack()
    track.name = 'Piano'
    track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 })
    const s = parseMidi(midi.toArray().buffer as ArrayBuffer, 'x.mid', SCALE_1)
    expect(s.beatsPerBar).toBe(3)
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
