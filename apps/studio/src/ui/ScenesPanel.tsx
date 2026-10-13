// Named saves (spec §2 StorageProvider): save the current scene or look, then
// list, load and delete. Separate from the per-song autosave (tmi.profile.*),
// which this panel never touches.
//
// Everything a provider throws is shown, never swallowed: a save the codec
// refuses (too large, over 64 voices) surfaces its PlatformError message, and
// a save written by a newer version of the app surfaces the §8.5 "made with a
// newer version" message that LocalStorageProvider.load rethrows.

import { useCallback, useEffect, useState } from 'react'
import type { LookV1, SaveKind, SaveSummary, SceneV2, ShareResult, StorageProvider } from 'ivories/core'
import { saveErrorMessage } from './saveErrors'
import { copyText } from './SharePanel'

const BTN = 'rounded border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)]'

// link_edit is deliberately not offered: there is no edit-a-shared-scene UI yet.
type ShareVisibility = 'link_view' | 'public'
const VISIBILITY_LABEL: Record<ShareVisibility, string> = { link_view: 'Anyone with the link', public: 'Public (listed)' }

export function ScenesPanel(props: {
  storage: StorageProvider
  /** Bumped by the owner when something else (e.g. "Save a copy") wrote a save. */
  refreshKey?: number
  /** A scene needs a loaded song; a look does not. */
  canSaveScene: boolean
  defaultName: string
  buildScene: () => SceneV2
  buildLook: () => LookV1
  onOpenScene: (scene: SceneV2) => void
  onApplyLook: (look: LookV1) => void
  /** Account saves only: makes a link for a saved scene or look. */
  onShareSaved?: (row: SaveSummary, visibility: ShareVisibility) => Promise<ShareResult>
  /** Ends a link made with onShareSaved. */
  onStopSharing?: (code: string) => Promise<void>
}) {
  const { storage } = props
  const [scenes, setScenes] = useState<SaveSummary[]>([])
  const [looks, setLooks] = useState<SaveSummary[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [sharing, setSharing] = useState<{ id: string; visibility: ShareVisibility; result: ShareResult | null } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([storage.list('scene'), storage.list('look')])
      setScenes(s)
      setLooks(l)
    } catch (e) {
      setError(saveErrorMessage(e, 'Could not list your saves'))
    }
  }, [storage])

  useEffect(() => { void refresh() }, [refresh, props.refreshKey])

  const save = async (kind: SaveKind) => {
    setError(null)
    setStatus(null)
    const label = name.trim() || props.defaultName
    try {
      const summary = kind === 'scene'
        ? await storage.save({ kind, name: label, payload: props.buildScene() })
        : await storage.save({ kind, name: label, payload: props.buildLook() })
      setStatus(`Saved ${kind} “${summary.name}”.`)
      setName('')
    } catch (e) {
      setError(saveErrorMessage(e, `Could not save the ${kind}`))
    }
    await refresh()
  }

  const load = async (row: SaveSummary) => {
    setError(null)
    setStatus(null)
    try {
      if (row.kind === 'scene') {
        const scene = await storage.load('scene', row.id)
        if (!scene) { setError(`“${row.name}” could not be read. It may be damaged.`); await refresh(); return }
        props.onOpenScene(scene)
      } else {
        const look = await storage.load('look', row.id)
        if (!look) { setError(`“${row.name}” could not be read. It may be damaged.`); await refresh(); return }
        props.onApplyLook(look)
        setStatus(`Applied look “${row.name}”.`)
      }
    } catch (e) {
      setError(saveErrorMessage(e, `Could not load “${row.name}”`))
    }
  }

  const remove = async (row: SaveSummary) => {
    setError(null)
    setStatus(null)
    try {
      await storage.remove(row.kind, row.id)
    } catch (e) {
      setError(saveErrorMessage(e, `Could not delete “${row.name}”`))
    }
    await refresh()
  }

  const getLink = async (row: SaveSummary) => {
    if (!props.onShareSaved || !sharing) return
    setError(null)
    setStatus(null)
    try {
      const result = await props.onShareSaved(row, sharing.visibility)
      setSharing({ ...sharing, result })
      setStatus((await copyText(result.shortUrl ?? result.url)) ? 'Link copied.' : 'Copy the link below.')
    } catch (e) {
      setError(saveErrorMessage(e, `Could not share “${row.name}”`))
    }
  }

  const stopSharing = async (row: SaveSummary) => {
    const code = sharing?.result?.code
    if (!code || !props.onStopSharing) return
    setError(null)
    try {
      await props.onStopSharing(code)
      setSharing(null)
      setStatus(`Sharing stopped for “${row.name}”. The link no longer opens.`)
    } catch (e) {
      setError(saveErrorMessage(e, 'Could not stop sharing'))
    }
  }

  const list = (kind: SaveKind, rows: SaveSummary[]) => (
    <div className={`saves-list saves-list--${kind} flex flex-col gap-1`}>
      <p className="saves-list-heading text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-dim)]">
        {kind === 'scene' ? 'Scenes' : 'Looks'}
      </p>
      {rows.length === 0 && (
        <p className="saves-list-empty text-[11px] text-[var(--ink-dim)]">No saved {kind}s yet.</p>
      )}
      {rows.length > 0 && (
        <ul className="saves-list-rows flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.id} className={`scene-row scene-row--${kind} flex flex-col gap-1`}>
              <div className="scene-row-main flex items-center justify-between gap-2">
                <span className="scene-row-name min-w-0 truncate text-xs text-[var(--ink)]" title={row.name}>
                  {row.name}
                  {row.songTitle && row.songTitle !== row.name && (
                    <span className="scene-row-song text-[var(--ink-dim)]"> · {row.songTitle}</span>
                  )}
                </span>
                <span className="scene-row-actions flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Load ${row.name}`}
                    className={`btn-load-save ${BTN}`}
                    onClick={() => void load(row)}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${row.name}`}
                    className={`btn-delete-save ${BTN}`}
                    onClick={() => void remove(row)}
                  >
                    Delete
                  </button>
                  {props.onShareSaved && (
                    <button
                      type="button"
                      aria-label={`Share ${row.name}`}
                      aria-expanded={sharing?.id === row.id}
                      className={`btn-share-save ${BTN}`}
                      onClick={() => setSharing(sharing?.id === row.id ? null : { id: row.id, visibility: 'link_view', result: null })}
                    >
                      Share
                    </button>
                  )}
                </span>
              </div>
              {sharing?.id === row.id && (
                <div className="scene-row-share flex flex-col gap-1 rounded border border-[var(--line)] p-2">
                  <div className="scene-row-share-controls flex items-center gap-2">
                    <select
                      aria-label="Who can open the link"
                      className="share-visibility-select rounded border border-[var(--line)] bg-transparent px-1 py-0.5 text-[11px] text-[var(--ink)]"
                      value={sharing.visibility}
                      onChange={(e) => setSharing({ ...sharing, visibility: e.target.value as ShareVisibility, result: null })}
                    >
                      {(Object.keys(VISIBILITY_LABEL) as ShareVisibility[]).map((v) => (
                        <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>
                      ))}
                    </select>
                    <button type="button" className={`btn-get-share-link ${BTN}`} onClick={() => void getLink(row)}>Get link</button>
                  </div>
                  {kind === 'scene' && (
                    <p className="share-camera-note text-[11px] text-[var(--ink-dim)]">
                      Sharing removes this browser’s camera choice from the saved scene. If it shows a webcam, pick your camera again after you load it.
                    </p>
                  )}
                  {sharing.result && (
                    <>
                      <input
                        type="text"
                        readOnly
                        aria-label="Share link"
                        className="share-url w-full rounded border border-[var(--line)] bg-transparent px-2 py-1 text-[11px] text-[var(--ink)]"
                        value={sharing.result.shortUrl ?? sharing.result.url}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      {props.onStopSharing && (
                        <button type="button" className={`btn-stop-sharing ${BTN} self-start`} onClick={() => void stopSharing(row)}>
                          Stop sharing
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div className="scenes-panel flex flex-col gap-3">
      <div className="scenes-save flex flex-col gap-2">
        <input
          type="text"
          aria-label="Save name"
          className="save-name-input rounded border border-[var(--line)] bg-transparent px-2 py-1 text-xs text-[var(--ink)]"
          placeholder={props.defaultName}
          maxLength={128}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="scenes-save-actions flex flex-wrap gap-2">
          <button
            type="button"
            className={`btn-save-scene ${BTN}`}
            disabled={!props.canSaveScene}
            onClick={() => void save('scene')}
          >
            Save scene
          </button>
          <button type="button" className={`btn-save-look ${BTN}`} onClick={() => void save('look')}>
            Save look
          </button>
        </div>
        {!props.canSaveScene && (
          <p className="save-scene-hint text-[11px] text-[var(--ink-dim)]">Load a song to save a scene.</p>
        )}
      </div>

      {list('scene', scenes)}
      {list('look', looks)}

      {status && <p className="scenes-status text-[11px] text-[var(--ink-dim)]">{status}</p>}
      {error && <p role="alert" className="scenes-error text-[11px] text-[#ff6b6b]">{error}</p>}
    </div>
  )
}
