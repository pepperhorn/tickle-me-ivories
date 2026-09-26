// Scene/look/share orchestration (task 2.5), kept out of App so App only
// wires it (preflight "Fit"). Owns:
//
// - the share preview: `platform.share.match(location)` on mount, falling
//   back to the default HashShareProvider (preflight F12), resolved and
//   decoded through decodeScene/decodeLook before anything is shown. It is
//   never applied silently (spec §7): only Apply applies. Apply, Save a copy
//   and Dismiss clear the `#share=` hash (F19a) so a reload does not re-show
//   the banner.
// - the §8.3 "drop the file to continue" flow (preflight F2): opening a scene
//   whose songKey is the loaded score's id applies it directly; a `local` ref
//   for any other song asks for the file, checks its hash on drop, and
//   refuses a mismatch with "use anyway (voices may not match)". A `midi` ref
//   carries its bytes, which are hashed against the ref's sha256 first (2.3
//   review carry) -- a mismatch is handled exactly like a local mismatch.
//
// None of this state is read by the draw loop (F15): it lives in React state
// and changes only on user action or the one-off mount resolve.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LookV1, ResolvedShare, SceneV1, ShareProvider } from '../platform/types'
import { getDefaults, getPlatform } from '../platform/registry'
import { decodeScene, songKey } from '../platform/scene'
import { decodeLook } from '../platform/look'
import { isPayloadVersionError } from '../platform/codec'
import { hashFile } from '../io/hashFile'
import type { AudioSettings } from '../settings/types'
import { saveErrorMessage } from './saveErrors'
import type { SharePreviewView } from './SharedPreviewBanner'

/** What the app does on the hook's behalf. */
export interface ScenesHost {
  /** The loaded score's id (its content hash), or null with nothing loaded. */
  scoreId: () => string | null
  /** Applies a scene to the loaded score. Throws with a user-facing message. */
  applyScene: (scene: SceneV1, shared: boolean) => void
  applyLook: (look: LookV1) => void
  /**
   * Replaces whatever is loaded with this file (the current song is unloaded
   * only once the new file has parsed). `onLoaded` runs synchronously the
   * moment the file is the loaded score, before the audio half of the load
   * starts, so a scene applied there is what the audio half loads. Resolves
   * true after `onLoaded`, false if the file was refused; never rejects.
   */
  replaceSong: (file: File, onLoaded: () => void) => Promise<boolean>
  /** The recipient's own device audio, stamped into a saved copy of a shared scene. */
  currentAudio: () => AudioSettings
}

type Preview =
  | { kind: 'scene'; payload: SceneV1; owner: string | null; saved: boolean }
  | { kind: 'look'; payload: LookV1; owner: string | null; saved: boolean }

export interface PendingScene {
  scene: SceneV1
  shared: boolean
  /** The file (dropped, or rebuilt from a midi ref) whose hash did not match. */
  mismatch: File | null
}

