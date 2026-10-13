import { useCallback, useMemo, useRef } from 'react'
import { DEFAULT_SETTINGS, sameTempo } from 'ivories/core'
import type { AudioEngine, TempoSetting, Voice } from 'ivories/core'
import { playheadAt, useTransport } from '../transport/useTransport'
import { useSettings } from '../settings/useSettings'

export function usePlaybackActions(o: { engine: AudioEngine; onSeek(): void }) {
  const { engine } = o
  const onSeek = useRef(o.onSeek)
  onSeek.current = o.onSeek

  const liveHead = useCallback(() => playheadAt(useTransport.getState(), engine.currentTime), [engine])

  const seek = useCallback((sec: number) => {
    useTransport.getState().seek(sec, engine.currentTime)
    onSeek.current()
  }, [engine])

  // setTempo replaces score.notes, so App's notes effect rebuilds the
  // driver's cursors. The notes already handed to smplr at their old times are
  // cancelled by the driver on the clock's seek event, exactly as seek and pause.
  // A setting equal to the current one is a no-op: retiming to it would change
  // nothing but still cut every sustained note.
  const changeTempo = useCallback((setting: TempoSetting) => {
    if (sameTempo(setting, useTransport.getState().tempo)) return
    useTransport.getState().setTempo(setting, engine.currentTime)
  }, [engine])

  // Volume and instrument have audio-side effects; colour, label and visibility
  // are model-only and the draw loop picks them up on the next frame.
  const changeVoice = useCallback((id: string, patch: Partial<Voice>) => {
    useTransport.getState().updateVoice(id, patch)
    if (patch.volume !== undefined) engine.setVoiceVolume(id, patch.volume)
    if (patch.instrument !== undefined) {
      const v = useTransport.getState().score?.voices.find((x) => x.id === id)
      if (v) void engine.loadVoice(v)
    }
  }, [engine])

  // Master volume has an audio-side effect (the engine's gain node) as well as
  // a persisted setting, so it goes through its own callback rather than a
  // direct settings.setAudio call, mirroring changeVoice's split above.
  const changeMasterVolume = useCallback((v: number) => {
    useSettings.getState().setAudio({ masterVolume: v })
    engine.setMasterVolume(v)
  }, [engine])

  // Reset reaches the engine too, or the master gain stays at the old level.
  const resetSettings = useCallback(() => {
    useSettings.getState().reset()
    engine.setMasterVolume(DEFAULT_SETTINGS.audio.masterVolume)
  }, [engine])

  return useMemo(
    () => ({ liveHead, seek, changeTempo, changeVoice, changeMasterVolume, resetSettings }),
    [liveHead, seek, changeTempo, changeVoice, changeMasterVolume, resetSettings],
  )
}
