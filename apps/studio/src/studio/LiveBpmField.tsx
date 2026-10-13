import { useEffect, useState } from 'react'
import { MAX_LIVE_BPM, MIN_LIVE_BPM, parseBpmDraft } from 'ivories/core'
import { useLiveMidi } from './liveMidi'

/** The live BPM (rising view, no score). Commits only values in range; blur shows the committed one. */
export function LiveBpmField({ id, className = '', showLabel = true }: { id?: string; className?: string; showLabel?: boolean }) {
  const bpm = useLiveMidi((s) => s.bpm)
  const set = useLiveMidi((s) => s.set)
  const [draft, setDraft] = useState(String(bpm))
  useEffect(() => { setDraft(String(bpm)) }, [bpm])
  return (
    <span className={`live-bpm flex items-center gap-1 ${className}`}>
      {showLabel && <span className="live-bpm-label">BPM</span>}
      <input
        id={id} type="number" aria-label="BPM" min={MIN_LIVE_BPM} max={MAX_LIVE_BPM} step={1} value={draft}
        className="live-bpm-input w-16 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--ink)]"
        onChange={(e) => {
          setDraft(e.target.value)
          const n = parseBpmDraft(e.target.value)
          if (n !== null) set({ bpm: n })
        }}
        onBlur={() => setDraft(String(useLiveMidi.getState().bpm))}
      />
    </span>
  )
}