/** Removes `#share=…` from the address without a navigation (F19a). */
export function clearShareHash(): void {
  if (!location.hash) return
  history.replaceState(history.state, '', location.pathname + location.search)
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function decodeResolved(r: ResolvedShare): Preview {
  const owner = r.owner?.handle ?? null
  return r.kind === 'scene'
    ? { kind: 'scene', payload: decodeScene(r.payload), owner, saved: false }
    : { kind: 'look', payload: decodeLook(r.payload), owner, saved: false }
}

/** Finds and resolves a share link in the current location: the installed
    provider first, then the default one (F12). Null when the URL is not a
    share link at all; throws (a user-facing message) when it is one that
    cannot be opened. */
async function resolveShareFromLocation(): Promise<Preview | null> {
  const loc = { pathname: location.pathname, hash: location.hash }
  const providers: ShareProvider[] = [getPlatform().share]
  const fallback = getDefaults().share
  if (!providers.includes(fallback)) providers.push(fallback)

  let matched = false
  for (const p of providers) {
    const code = p.match(loc)
    if (!code) continue
    matched = true
    let resolved: ResolvedShare | null = null
    try { resolved = await p.resolve(code) } catch { resolved = null }
    if (!resolved) continue
    try {
      return decodeResolved(resolved)
    } catch (e) {
      if (isPayloadVersionError(e)) throw new Error(e.message)
      throw new Error(`This shared ${resolved.kind} could not be opened. ${saveErrorMessage(e, 'It is not valid.')}`)
    }
  }
  if (matched) throw new Error('This share link could not be opened. It may be incomplete or damaged.')
  return null
}

export function useScenes(host: ScenesHost) {
  const hostRef = useRef(host)
  useEffect(() => { hostRef.current = host })

  const [preview, setPreview] = useState<Preview | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingScene | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The state drives the buttons; the ref is the synchronous guard, so a
  // second drop (or a Cancel) cannot race a hash check or a load in flight.
  const busyRef = useRef(false)
  const runBusy = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try { await fn() } finally { busyRef.current = false; setBusy(false) }
  }, [])
  /** Bumped whenever a save is written from outside the panel ("Save a copy"). */
  const [savesVersion, setSavesVersion] = useState(0)

  useEffect(() => {
    let alive = true
    resolveShareFromLocation().then(
      (p) => { if (alive && p) setPreview(p) },
      (e: Error) => { if (alive) setShareError(e.message) },
    )
    return () => { alive = false }
  }, [])

  const applyNow = useCallback((scene: SceneV1, shared: boolean) => {
    try {
      hostRef.current.applyScene(scene, shared)
      setMessage(null)
    } catch (e) {
      // applyScene throws messages already written for the user.
      setMessage(e instanceof Error && e.message ? e.message : 'Could not apply the scene.')
    }
  }, [])

  /** Loads `file` as the song and applies the scene the moment it is loaded
      (inside replaceSong's onLoaded, before the audio half runs). Not guarded:
      callers run it inside runBusy. */
  const finishWithFile = useCallback(async (scene: SceneV1, shared: boolean, file: File) => {
    await hostRef.current.replaceSong(file, () => {
      setPending(null)
      applyNow(scene, shared)
    })
  }, [applyNow])

  /** Checks a candidate song file against the scene's hash, busy throughout. */
  const checkFile = useCallback((scene: SceneV1, shared: boolean, file: File) => runBusy(async () => {
    const song = scene.song
    if (song.kind !== 'local' && song.kind !== 'midi') return
    let hash: string
    try {
      hash = await hashFile(await file.arrayBuffer())
    } catch (e) {
      setMessage(`Could not check ${file.name}: ${(e as Error).message}`)
      return
    }
    if (hash === song.sha256) {
      await finishWithFile(scene, shared, file)
    } else {
      setPending({ scene, shared, mismatch: file })
    }
  }), [runBusy, finishWithFile])

  /** Opens a scene (from a save or an applied share). */
  const openScene = useCallback(async (scene: SceneV1, shared: boolean) => {
    setMessage(null)
    if (hostRef.current.scoreId() === songKey(scene.song)) {
      setPending(null)
      applyNow(scene, shared)
      return
    }
    const song = scene.song
    if (song.kind === 'local') {
      setPending({ scene, shared, mismatch: null })
      return
    }
    if (song.kind === 'midi') {
      let file: File
      try {
        file = new File([base64ToBytes(song.dataB64)], song.name, { type: 'audio/midi' })
      } catch {
        setMessage('This scene’s embedded song could not be read.')
        return
      }
      await checkFile(scene, shared, file)
      return
    }
    setMessage('This scene’s song is not available in this version of the app.')
  }, [applyNow, checkFile])

  const applyLookNow = useCallback((look: LookV1) => {
    try {
      hostRef.current.applyLook(look)
      setMessage(null)
    } catch (e) {
      setMessage(saveErrorMessage(e, 'Could not apply the look'))
    }
  }, [])

  // ---- the preview banner ----

  const applyPreview = useCallback(() => {
    const p = preview
    if (!p) return
    clearShareHash()
    setPreview(null)
    if (p.kind === 'look') applyLookNow(p.payload)
    else void openScene(p.payload, true)
  }, [preview, applyLookNow, openScene])

  const saveCopy = useCallback(async () => {
    const p = preview
    if (!p) return
    setBusy(true)
    try {
      const storage = getPlatform().storage
      if (p.kind === 'scene') {
        // A later load of this copy is an own scene (shared:false), which
        // applies global.audio -- so the sharer's device audio must not be
        // what is stored. Stamp in the recipient's own.
        const copy = structuredClone(p.payload)
        copy.profile.global.audio = hostRef.current.currentAudio()
        await storage.save({ kind: 'scene', name: p.payload.song.title || 'Shared scene', payload: copy })
      }
      else await storage.save({ kind: 'look', name: 'Shared look', payload: p.payload })
      clearShareHash()
      setPreview({ ...p, saved: true })
      setSavesVersion((n) => n + 1)
      setMessage(null)
    } catch (e) {
      setMessage(saveErrorMessage(e, `Could not save a copy of the ${p.kind}`))
    } finally {
      setBusy(false)
    }
  }, [preview])

  const dismissPreview = useCallback(() => {
    clearShareHash()
    setPreview(null)
    setShareError(null)
  }, [])

  // ---- the §8.3 file prompt ----

  const provideFile = useCallback((file: File) => {
    if (!pending) return
    void checkFile(pending.scene, pending.shared, file)
  }, [pending, checkFile])

  const acceptMismatch = useCallback(() => {
    if (!pending?.mismatch) return
    const { scene, shared, mismatch } = pending
    void runBusy(() => finishWithFile(scene, shared, mismatch))
  }, [pending, runBusy, finishWithFile])

  const cancelPending = useCallback(() => {
    if (busyRef.current) return
    setPending(null)
    setMessage(null)
  }, [])
  const clearMessage = useCallback(() => setMessage(null), [])

  const previewView: SharePreviewView | null = preview
    ? {
        kind: preview.kind,
        title: preview.kind === 'scene' ? preview.payload.song.title : '',
        owner: preview.owner,
        saved: preview.saved,
      }
    : null

  const pendingSongName = pending
    ? ('name' in pending.scene.song ? pending.scene.song.name : pending.scene.song.title)
    : ''

  return {
    preview: previewView, shareError, pending, pendingSongName, message, busy, savesVersion,
    applyPreview, saveCopy, dismissPreview,
    openScene, applyLook: applyLookNow,
    provideFile, acceptMismatch, cancelPending, clearMessage,
  }
}
