// The preview banner for a shared scene or look (spec §7): "Shared scene:
// *title* by @handle — Apply · Save a copy · Dismiss". A shared payload is
// never applied silently; nothing changes until Apply is pressed.
//
// The banner only renders what it is given -- resolving, decoding and
// applying live in useScenes. Text from the payload (the song title, the
// owner handle) is rendered as React text, never as HTML (spec §9.1).

import type { SaveKind } from 'ivories/core'

export interface SharePreviewView {
  kind: SaveKind
  /** The scene's song title; unused for a look. */
  title: string
  owner: string | null
  /** A copy has been saved already, so "Save a copy" is spent. */
  saved: boolean
}

const BTN = 'rounded-full px-3 py-1 text-xs font-semibold'

export function SharedPreviewBanner(props: {
  preview: SharePreviewView | null
  /** A link that matched but could not be opened (bad, or from a newer version). */
  error: string | null
  busy?: boolean
  onApply: () => void
  onSaveCopy: () => void
  onDismiss: () => void
}) {
  const { preview, error } = props
  if (!preview && !error) return null

  if (!preview) {
    return (
      <div
        role="alert"
        className="shared-preview-banner shared-preview-banner--error absolute left-1/2 top-4 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm text-[#ff6b6b] shadow-2xl"
      >
        <span className="shared-preview-error-text">{error}</span>
        <button
          type="button"
          className={`btn-dismiss-share ${BTN} border border-[var(--line)] text-[var(--ink-dim)]`}
          onClick={props.onDismiss}
        >
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div
      role="region"
      aria-label="Shared preview"
      className="shared-preview-banner absolute left-1/2 top-4 z-20 flex max-w-[90%] -translate-x-1/2 flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--ink)] shadow-2xl"
    >
      <p className="shared-preview-text">
        {preview.kind === 'scene'
          ? <>Shared scene: <em className="shared-preview-title font-semibold not-italic">{preview.title}</em></>
          : <>Shared look</>}
        {preview.owner && <span className="shared-preview-owner text-[var(--ink-dim)]"> by @{preview.owner}</span>}
      </p>
      <div className="shared-preview-actions flex gap-2">
        <button
          type="button"
          className={`btn-apply-share ${BTN} bg-[var(--accent)] text-black`}
          disabled={props.busy}
          onClick={props.onApply}
        >
          Apply
        </button>
        <button
          type="button"
          className={`btn-save-copy ${BTN} border border-[var(--line)] text-[var(--ink-dim)]`}
          disabled={props.busy || preview.saved}
          onClick={props.onSaveCopy}
        >
          {preview.saved ? 'Saved' : 'Save a copy'}
        </button>
        <button
          type="button"
          className={`btn-dismiss-share ${BTN} border border-[var(--line)] text-[var(--ink-dim)]`}
          onClick={props.onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
