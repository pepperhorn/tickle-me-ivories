import { useState } from 'react'

export function SettingsSection(props: {
  id: string
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  return (
    <div className={`settings-section settings-section--${props.id} border-b border-[var(--line)]`}>
      <button
        type="button"
        aria-expanded={open}
        className="settings-section-toggle flex w-full items-center justify-between px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-dim)]"
        onClick={() => setOpen((v) => !v)}
      >
        {props.title}
        <span className="settings-section-chevron" aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="settings-section-body px-4 pb-3">{props.children}</div>}
    </div>
  )
}

/** Row primitive: a label on the left, a control on the right. */
export function SettingsRow(props: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row flex items-center justify-between gap-3 py-1.5">
      <label htmlFor={props.htmlFor} className="settings-row-label text-xs text-[var(--ink-dim)]">
        {props.label}
      </label>
      <div className="settings-row-control flex items-center gap-2">{props.children}</div>
    </div>
  )
}

export function SettingsPanel(props: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null
  return (
    <>
      <div
        className="settings-scrim fixed inset-0 z-10"
        onClick={props.onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Settings"
        className="settings-panel absolute bottom-full right-4 z-20 mb-2 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-2xl"
      >
        {props.children}
      </div>
    </>
  )
}
