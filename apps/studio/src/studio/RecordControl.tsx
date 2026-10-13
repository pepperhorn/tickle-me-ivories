import { useMidiRecorder } from 'ivories'
import type { ScoreDocument } from 'ivories'

/** Record live MIDI into a score and hand it back for replay (spec §4.2). */
export function RecordControl(props: { onRecorded(score: ScoreDocument): void }) {
  const rec = useMidiRecorder()
  return (
    <button
      type="button"
      aria-pressed={rec.recording}
      className={`btn-record absolute right-4 top-4 z-20 rounded-full px-4 py-1.5 text-xs font-semibold ${rec.recording ? 'bg-[#e8384f] text-white' : 'border border-[var(--line)] bg-black/60 text-[var(--ink)]'}`}
      onClick={() => {
        if (!rec.recording) { rec.start(); return }
        void rec.stop().then((s) => { if (s) props.onRecorded(s) })
      }}
    >
      {rec.recording ? 'Stop recording' : 'Record'}
    </button>
  )
}
