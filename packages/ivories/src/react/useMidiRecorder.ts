import { useCallback, useEffect, useRef, useState } from 'react'
import { useIvories } from './hooks'
import { buildRecordedScore } from '../core/midi/recorder'
import { hashFile } from '../core/io/hashFile'
import type { RecordedNote } from '../core/midi/recorder'
import type { ScoreDocument } from '../core/model/types'

const nowSec = () => performance.now() / 1000

/** Collects live notes into a Score for replay (spec §4.2). Enables MIDI input while recording. */
export function useMidiRecorder() {
  const iv = useIvories()
  const [recording, setRecording] = useState(false)
  const origin = useRef(0)
  const open = useRef(new Map<number, { velocity: number; start: number }>())
  const done = useRef<RecordedNote[]>([])

  useEffect(() => {
    if (!recording) return
    const release = iv.live.enable()
    const off = iv.live.subscribe((e) => {
      const t = e.time - origin.current
      if (e.on) {
        open.current.set(e.midi, { velocity: e.velocity, start: t })
        return
      }
      const o = open.current.get(e.midi)
      if (!o) return
      open.current.delete(e.midi)
      done.current.push({ midi: e.midi, velocity: o.velocity, start: o.start, end: t })
    })
    return () => { off(); release() }
  }, [recording, iv.live])

  const start = useCallback(() => {
    open.current.clear()
    done.current = []
    origin.current = nowSec()
    setRecording(true)
  }, [])

  const stop = useCallback(async (): Promise<ScoreDocument | null> => {
    setRecording(false)
    const end = nowSec() - origin.current
    for (const [midi, o] of open.current) done.current.push({ midi, velocity: o.velocity, start: o.start, end })
    open.current.clear()
    if (done.current.length === 0) return null
    const score = buildRecordedScore(done.current)
    score.id = await hashFile(new TextEncoder().encode(JSON.stringify(done.current)).buffer as ArrayBuffer)
    return score
  }, [])

  return { recording, start, stop }
}
