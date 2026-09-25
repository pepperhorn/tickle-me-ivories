import type { TimeSigEvent } from './types'

const FOUR_FOUR = { numerator: 4, denominator: 4 }

const isPowerOfTwo = (n: number) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0

/**
 * Puts a list of time signatures into the shape beatTimes relies on: sorted by
 * tick, one per tick (the last one wins, as in a MIDI file), malformed entries
 * dropped, and always starting at tick 0 -- 4/4 is assumed before the first
 * signature, which is also the MIDI default when a file carries none.
 */
export function normaliseTimeSignatures(list: readonly TimeSigEvent[]): TimeSigEvent[] {
  const valid = list
    .filter((s) => Number.isInteger(s.numerator) && s.numerator > 0 && isPowerOfTwo(s.denominator)
      && Number.isFinite(s.ticks) && s.ticks >= 0)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.ticks - b.s.ticks || a.i - b.i)
    .map(({ s }) => ({ ticks: s.ticks, numerator: s.numerator, denominator: s.denominator }))
  const out: TimeSigEvent[] = []
  for (const s of valid) {
    if (out.length && out[out.length - 1].ticks === s.ticks) out[out.length - 1] = s
    else out.push(s)
  }
  if (!out.length || out[0].ticks > 0) out.unshift({ ticks: 0, ...FOUR_FOUR })
  return out
}
