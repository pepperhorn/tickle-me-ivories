// "Copy share link" (spec §2 ShareProvider.share). The link is always shown
// in a read-only, select-able `.share-url` field as well as copied:
// navigator.clipboard only exists in a secure context, and a LAN http://
// dev server (or a browser that refuses the write) is not one (preflight
// F19c), so the field is the fallback the user can select and copy by hand.

import { useRef, useState } from 'react'
import type { LookV1, SaveKind, SceneV1, ShareProvider } from 'ivories/core'
import { saveErrorMessage } from './saveErrors'

const BTN = 'rounded border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)]'

async function copyText(text: string): Promise<boolean> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  if (!clip || typeof clip.writeText !== 'function') return false
  try {
    await clip.writeText(text)
    return true
  } catch {
    return false
  }
}

export function SharePanel(props: {
  share: ShareProvider
  canShareScene: boolean
  buildScene: () => SceneV1
  buildLook: () => LookV1
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<HTMLInputElement | null>(null)

  const makeLink = async (kind: SaveKind) => {
    setError(null)
    setStatus(null)
    let link: string
    try {
      const res = kind === 'scene'
        ? await props.share.share({ kind, payload: props.buildScene() })
        : await props.share.share({ kind, payload: props.buildLook() })
      link = res.shortUrl ?? res.url
    } catch (e) {
      setUrl(null)
      setError(saveErrorMessage(e, `Could not make a share link for this ${kind}`))
      return
    }
    setUrl(link)
    const copied = await copyText(link)
    setStatus(copied
      ? `Link copied.${kind === 'scene' ? ' Whoever opens it needs the same song file.' : ''}`
      : 'Copy the link below.')
    if (!copied) {
      // Pre-select it so one Ctrl/Cmd+C finishes the job.
      queueMicrotask(() => urlRef.current?.select())
    }
  }

  return (
    <div className="share-panel flex flex-col gap-2">
      <div className="share-actions flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn-copy-share btn-copy-share--scene ${BTN}`}
          disabled={!props.canShareScene}
          onClick={() => void makeLink('scene')}
        >
          Copy share link (scene)
        </button>
        <button
          type="button"
          className={`btn-copy-share btn-copy-share--look ${BTN}`}
          onClick={() => void makeLink('look')}
        >
          Copy share link (look)
        </button>
      </div>
      {url && (
        <input
          ref={urlRef}
          type="text"
          readOnly
          aria-label="Share link"
          className="share-url w-full rounded border border-[var(--line)] bg-transparent px-2 py-1 text-[11px] text-[var(--ink)]"
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {status && <p className="share-status text-[11px] text-[var(--ink-dim)]">{status}</p>}
      {error && <p role="alert" className="share-error text-[11px] text-[#ff6b6b]">{error}</p>}
    </div>
  )
}
