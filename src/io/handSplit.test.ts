import { describe, it, expect } from 'vitest'
import { splitHands, LEFT_VOICE, RIGHT_VOICE, DEFAULT_SPLIT_PITCH } from './handSplit'
import type { NoteEvent } from '../model/types'

const note = (pitch: number): NoteEvent => ({
  id: pitch, pitch, startTicks: 0, durTicks: 480,
  startSec: 0, endSec: 0.5, velocity: 100, voiceId: 't0',
})

describe('splitHands', () => {
  it('sends notes below the split point to the left hand', () => {
    expect(splitHands([note(40)], DEFAULT_SPLIT_PITCH)[0].voiceId).toBe(LEFT_VOICE)
  })

  it('sends notes at and above the split point to the right hand', () => {
    expect(splitHands([note(60)], DEFAULT_SPLIT_PITCH)[0].voiceId).toBe(RIGHT_VOICE)
    expect(splitHands([note(84)], DEFAULT_SPLIT_PITCH)[0].voiceId).toBe(RIGHT_VOICE)
  })

  it('defaults the split point to middle C', () => {
    expect(DEFAULT_SPLIT_PITCH).toBe(60)
  })

  it('honours a moved split point', () => {
    expect(splitHands([note(60)], 72)[0].voiceId).toBe(LEFT_VOICE)
    expect(splitHands([note(72)], 72)[0].voiceId).toBe(RIGHT_VOICE)
  })

  it('returns one assignment per note, in order', () => {
    const out = splitHands([note(30), note(90), note(55)], DEFAULT_SPLIT_PITCH)
    expect(out.map((a) => a.voiceId)).toEqual([LEFT_VOICE, RIGHT_VOICE, LEFT_VOICE])
  })
})
