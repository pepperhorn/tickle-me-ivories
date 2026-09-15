#!/usr/bin/env node
// Generates docs/demo.mid: a ~30s two-track piece ("Right hand" / "Left hand")
// used as the fixture for docs/screenshots. Two named tracks with notes make
// parseMidi() treat them as two voices directly (see src/io/parseMidi.ts) --
// a single track would trigger hand-splitting and change the voice labels.
//
// Usage: node scripts/make-demo-midi.mjs

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pkg from '@tonejs/midi'
const { Midi } = pkg

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, '../docs/demo.mid')

const BPM = 138
const DURATION_SEC = 30
const SECONDS_PER_BEAT = 60 / BPM
const SIXTEENTH = SECONDS_PER_BEAT / 4

// Simple deterministic PRNG so re-running the script is byte-reproducible.
let seed = 42
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
function randRange(lo, hi) { return lo + rand() * (hi - lo) }
function pick(arr) { return arr[Math.floor(rand() * arr.length)] }

const midi = new Midi()
midi.header.setTempo(BPM)

// Left hand FIRST. parseMidi assigns hues by track index and VOICE_HUES is
// [207, 28] -- left hand blue, right hand orange, matching the reference
// frame the geometry was measured from. Reversing these tracks inverts the
// documented colour scheme.
const leftTrack = midi.addTrack()
leftTrack.name = 'Left hand'
const rightTrack = midi.addTrack()
rightTrack.name = 'Right hand'

// --- Right hand: continuous 16th-note arpeggios, treble range ~60-90 -------
// A rotating set of chord shapes (as scale-degree offsets from a moving
// root) arpeggiated up and down, so the pattern feels musical rather than
// random, while still covering the full treble range with varied contour.
const chordShapes = [
  [0, 4, 7, 12, 16, 19],       // major add9-ish spread
  [0, 3, 7, 10, 15, 19],       // minor7 spread
  [0, 5, 7, 12, 17, 19],       // sus-ish spread
  [0, 4, 7, 11, 16, 19],       // major7 spread
]
const rootCycle = [60, 62, 60, 57, 62, 60, 65, 62] // roots wander around middle C

{
  let t = 0
  let step = 0
  const stepsTotal = Math.ceil(DURATION_SEC / SIXTEENTH)
  while (step < stepsTotal) {
    const phraseBeat = Math.floor(t / (SECONDS_PER_BEAT * 4)) // 4-beat phrase
    const root = rootCycle[phraseBeat % rootCycle.length]
    const shape = chordShapes[phraseBeat % chordShapes.length]
    const idxInPhrase = step % shape.length
    const ascending = Math.floor(phraseBeat / 2) % 2 === 0
    const degIdx = ascending ? idxInPhrase : shape.length - 1 - idxInPhrase
    let pitch = root + shape[degIdx]
    // Keep within roughly MIDI 60-90.
    while (pitch < 60) pitch += 12
    while (pitch > 90) pitch -= 12
    const velocity = randRange(55, 115) / 127
    const dur = SIXTEENTH * randRange(0.85, 0.98)
    if (t + dur <= DURATION_SEC) {
      rightTrack.addNote({ midi: pitch, time: t, duration: dur, velocity })
    }
    t += SIXTEENTH
    step++
  }
}

// --- Left hand: octave bass + chords, bass range ~33-55, on the beat -------
const bassRoots = [45, 45, 43, 41, 45, 48, 40, 43] // roughly A1..C3 area, wanders
const bassShapes = [
  [0, 7, 12],       // root-fifth-octave
  [0, 4, 7],        // triad
  [0, 3, 7],        // minor triad
  [0, 7],            // open fifth
]

{
  let beat = 0
  const totalBeats = Math.ceil(DURATION_SEC / SECONDS_PER_BEAT)
  while (beat < totalBeats) {
    const t = beat * SECONDS_PER_BEAT
    const phrase = Math.floor(beat / 4)
    let root = bassRoots[phrase % bassRoots.length]
    while (root < 33) root += 12
    while (root > 55) root -= 12
    const shape = bassShapes[phrase % bassShapes.length]
    // Longer durations: notes ring across 2 beats (or to end of piece).
    const dur = Math.min(SECONDS_PER_BEAT * 2 * randRange(0.9, 1.0), DURATION_SEC - t)
    if (dur > 0.05) {
      for (const interval of shape) {
        let pitch = root + interval
        while (pitch < 33) pitch += 12
        while (pitch > 60) pitch -= 12
        const velocity = randRange(60, 100) / 127
        leftTrack.addNote({ midi: pitch, time: t, duration: dur, velocity })
      }
    }
    beat += 2 // chord changes every 2 beats, giving "on the beat" bass hits
  }
}

const bytes = midi.toArray()
writeFileSync(OUT_PATH, Buffer.from(bytes))

const rightCount = rightTrack.notes.length
const leftCount = leftTrack.notes.length
console.log(`Wrote ${OUT_PATH}`)
console.log(`  tempo: ${BPM} bpm, duration target: ${DURATION_SEC}s`)
console.log(`  Right hand notes: ${rightCount}`)
console.log(`  Left hand notes: ${leftCount}`)
