import type { DisplayMode } from '../transport/useTransport'

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TransportBar(props: {
  playing: boolean
  playhead: number
  duration: number
  mode: DisplayMode
  name: string
  onToggle: () => void
  onSeek: (sec: number) => void
  onMode: (mode: DisplayMode) => void
}) {
  const { playing, playhead, duration, mode, name } = props
  return (
    <div className="transport-bar flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-2">
      <button
        type="button"
        className="btn-play rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-black"
        onClick={props.onToggle}
      >
        {playing ? 'Pause' : 'Play'}
      </button>

      <span className="transport-time font-mono text-xs tabular-nums text-[var(--ink-dim)]">
        {mmss(playhead)} / {mmss(duration)}
      </span>

      <input
        id="scrub"
        type="range"
        aria-label="Seek"
        className="transport-scrub h-1 min-w-40 flex-1 accent-[var(--accent)]"
        min={0}
        max={Math.max(duration, 0.001)}
        step={0.01}
        value={Math.min(playhead, duration)}
        onChange={(e) => props.onSeek(Number(e.target.value))}
      />

      <div className="mode-switch flex gap-1">
        {(['roll', 'keyboard'] as DisplayMode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            className={`btn-mode rounded-md border px-3 py-1 text-xs capitalize ${
              mode === m ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--line)] text-[var(--ink-dim)]'
            }`}
            onClick={() => props.onMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <span className="transport-filename truncate text-xs text-[var(--ink-dim)]">{name}</span>
    </div>
  )
}
