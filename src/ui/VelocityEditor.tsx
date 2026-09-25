import { DEFAULT_GRADIENT, DEFAULT_LIGHTNESS } from '../settings/types'
import { SettingsRow } from './SettingsPanel'
import type { VelocityScheme } from '../settings/types'

export function VelocityEditor(props: {
  scheme: VelocityScheme
  onChange: (s: VelocityScheme) => void
}) {
  const { scheme, onChange } = props

  return (
    <div className="velocity-editor flex flex-col gap-1">
      <SettingsRow label="Scheme">
        <div className="velocity-scheme-switch flex gap-1">
          {(['lightness', 'gradient'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={scheme.kind === k}
              className={`btn-velocity-scheme rounded-md border px-2 py-0.5 text-[11px] capitalize ${
                scheme.kind === k
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() => {
                // Re-clicking the already-active scheme must not rebuild from
                // defaults: that would wipe tuned gradient stops or lightness
                // values for no reason.
                if (scheme.kind === k) return
                onChange(
                  k === 'lightness'
                    ? { kind: 'lightness', ...DEFAULT_LIGHTNESS }
                    : { kind: 'gradient', stops: DEFAULT_GRADIENT },
                )
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </SettingsRow>

      {scheme.kind === 'lightness' ? (
        <>
          <SettingsRow label="Soft note lightness" htmlFor="vel-lmax">
            <input
              id="vel-lmax" type="range" aria-label="Soft note lightness"
              className="velocity-lmax h-1 w-32 accent-[var(--accent)]"
              min={40} max={95} step={1} value={scheme.lMax}
              onChange={(e) => onChange({ ...scheme, lMax: Number(e.target.value) })}
            />
          </SettingsRow>
          <SettingsRow label="Hard note lightness" htmlFor="vel-lmin">
            <input
              id="vel-lmin" type="range" aria-label="Hard note lightness"
              className="velocity-lmin h-1 w-32 accent-[var(--accent)]"
              min={10} max={70} step={1} value={scheme.lMin}
              onChange={(e) => onChange({ ...scheme, lMin: Number(e.target.value) })}
            />
          </SettingsRow>
          <SettingsRow label="Saturation" htmlFor="vel-sat">
            <input
              id="vel-sat" type="range" aria-label="Saturation"
              className="velocity-sat h-1 w-32 accent-[var(--accent)]"
              min={0} max={100} step={1} value={scheme.sat}
              onChange={(e) => onChange({ ...scheme, sat: Number(e.target.value) })}
            />
          </SettingsRow>
        </>
      ) : (
        <div className="velocity-stops flex flex-col gap-1">
          {scheme.stops.map((stop, i) => (
            <div key={i} className="velocity-stop flex items-center gap-2">
              <input
                type="color"
                aria-label={`Gradient stop ${i + 1} colour`}
                className="velocity-stop-color h-6 w-8 rounded border border-[var(--line)] bg-transparent"
                value={stop.color}
                onChange={(e) => {
                  const stops = scheme.stops.map((s, j) => (j === i ? { ...s, color: e.target.value } : s))
                  onChange({ kind: 'gradient', stops })
                }}
              />
              <input
                type="range"
                aria-label={`Gradient stop ${i + 1} position`}
                className="velocity-stop-at h-1 flex-1 accent-[var(--accent)]"
                min={0} max={1} step={0.01} value={stop.at}
                onChange={(e) => {
                  const stops = scheme.stops.map((s, j) => (j === i ? { ...s, at: Number(e.target.value) } : s))
                  onChange({ kind: 'gradient', stops })
                }}
              />
              <button
                type="button"
                aria-label={`Remove gradient stop ${i + 1}`}
                className="btn-stop-remove rounded border border-[var(--line)] px-1.5 text-[10px] text-[var(--ink-dim)]"
                disabled={scheme.stops.length <= 2}
                onClick={() => onChange({ kind: 'gradient', stops: scheme.stops.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-stop-add self-start rounded border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--ink-dim)]"
            onClick={() => onChange({ kind: 'gradient', stops: [...scheme.stops, { at: 1, color: '#ffffff' }] })}
          >
            Add stop
          </button>
          <p className="velocity-gradient-note text-[11px] leading-snug text-[var(--ink-dim)]">
            The gradient replaces per-voice colour: velocity alone drives hue.
          </p>
        </div>
      )}
    </div>
  )
}
