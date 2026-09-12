import type { TempoEvent, TempoSetting } from './types'

const DEFAULT_BPM = 120

/**
 * Builds the tick->second table at the FILE'S OWN tempi. A TempoSetting is
 * applied later, in ticksToSec/secToTicks, so changing tempo never rewrites
 * this table and never accumulates rounding error.
 */
export function buildTempoMap(
  changes: { ticks: number; bpm: number }[],
  ppq: number,
): TempoEvent[] {
  const sorted = [...changes].sort((a, b) => a.ticks - b.ticks)
  if (sorted.length === 0 || sorted[0].ticks !== 0) {
    sorted.unshift({ ticks: 0, bpm: DEFAULT_BPM })
  }
  const out: TempoEvent[] = []
  let sec = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prev = sorted[i - 1]
      sec += ((sorted[i].ticks - prev.ticks) / ppq) * (60 / prev.bpm)
    }
    out.push({ ticks: sorted[i].ticks, sec, bpm: sorted[i].bpm })
  }
  return out
}

function segmentAtTicks(map: TempoEvent[], ticks: number): TempoEvent {
  let i = map.length - 1
  while (i > 0 && map[i].ticks > ticks) i--
  return map[i]
}

function segmentAtSec(map: TempoEvent[], sec: number): TempoEvent {
  let i = map.length - 1
  while (i > 0 && map[i].sec > sec) i--
  return map[i]
}

export function ticksToSec(
  map: TempoEvent[], ppq: number, ticks: number, setting: TempoSetting,
): number {
  if (setting.mode === 'absolute') return (ticks / ppq) * (60 / setting.bpm)
  const e = segmentAtTicks(map, ticks)
  const base = e.sec + ((ticks - e.ticks) / ppq) * (60 / e.bpm)
  return base / Math.max(0.01, setting.scale)
}

export function secToTicks(
  map: TempoEvent[], ppq: number, sec: number, setting: TempoSetting,
): number {
  if (setting.mode === 'absolute') return (sec * setting.bpm / 60) * ppq
  const base = sec * Math.max(0.01, setting.scale)
  const e = segmentAtSec(map, base)
  return e.ticks + ((base - e.sec) * (e.bpm / 60)) * ppq
}
