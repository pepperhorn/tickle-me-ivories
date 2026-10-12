import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMusicXml } from './parseMusicXml'

// Shared with pepperscore (pepperscore-clock/validation/fixtures, commit f3b9fc6):
// a pickup bar and tempo 120 -> 60 -> 180 mid-score. Both repos must place
// every onset at the same score-time second within the tolerance.
const xml = readFileSync(join(__dirname, '__fixtures__/clock-contract.musicxml'), 'utf8')
const expected = JSON.parse(readFileSync(join(__dirname, '__fixtures__/clock-contract.expected.json'), 'utf8')) as {
  tolerance: number
  onsets: { measureIndex: number; midi: number; seconds: number }[]
}

describe('clock contract onsets (spec §4.3)', () => {
  it('ivories tempo-map onsets match pepperscore within 1 ms', () => {
    const s = parseMusicXml(xml, 'clock-contract.musicxml', { mode: 'scale', scale: 1 })
    expect(s.notes).toHaveLength(expected.onsets.length)
    for (const o of expected.onsets) {
      const hit = s.notes.find((n) => n.pitch === o.midi && Math.abs(n.startSec - o.seconds) <= expected.tolerance)
      expect(hit, `midi ${o.midi} at ${o.seconds}s (measure ${o.measureIndex})`).toBeDefined()
    }
  })
})
