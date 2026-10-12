import type { ReactNode } from 'react'
import { DisplaySettings } from '../ui/DisplaySettings'
import { ProfileSettings } from '../ui/ProfileSettings'
import { SettingsPanel, SettingsRow, SettingsSection } from '../ui/SettingsPanel'
import { TempoControl } from '../ui/TempoControl'
import { TextSettings } from '../ui/TextSettings'
import { ThemeSettings } from '../ui/ThemeSettings'
import { VelocityEditor } from '../ui/VelocityEditor'
import { VoicePanel } from '../ui/VoicePanel'
import { LiveMidiSettings } from './LiveMidiSettings'
import { useTransport } from '../transport/useTransport'
import { useSettings } from '../settings/useSettings'
import type { usePlaybackActions } from './usePlaybackActions'
import type { useProfileActions } from './useProfileActions'

/** The Settings button and its panel, hosted by the TransportBar. */
export function StudioSettings(props: {
  open: boolean
  onToggle(): void
  onClose(): void
  effectiveBpm: number
  actions: ReturnType<typeof usePlaybackActions>
  profile: ReturnType<typeof useProfileActions>
  scenesSection: ReactNode
}) {
  const t = useTransport()
  const settings = useSettings()
  const { effectiveBpm } = props
  const { changeTempo, changeVoice, changeMasterVolume, resetSettings } = props.actions
  const { exportProfile, importProfile, profileError } = props.profile
  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={props.open}
        className="btn-settings rounded-md border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink-dim)]"
        onClick={props.onToggle}
      >
        Settings
      </button>
      <SettingsPanel open={props.open} onClose={props.onClose}>
        <SettingsSection id="tempo" title="Tempo" defaultOpen>
          <TempoControl tempo={t.tempo} effectiveBpm={effectiveBpm} onChange={changeTempo} />
        </SettingsSection>
        <SettingsSection id="voices" title="Voices">
          <VoicePanel voices={t.score?.voices ?? []} onChange={changeVoice} />
        </SettingsSection>
        <SettingsSection id="velocity" title="Velocity colour">
          <VelocityEditor scheme={settings.velocity} onChange={settings.setVelocity} />
        </SettingsSection>
        <SettingsSection id="display" title="Display">
          <DisplaySettings
            display={settings.display}
            fallSeconds={t.fallSeconds}
            onDisplay={settings.setDisplay}
            onFallSeconds={t.setFallSeconds}
          />
        </SettingsSection>
        <SettingsSection id="theme" title="Theme &amp; compositing">
          <ThemeSettings theme={settings.theme} onChange={settings.setTheme} />
        </SettingsSection>
        <SettingsSection id="text" title="On-stage text">
          <TextSettings
            text={settings.text}
            onChange={settings.setText}
            onStyle={settings.setTextStyle}
          />
        </SettingsSection>
        <SettingsSection id="audio" title="Audio">
          <SettingsRow label="Master volume" htmlFor="master-volume">
            <input
              id="master-volume" type="range" aria-label="Master volume"
              className="master-volume-slider h-1 w-32 accent-[var(--accent)]"
              min={0} max={1} step={0.01} value={settings.audio.masterVolume}
              onChange={(e) => changeMasterVolume(Number(e.target.value))}
            />
          </SettingsRow>
          <SettingsRow label="Metronome">
            <input
              type="checkbox" aria-label="Metronome"
              className="metronome-toggle accent-[var(--accent)]"
              checked={settings.audio.metronome}
              onChange={(e) => settings.setAudio({ metronome: e.target.checked })}
            />
          </SettingsRow>
          <SettingsRow label="Count-in">
            <input
              type="checkbox" aria-label="Count-in"
              className="count-in-toggle accent-[var(--accent)]"
              checked={settings.audio.countIn !== false}
              onChange={(e) => settings.setAudio({ countIn: e.target.checked })}
            />
          </SettingsRow>
          <SettingsRow label="Metronome volume" htmlFor="metronome-volume">
            <input
              id="metronome-volume" type="range" aria-label="Metronome volume"
              className="metronome-volume-slider h-1 w-32 accent-[var(--accent)]"
              min={0} max={1} step={0.01} value={settings.audio.metronomeVolume}
              disabled={!settings.audio.metronome}
              onChange={(e) => settings.setAudio({ metronomeVolume: Number(e.target.value) })}
            />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection id="live-midi" title="Live MIDI">
          <LiveMidiSettings />
        </SettingsSection>
        <SettingsSection id="scenes" title="Scenes &amp; looks">
          {props.scenesSection}
        </SettingsSection>
        <SettingsSection id="profile" title="Profile">
          <ProfileSettings
            onExport={exportProfile}
            onImport={(f, g) => void importProfile(f, g)}
            onReset={resetSettings}
            error={profileError}
          />
        </SettingsSection>
      </SettingsPanel>
    </>
  )
}
