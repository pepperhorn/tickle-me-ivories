import { useEffect, useState } from 'react'
import { listMidiDevices } from 'ivories/core'
import { SettingsRow } from '../ui/SettingsPanel'
import { useLiveMidi } from './liveMidi'

export function LiveMidiSettings() {
  const { enabled, deviceId, audio, error, set } = useLiveMidi()
  const [devices, setDevices] = useState<{ id: string; name: string }[] | null>(null)

  useEffect(() => {
    if (!enabled) { setDevices(null); return }
    let live = true
    void listMidiDevices().then((d) => { if (live) setDevices(d) })
    return () => { live = false }
  }, [enabled])

  // The stage shows no inline message for MIDI (onError only), so say it here.
  const status = !enabled ? null : error ?? (devices !== null && devices.length === 0 ? 'No MIDI devices found' : null)

  return (
    <div className="live-midi-settings flex flex-col gap-2">
      <SettingsRow label="Live MIDI input" htmlFor="live-midi-input">
        <input
          id="live-midi-input" type="checkbox" aria-label="Live MIDI input"
          className="live-midi-toggle accent-[var(--accent)]"
          checked={enabled} onChange={(e) => set({ enabled: e.target.checked, error: null })}
        />
      </SettingsRow>
      {enabled && (
        <SettingsRow label="Device" htmlFor="midi-device">
          <select
            id="midi-device" aria-label="MIDI device"
            className="midi-device-select rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs"
            value={deviceId ?? ''} onChange={(e) => set({ deviceId: e.target.value || null })}
          >
            <option value="">All devices</option>
            {(devices ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </SettingsRow>
      )}
      {status && (
        <p role="status" className="live-midi-status text-xs text-[#ff6b6b]">{status}</p>
      )}
      <SettingsRow label="Play live notes" htmlFor="live-audio">
        <input
          id="live-audio" type="checkbox" aria-label="Play live notes"
          className="live-audio-toggle accent-[var(--accent)]"
          checked={audio} onChange={(e) => set({ audio: e.target.checked })}
        />
      </SettingsRow>
    </div>
  )
}
