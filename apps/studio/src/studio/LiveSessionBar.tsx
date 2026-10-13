import { LiveMidiSettings } from './LiveMidiSettings'

/** The "Play live" session's controls (R-S): MIDI device and sound, and the way back to a score. */
export function LiveSessionBar({ onLoadScore }: { onLoadScore(): void }) {
  return (
    <div className="live-session-bar flex flex-wrap items-center gap-4 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink-dim)]">
      <div className="live-session-midi min-w-64 flex-1">
        <LiveMidiSettings showBpm={false} />
      </div>
      <button
        type="button"
        className="btn-load-score rounded-md border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink)]"
        onClick={onLoadScore}
      >
        Load a score
      </button>
    </div>
  )
}
