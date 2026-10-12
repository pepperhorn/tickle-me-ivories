import type { NoteEvent } from '../model/types'

export const LEFT_VOICE = 'hand-left'
export const RIGHT_VOICE = 'hand-right'
export const DEFAULT_SPLIT_PITCH = 60   // middle C

/**
 * Most piano MIDI puts both hands in one track. Split at a movable pitch;
 * notes at or above the split point are the right hand.
 */
export function splitHands(notes: NoteEvent[], splitPitch: number): { voiceId: string }[] {
  return notes.map((n) => ({ voiceId: n.pitch >= splitPitch ? RIGHT_VOICE : LEFT_VOICE }))
}
