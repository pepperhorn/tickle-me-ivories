import { useState } from 'react'
import { ScenesPanel } from '../ui/ScenesPanel'
import { SharePanel } from '../ui/SharePanel'
import type { LookV1, SaveSummary, SceneV2 } from 'ivories/core'
import { activeStorage, getDefaults } from '../platform/registry'
import type { Platform } from '../platform/registry'
import type { useScenes } from '../ui/useScenes'
import { useAuthState } from '../ui/useAuthState'

type Source = 'account' | 'browser'

/** One instance of the panel pair, hosted by the Settings panel with a song
    loaded and by the empty-stage card without one. Loading a scene with no
    song starts the §8.3 drop-the-file flow. With a remote provider, saves live
    in the account only while signed in (Review Focus 5); activeStorage()
    encodes that rule, and the toggle can still pick this browser's saves. */
export function ScenesSection(props: {
  platform: Platform
  scenes: ReturnType<typeof useScenes>
  canSave: boolean
  defaultName: string
  buildScene(): SceneV2
  /** The scene as it may leave this browser (sceneForShare: no camera deviceIds). */
  buildShareScene(): SceneV2
  buildLook(): LookV1
}) {
  const { platform, scenes } = props
  // Subscribed so the panel re-renders (and re-picks its storage) on sign-in/out.
  const auth = useAuthState(platform.auth)
  const [source, setSource] = useState<Source>('account')
  const remote = platform.storage.remote
  const signedIn = auth?.status === 'signed-in'
  const storage = remote && source === 'browser' ? getDefaults().storage : activeStorage(platform)
  const useAccount = remote && signedIn && storage === platform.storage
  const { shareSaved, revoke } = platform.share

  return (
    <>
      {remote && signedIn && (
        <div className="saves-source-toggle flex gap-1" role="group" aria-label="Where saves are kept">
          {(['account', 'browser'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              className={`btn-saves-source btn-saves-source--${s} rounded-full border border-[var(--line)] px-3 py-1 text-[11px] ${source === s ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-dim)]'}`}
              onClick={() => setSource(s)}
            >
              {s === 'account' ? 'Account' : 'This browser'}
            </button>
          ))}
        </div>
      )}
      <ScenesPanel
        storage={storage}
        refreshKey={scenes.savesVersion}
        canSaveScene={props.canSave}
        defaultName={props.defaultName}
        buildScene={props.buildScene}
        buildLook={props.buildLook}
        onOpenScene={(s) => void scenes.openScene(s, false)}
        onApplyLook={scenes.applyLook}
        {...(useAccount && shareSaved
          ? { onShareSaved: (row: SaveSummary, v: 'link_view') => shareSaved.call(platform.share, row.kind, row.id, v) }
          : {})}
        {...(useAccount && revoke ? { onStopSharing: (code: string) => revoke.call(platform.share, code) } : {})}
      />
      <SharePanel
        share={platform.share}
        canShareScene={props.canSave}
        buildScene={props.buildShareScene}
        buildLook={props.buildLook}
        signedIn={signedIn}
      />
    </>
  )
}
