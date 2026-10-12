import { getSoundfontNames } from 'smplr'
import type { Voice } from '../model/types'

/** smplr's own General MIDI names -- the only ids Soundfont() will load. */
export const INSTRUMENT_OPTIONS: string[] = getSoundfontNames()

const pretty = (id: string) => id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function VoicePanel(props: {
  voices: Voice[]
  onChange: (id: string, patch: Partial<Voice>) => void
}) {
  const { voices, onChange } = props
  return (
    <div className="voice-panel flex flex-col gap-3">
      {voices.map((v) => (
        <div key={v.id} className="voice-row flex flex-col gap-1.5 rounded-md border border-[var(--line)] p-2">
          <div className="voice-row-head flex items-center gap-2">
            <span
              className="voice-swatch h-4 w-4 shrink-0 rounded-full border border-black/40"
              style={{ background: `hsl(${v.hue} 85% 58%)` }}
              aria-hidden
            />
            <input
              type="text"
              aria-label={`${v.label} name`}
              className="voice-label min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-[var(--ink)] hover:border-[var(--line)] focus:border-[var(--accent)] focus:outline-none"
              value={v.label}
              onChange={(e) => onChange(v.id, { label: e.target.value })}
            />
            <button
              type="button"
              aria-label={`Hide ${v.label}`}
              aria-pressed={!v.visible}
              className={`btn-voice-visible rounded border px-1.5 py-0.5 text-[10px] ${
                v.visible ? 'border-[var(--line)] text-[var(--ink-dim)]' : 'border-[var(--accent)] text-[var(--accent)]'
              }`}
              onClick={() => onChange(v.id, { visible: !v.visible })}
            >
              {v.visible ? 'Shown' : 'Hidden'}
            </button>
            <button
              type="button"
              aria-label={`Mute ${v.label}`}
              aria-pressed={!v.audible}
              className={`btn-voice-audible rounded border px-1.5 py-0.5 text-[10px] ${
                v.audible ? 'border-[var(--line)] text-[var(--ink-dim)]' : 'border-[var(--accent)] text-[var(--accent)]'
              }`}
              onClick={() => onChange(v.id, { audible: !v.audible })}
            >
              {v.audible ? 'Audible' : 'Muted'}
            </button>
          </div>

          <div className="voice-row-hue flex items-center gap-2">
            <label htmlFor={`voice-hue-${v.id}`} className="voice-control-label w-14 text-[11px] text-[var(--ink-dim)]">
              Colour
            </label>
            <input
              id={`voice-hue-${v.id}`}
              type="range"
              aria-label={`${v.label} colour`}
              className="voice-hue-slider h-1 flex-1 accent-[var(--accent)]"
              min={0} max={360} step={1}
              value={v.hue}
              onChange={(e) => onChange(v.id, { hue: Number(e.target.value) })}
            />
          </div>

          <div className="voice-row-volume flex items-center gap-2">
            <label htmlFor={`voice-vol-${v.id}`} className="voice-control-label w-14 text-[11px] text-[var(--ink-dim)]">
              Volume
            </label>
            <input
              id={`voice-vol-${v.id}`}
              type="range"
              aria-label={`${v.label} volume`}
              className="voice-volume-slider h-1 flex-1 accent-[var(--accent)]"
              min={0} max={1} step={0.01}
              value={v.volume}
              onChange={(e) => onChange(v.id, { volume: Number(e.target.value) })}
            />
            <span className="voice-volume-value w-8 text-right font-mono text-[10px] tabular-nums text-[var(--ink-dim)]">
              {Math.round(v.volume * 100)}
            </span>
          </div>

          <div className="voice-row-instrument flex items-center gap-2">
            <label htmlFor={`voice-inst-${v.id}`} className="voice-control-label w-14 text-[11px] text-[var(--ink-dim)]">
              Sound
            </label>
            <select
              id={`voice-inst-${v.id}`}
              aria-label={`${v.label} instrument`}
              className="voice-instrument-select min-w-0 flex-1 rounded border border-[var(--line)] bg-[var(--panel)] px-1 py-0.5 text-[11px] text-[var(--ink)]"
              value={v.instrument}
              onChange={(e) => onChange(v.id, { instrument: e.target.value })}
            >
              {INSTRUMENT_OPTIONS.map((id) => (
                <option key={id} className="instrument-option" value={id}>{pretty(id)}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  )
}
