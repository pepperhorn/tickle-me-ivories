import { useEffect, useState } from 'react'
import { MAX_TEMPO_SCALE, MIN_TEMPO_SCALE } from '../model/tempoMap'
import { SettingsRow } from './SettingsPanel'
import type { TempoSetting } from '../model/types'

export function TempoControl(props: {
  tempo: TempoSetting
  effectiveBpm: number
  onChange: (t: TempoSetting) => void
}) {
  const { tempo, effectiveBpm, onChange } = props
  const scale = tempo.mode === 'scale' ? tempo.scale : 1
  const bpm = tempo.mode === 'absolute' ? tempo.bpm : Math.round(effectiveBpm)

  // The number input is uncontrolled by `bpm` while the user is typing: a
  // controlled input that rejects out-of-range values immediately makes it
  // impossible to type e.g. "90" over "120" (the intermediate "9" is
  // rejected and the field snaps back). Instead we keep a local draft string
  // and only commit -- and only when it parses to 20-300 -- on blur or Enter.
  const [bpmDraft, setBpmDraft] = useState(() => String(bpm))
  // Resync only when the committed value changes (mode switch, external
  // change) -- bpm does not change from our own typing until commitBpm
  // calls onChange, so this never clobbers an in-progress edit.
  useEffect(() => { setBpmDraft(String(bpm)) }, [bpm])

  const commitBpm = () => {
    const v = Number(bpmDraft)
    if (Number.isFinite(v) && v >= 20 && v <= 300) onChange({ mode: 'absolute', bpm: v })
    else setBpmDraft(String(bpm))
  }

  return (
    <div className="tempo-control">
      <SettingsRow label="Tempo mode">
        <div className="tempo-mode-switch flex gap-1">
          {(['scale', 'absolute'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={tempo.mode === m}
              className={`btn-tempo-mode rounded-md border px-2 py-0.5 text-[11px] capitalize ${
                tempo.mode === m
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--line)] text-[var(--ink-dim)]'
              }`}
              onClick={() =>
                onChange(m === 'scale' ? { mode: 'scale', scale } : { mode: 'absolute', bpm })
              }
            >
              {m === 'scale' ? 'Scale %' : 'Absolute'}
            </button>
          ))}
        </div>
      </SettingsRow>

      {tempo.mode === 'scale' ? (
        <SettingsRow label="Tempo scale" htmlFor="tempo-scale">
          <input
            id="tempo-scale"
            type="range"
            aria-label="Tempo scale"
            className="tempo-scale-slider h-1 w-36 accent-[var(--accent)]"
            min={MIN_TEMPO_SCALE}
            max={MAX_TEMPO_SCALE}
            step={0.01}
            value={scale}
            onChange={(e) => onChange({ mode: 'scale', scale: Number(e.target.value) })}
          />
          <span className="tempo-scale-value w-12 text-right font-mono text-[11px] tabular-nums text-[var(--ink)]">
            {Math.round(scale * 100)}%
          </span>
        </SettingsRow>
      ) : (
        <SettingsRow label="Absolute BPM" htmlFor="tempo-bpm">
          <input
            id="tempo-bpm"
            type="number"
            aria-label="Absolute BPM"
            className="tempo-bpm-input w-20 rounded border border-[var(--line)] bg-transparent px-2 py-0.5 text-right font-mono text-[11px] tabular-nums"
            min={20}
            max={300}
            step={1}
            value={bpmDraft}
            onChange={(e) => setBpmDraft(e.target.value)}
            onBlur={commitBpm}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitBpm()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
        </SettingsRow>
      )}

      <p className="tempo-note text-[11px] leading-snug text-[var(--ink-dim)]">
        {tempo.mode === 'scale'
          ? 'Scales the file’s own tempo map, so ritardandos survive.'
          : 'Flattens the file’s tempo map to one constant tempo.'}
      </p>
    </div>
  )
}
