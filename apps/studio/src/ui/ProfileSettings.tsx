import { useRef, useState } from 'react'

export function ProfileSettings(props: {
  onExport: () => void
  onImport: (file: File, applyGlobals: boolean) => void
  onReset: () => void
  error: string | null
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [applyGlobals, setApplyGlobals] = useState(false)

  return (
    <div className="profile-settings flex flex-col gap-2">
      <div className="profile-actions flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-profile-export rounded border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)]"
          onClick={props.onExport}
        >
          Export profile
        </button>
        <button
          type="button"
          className="btn-profile-import rounded border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)]"
          onClick={() => fileRef.current?.click()}
        >
          Import profile
        </button>
        <button
          type="button"
          className="btn-profile-reset rounded border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)]"
          onClick={props.onReset}
        >
          Reset to defaults
        </button>
      </div>

      <label className="profile-globals-opt flex items-center gap-2 text-[11px] text-[var(--ink-dim)]">
        <input
          type="checkbox"
          className="profile-globals-checkbox accent-[var(--accent)]"
          checked={applyGlobals}
          onChange={(e) => setApplyGlobals(e.target.checked)}
        />
        Also apply the file’s global preferences (velocity colour, audio levels)
      </label>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.tmi.json,application/json"
        aria-label="Import profile file"
        className="profile-file-input hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) props.onImport(f, applyGlobals)
          e.target.value = ''
        }}
      />

      {props.error && (
        <p className="profile-error text-[11px] text-[#ff6b6b]">{props.error}</p>
      )}
    </div>
  )
}
