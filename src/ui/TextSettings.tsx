import { SettingsRow } from './SettingsPanel'
import type {
  NoteLabelContent, NoteLabelPlacement, TextSettings as TextSettingsType, TextStyle,
} from '../settings/types'

/** Suggestions only, offered through a datalist: any Google family name is valid. */
const GOOGLE_FONT_SUGGESTIONS = [
  'Poppins', 'Inter', 'Space Grotesk', 'Bebas Neue', 'Montserrat', 'Roboto Mono', 'Playfair Display',
]

/** A colour input only accepts #rrggbb; anything else (the default rgba outline) shows as black. */
const HEX6 = /^#[0-9a-f]{6}$/i

const LABEL_CONTENT: [NoteLabelContent, string][] = [
  ['off', 'Off'],
  ['pitch', 'Pitch name'],
  ['midi', 'MIDI number'],
  ['both', 'Both'],
]

export function TextSettings(props: {
  text: TextSettingsType
  onChange: (patch: Partial<TextSettingsType>) => void
  onStyle: (patch: Partial<TextStyle>) => void
}) {
  const { text, onChange, onStyle } = props
  return (
    <div className="text-settings flex flex-col gap-1">
      <SettingsRow label="Note labels">
        <select
          aria-label="Note labels"
          className="label-content-select rounded border border-[var(--line)] bg-[var(--panel)] px-1 py-0.5 text-[11px] text-[var(--ink)]"
          value={text.labels}
          onChange={(e) => onChange({ labels: e.target.value as NoteLabelContent })}
        >
          {LABEL_CONTENT.map(([id, label]) => (
            <option key={id} className="label-content-option" value={id}>{label}</option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow label="Label position">
        <div className="label-placement-switch flex gap-1">
          {(['above', 'below'] as NoteLabelPlacement[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={text.labelPlacement === p}
              className={`btn-label-placement rounded border px-2 py-0.5 text-[10px] capitalize ${
                text.labelPlacement === p
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() => onChange({ labelPlacement: p })}
            >
              {p} keys
            </button>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow label="Font" htmlFor="text-family">
        <input
          id="text-family" type="text" list="google-font-suggestions" aria-label="Font family"
          className="text-family-input w-32 rounded border border-[var(--line)] bg-transparent px-1 py-0.5 text-[11px] text-[var(--ink)]"
          value={text.style.family}
          onChange={(e) => onStyle({ family: e.target.value })}
        />
        <datalist id="google-font-suggestions" className="google-font-suggestions">
          {GOOGLE_FONT_SUGGESTIONS.map((f) => <option key={f} className="google-font-option" value={f} />)}
        </datalist>
      </SettingsRow>

      <SettingsRow label="Weight" htmlFor="text-weight">
        <input
          id="text-weight" type="range" aria-label="Font weight"
          className="text-weight-slider h-1 w-28 accent-[var(--accent)]"
          min={300} max={900} step={100} value={text.style.weight}
          onChange={(e) => onStyle({ weight: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Size" htmlFor="text-size">
        <input
          id="text-size" type="range" aria-label="Text size"
          className="text-size-slider h-1 w-28 accent-[var(--accent)]"
          min={0.2} max={1.4} step={0.01} value={text.style.sizeRatio}
          onChange={(e) => onStyle({ sizeRatio: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Letter spacing" htmlFor="text-tracking">
        <input
          id="text-tracking" type="range" aria-label="Letter spacing"
          className="text-tracking-slider h-1 w-28 accent-[var(--accent)]"
          min={-0.05} max={0.3} step={0.01} value={text.style.letterSpacing}
          onChange={(e) => onStyle({ letterSpacing: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Colour">
        <input
          type="color" aria-label="Text colour"
          className="text-color-input h-6 w-8 rounded border border-[var(--line)] bg-transparent"
          value={HEX6.test(text.style.color) ? text.style.color : '#ffffff'}
          onChange={(e) => onStyle({ color: e.target.value })}
        />
        <input
          type="range" aria-label="Text opacity"
          className="text-opacity-slider h-1 w-20 accent-[var(--accent)]"
          min={0} max={1} step={0.01} value={text.style.opacity}
          onChange={(e) => onStyle({ opacity: Number(e.target.value) })}
        />
      </SettingsRow>

      <SettingsRow label="Outline" htmlFor="text-stroke">
        <input
          id="text-stroke" type="range" aria-label="Text outline width"
          className="text-stroke-slider h-1 w-20 accent-[var(--accent)]"
          min={0} max={8} step={0.5} value={text.style.strokeWidth}
          onChange={(e) => onStyle({ strokeWidth: Number(e.target.value) })}
        />
        <input
          type="color" aria-label="Text outline colour"
          className="text-stroke-color h-6 w-8 rounded border border-[var(--line)] bg-transparent"
          value={HEX6.test(text.style.strokeColor) ? text.style.strokeColor : '#000000'}
          onChange={(e) => onStyle({ strokeColor: e.target.value })}
        />
      </SettingsRow>

      <p className="text-outline-note text-[11px] leading-snug text-[var(--ink-dim)]">
        Keep the outline on over video: flat text disappears the moment the footage
        matches its colour. Set the width to 0 only over a known flat background.
      </p>
    </div>
  )
}
