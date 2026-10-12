import { SettingsRow } from './SettingsPanel'
import type { DisplaySettings as DisplaySettingsType, ZoomMode } from '../settings/types'

export function DisplaySettings(props: {
  display: DisplaySettingsType
  fallSeconds: number
  onDisplay: (patch: Partial<DisplaySettingsType>) => void
  onFallSeconds: (sec: number) => void
}) {
  const { display, fallSeconds, onDisplay, onFallSeconds } = props
  return (
    <div className="display-settings flex flex-col gap-1">
      <SettingsRow label="Keyboard zoom">
        <div className="zoom-switch flex gap-1">
          {([['full', 'Full 88'], ['fit', 'Fit piece']] as [ZoomMode, string][]).map(([m, text]) => (
            <button
              key={m}
              type="button"
              aria-pressed={display.zoom === m}
              className={`btn-zoom rounded-md border px-2 py-0.5 text-[11px] ${
                display.zoom === m
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() => onDisplay({ zoom: m })}
            >
              {text}
            </button>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow label="Fall time" htmlFor="fall-seconds">
        <input
          id="fall-seconds" type="range" aria-label="Fall time"
          className="fall-seconds-slider h-1 w-32 accent-[var(--accent)]"
          min={0.5} max={8} step={0.1} value={fallSeconds}
          onChange={(e) => onFallSeconds(Number(e.target.value))}
        />
        <span className="fall-seconds-value w-10 text-right font-mono text-[10px] tabular-nums text-[var(--ink-dim)]">
          {fallSeconds.toFixed(1)}s
        </span>
      </SettingsRow>

      <SettingsRow label="Octave grid">
        <input
          type="checkbox" aria-label="Octave grid"
          className="grid-toggle accent-[var(--accent)]"
          checked={display.showGrid}
          onChange={(e) => onDisplay({ showGrid: e.target.checked })}
        />
      </SettingsRow>

      <SettingsRow label="Strike flash">
        <input
          type="checkbox" aria-label="Strike flash"
          className="flash-toggle accent-[var(--accent)]"
          checked={display.showFlash}
          onChange={(e) => onDisplay({ showFlash: e.target.checked })}
        />
      </SettingsRow>

      <SettingsRow label="Flash intensity" htmlFor="flash-scale">
        <input
          id="flash-scale" type="range" aria-label="Flash intensity"
          className="flash-scale-slider h-1 w-32 accent-[var(--accent)]"
          min={0} max={1.5} step={0.05} value={display.flashScale}
          disabled={!display.showFlash}
          onChange={(e) => onDisplay({ flashScale: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Middle C marker">
        <input
          type="checkbox" aria-label="Middle C marker"
          className="middle-c-toggle accent-[var(--accent)]"
          checked={display.showMiddleC}
          onChange={(e) => onDisplay({ showMiddleC: e.target.checked })}
        />
      </SettingsRow>
    </div>
  )
}
