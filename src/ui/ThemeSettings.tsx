import { SettingsRow } from './SettingsPanel'
import type { ThemeName, ThemeSettings as ThemeSettingsType } from '../settings/types'

const THEMES: [ThemeName, string][] = [
  ['classic', 'Classic'],
  ['outline', 'Outline'],
  ['contrast', 'High contrast'],
  ['transparent', 'Transparent'],
]

/** The standard keying primaries. Any colour is valid; these are the two that
    hardware switchers and older NLE paths actually expect. */
export const MATTE_PRESETS = [
  { label: 'Green', color: '#00b140' },
  { label: 'Magenta', color: '#ff00ff' },
]

export function ThemeSettings(props: {
  theme: ThemeSettingsType
  onChange: (patch: Partial<ThemeSettingsType>) => void
}) {
  const { theme, onChange } = props
  return (
    <div className="theme-settings flex flex-col gap-1">
      <SettingsRow label="Keyboard theme">
        <select
          aria-label="Keyboard theme"
          className="theme-select rounded border border-[var(--line)] bg-[var(--panel)] px-1 py-0.5 text-[11px] text-[var(--ink)]"
          value={theme.name}
          onChange={(e) => onChange({ name: e.target.value as ThemeName })}
        >
          {THEMES.map(([id, label]) => (
            <option key={id} className="theme-option" value={id}>{label}</option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow label="Stage background">
        <div className="matte-switch flex items-center gap-1">
          <button
            type="button"
            aria-pressed={theme.stageBgOverride === null}
            className={`btn-matte rounded border px-2 py-0.5 text-[10px] ${
              theme.stageBgOverride === null
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--line)] text-[var(--ink-dim)]'
            }`}
            onClick={() => onChange({ stageBgOverride: null })}
          >
            Theme
          </button>
          {MATTE_PRESETS.map((m) => (
            <button
              key={m.color}
              type="button"
              aria-label={`${m.label} matte`}
              aria-pressed={theme.stageBgOverride === m.color}
              className={`btn-matte rounded border px-2 py-0.5 text-[10px] ${
                theme.stageBgOverride === m.color
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() => onChange({ stageBgOverride: m.color })}
            >
              {m.label}
            </button>
          ))}
          <input
            type="color"
            aria-label="Custom matte colour"
            className="matte-custom h-6 w-8 rounded border border-[var(--line)] bg-transparent"
            value={theme.stageBgOverride ?? '#00b140'}
            onChange={(e) => onChange({ stageBgOverride: e.target.value })}
          />
        </div>
      </SettingsRow>

      {theme.name === 'transparent' && theme.stageBgOverride === null ? (
        <p className="theme-note text-[11px] leading-snug text-[var(--ink-dim)]">
          The stage renders with alpha. Point an OBS browser source at this page and put
          your footage on a layer beneath — no export needed.
        </p>
      ) : null}

      {theme.stageBgOverride !== null ? (
        <p className="theme-warning text-[11px] leading-snug text-[#f5c542]">
          A flat matte keys poorly here: the strike flash draws additively, so a white
          bloom over the matte colour fringes at the brightest moment of every note.
          Prefer the Transparent theme unless your workflow cannot take alpha.
        </p>
      ) : null}
    </div>
  )
}
