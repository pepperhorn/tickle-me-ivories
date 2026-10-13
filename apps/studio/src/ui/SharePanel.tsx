// "Copy share link" (spec §2 ShareProvider.share). The link is always shown
// in a read-only, select-able `.share-url` field as well as copied:
// navigator.clipboard only exists in a secure context, and a LAN http://
// dev server (or a browser that refuses the write) is not one (preflight
// F19c), so the field is the fallback the user can select and copy by hand.
//
// Signed in, share() makes an owned link: Stop sharing is offered for it too
// and revoke(code, undefined) ends it as the owner.
//
// An anonymous share may come back with a revokeKey. It is a secret: it is
// kept in this browser's localStorage only (keyed by share code), never put
// in a URL, shown, logged or sent anywhere but the provider's revoke().

import { useRef, useState } from 'react'
import type { LookV1, SaveKind, SceneV2, ShareProvider } from 'ivories/core'
import { isPlatformError } from 'ivories/core'
import { saveErrorMessage } from './saveErrors'

const BTN = 'rounded border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)]'

export async function copyText(text: string): Promise<boolean> {
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
  if (!clip || typeof clip.writeText !== 'function') return false
  try {
    await clip.writeText(text)
    return true
  } catch {
    return false
  }
}

const REVOKE_KEY_PREFIX = 'tmi.shareRevoke.'
/** At most this many revoke keys are kept; storing a new one drops the oldest
    (by when it was stored). Anonymous links never expire, so an age cut-off
    would throw away keys to links that still open; a count cap only bounds
    what piles up. A dropped key's link can no longer be stopped from here. */
export const REVOKE_KEY_MAX_COUNT = 200

/** Makes room for one more key: keeps the newest MAX_COUNT - 1, drops unreadable entries. */
function pruneRevokeKeys(): void {
  const entries: { k: string; at: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(REVOKE_KEY_PREFIX)) continue
    let at = Number.NaN
    try { at = Number((JSON.parse(localStorage.getItem(k) ?? '') as { at?: unknown }).at) } catch { /* unreadable: drop */ }
    entries.push({ k, at })
  }
  const readable = entries.filter((e) => Number.isFinite(e.at)).sort((a, b) => b.at - a.at)
  const keep = new Set(readable.slice(0, REVOKE_KEY_MAX_COUNT - 1).map((e) => e.k))
  for (const e of entries) if (!keep.has(e.k)) localStorage.removeItem(e.k)
}

/** True only when the key was written, so Stop sharing is offered only then. */
function storeRevokeKey(code: string, key: string): boolean {
  try {
    pruneRevokeKeys()
    localStorage.setItem(REVOKE_KEY_PREFIX + code, JSON.stringify({ key, at: Date.now() }))
    return true
  } catch {
    return false
  }
}
function readRevokeKey(code: string): string | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(REVOKE_KEY_PREFIX + code) ?? 'null') as { key?: unknown } | null
    return typeof v?.key === 'string' ? v.key : undefined
  } catch {
    return undefined
  }
}
function forgetRevokeKey(code: string): void {
  try { localStorage.removeItem(REVOKE_KEY_PREFIX + code) } catch { /* nothing to do */ }
}

export function SharePanel(props: {
  share: ShareProvider
  canShareScene: boolean
  buildScene: () => SceneV2
  buildLook: () => LookV1
  /** Signed in: share() makes an owned link, which the owner can stop without a revoke key. */
  signedIn?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  /** The code of the last link, when it can be stopped from here: this
      browser holds its revoke key, or (signed in) it is the owner's link. */
  const [revocable, setRevocable] = useState<string | null>(null)
  /** A share is in flight: the buttons are disabled so a double-click mints one link. */
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<HTMLInputElement | null>(null)

  const makeLink = async (kind: SaveKind) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setStatus(null)
    let link: string
    try {
      const res = kind === 'scene'
        ? await props.share.share({ kind, payload: props.buildScene() })
        : await props.share.share({ kind, payload: props.buildLook() })
      link = res.shortUrl ?? res.url
      const stored = !!res.revokeKey && storeRevokeKey(res.code, res.revokeKey)
      // Owned (signed-in) link: revoke(code, undefined) takes the owner path.
      setRevocable((stored || !!props.signedIn) && props.share.revoke ? res.code : null)
    } catch (e) {
      setUrl(null)
      setRevocable(null)
      setError(saveErrorMessage(e, `Could not make a share link for this ${kind}`))
      return
    } finally {
      busyRef.current = false
      setBusy(false)
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

  const stopSharing = async () => {
    const code = revocable
    if (!code || !props.share.revoke) return
    setError(null)
    setStatus(null)
    try {
      await props.share.revoke(code, readRevokeKey(code))
      forgetRevokeKey(code)
      setRevocable(null)
      setUrl(null)
      setStatus('Sharing stopped. The link no longer opens.')
    } catch (e) {
      if (isPlatformError(e) && e.code === 'not_found') {
        // Already gone (expired or stopped elsewhere): nothing left to stop.
        forgetRevokeKey(code)
        setRevocable(null)
        setUrl(null)
        setStatus('That link was already gone.')
        return
      }
      setError(saveErrorMessage(e, 'Could not stop sharing'))
    }
  }

  return (
    <div className="share-panel flex flex-col gap-2">
      <div className="share-actions flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn-copy-share btn-copy-share--scene ${BTN}`}
          disabled={!props.canShareScene || busy}
          onClick={() => void makeLink('scene')}
        >
          Copy share link (scene)
        </button>
        <button
          type="button"
          className={`btn-copy-share btn-copy-share--look ${BTN}`}
          disabled={busy}
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
      {url && revocable && (
        <button type="button" className={`btn-stop-sharing btn-stop-sharing--${props.signedIn ? 'owned' : 'anonymous'} ${BTN} self-start`} onClick={() => void stopSharing()}>
          Stop sharing
        </button>
      )}
      {status && <p className="share-status text-[11px] text-[var(--ink-dim)]">{status}</p>}
      {error && <p role="alert" className="share-error text-[11px] text-[#ff6b6b]">{error}</p>}
    </div>
  )
}
