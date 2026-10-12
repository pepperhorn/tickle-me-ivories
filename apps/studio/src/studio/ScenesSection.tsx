import { ScenesPanel } from '../ui/ScenesPanel'
import { SharePanel } from '../ui/SharePanel'
import type { LookV1, SceneV2 } from 'ivories/core'
import type { Platform } from '../platform/registry'
import type { useScenes } from '../ui/useScenes'

/** One instance of the panel pair, hosted by the Settings panel with a song
    loaded and by the empty-stage card without one. Loading a scene with no
    song starts the §8.3 drop-the-file flow. */
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
  return (
    <>
      <ScenesPanel
        storage={platform.storage}
        refreshKey={scenes.savesVersion}
        canSaveScene={props.canSave}
        defaultName={props.defaultName}
        buildScene={props.buildScene}
        buildLook={props.buildLook}
        onOpenScene={(s) => void scenes.openScene(s, false)}
        onApplyLook={scenes.applyLook}
      />
      <SharePanel
        share={platform.share}
        canShareScene={props.canSave}
        buildScene={props.buildShareScene}
        buildLook={props.buildLook}
      />
    </>
  )
}
