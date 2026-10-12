import { useEffect, useState } from 'react'
import { useClock, useClockTime, useIvories, useLiveBpm } from '../hooks'
import { withProvider } from '../withProvider'
import { Guarded } from '../IvoriesBoundary'
import { formatTime } from '../format'
import { cx } from '../cx'
import { cancelPendingStart, resumeAudio, startPlayback } from '../startPlayback'
import { MAX_LIVE_BPM, MIN_LIVE_BPM, parseBpmDraft } from '../../core/render/beats'

export interface TransportControls { play?: boolean; seek?: boolean; tempo?: boolean; metronome?: boolean; bpm?: boolean }

/** Live BPM (no score). A half-typed or out-of-range value shows but is not committed (Review Focus 3). */
function BpmField() {
  const { bpm, setBpm } = useLiveBpm()
  const [draft, setDraft] = useState(String(bpm))
  useEffect(() => { setDraft(String(bpm)) }, [bpm])
  return (
    <label className="ivories-bpm">
      <span className="ivories-bpm-label">BPM</span>
      <input
        type="number" aria-label="BPM" className="ivories-bpm-input"
        min={MIN_LIVE_BPM} max={MAX_LIVE_BPM} step={1} value={draft}
        onChange={(e) => {
          const v = e.target.value
          setDraft(v)
          const n = parseBpmDraft(v)
          if (n !== null) setBpm(n)
        }}
        onBlur={() => setDraft(String(bpm))}
      />
    </label>
  )
}

function TransportView({ controls, className }: { controls?: TransportControls; className?: string }) {
  const iv = useIvories()
  const { clock, playing, rate } = useClock()
  const t = useClockTime(10)
  const c = { play: true, seek: true, tempo: true, metronome: true, bpm: true, ...controls }
  const duration = iv.score?.durationSec ?? 0
  const toggle = () => {
    if (playing) { cancelPendingStart(clock); clock.pause(); return }
    startPlayback(iv)
  }
  // Spec §8: blocked audio -> the clock runs silently and we offer a tap.
  const needsTap = iv.audio && playing && !iv.engine.running

  return (
    <div className={cx('ivories', 'ivories-transport', className)} role="group" aria-label="Playback">
      {c.play && (
        <button type="button" className="ivories-btn ivories-btn-play" onClick={toggle}>
          {playing ? 'Pause' : 'Play'}
        </button>
      )}
      {c.seek && (
        <input
          type="range" aria-label="Seek" className="ivories-seek"
          min={0} max={Math.max(duration, 0.001)} step={0.01}
          value={Math.min(Math.max(0, t), duration)}
          onChange={(e) => clock.seek(Number(e.target.value))}
        />
      )}
      <span className="ivories-time">{formatTime(t)} / {formatTime(duration)}</span>
      {c.bpm && !iv.score && <BpmField />}
      {c.tempo && (
        <label className="ivories-tempo">
          <span className="ivories-tempo-label">Tempo</span>
          <input
            type="range" aria-label="Tempo" className="ivories-tempo-input"
            min={0.25} max={2} step={0.05} value={rate}
            onChange={(e) => clock.setRate(Number(e.target.value))}
          />
          <span className="ivories-tempo-value">{Math.round(rate * 100)}%</span>
        </label>
      )}
      {c.metronome && (
        <label className="ivories-metronome">
          <input
            type="checkbox" aria-label="Metronome" className="ivories-metronome-input"
            checked={iv.settings.audio.metronome}
            onChange={(e) => iv.setAudio({ metronome: e.target.checked })}
          />
          <span className="ivories-metronome-label">Metronome</span>
        </label>
      )}
      {needsTap && (
        <button type="button" className="ivories-btn ivories-btn-enable-sound" onClick={() => resumeAudio(iv)}>
          Tap to enable sound
        </button>
      )}
    </div>
  )
}

/** Play/pause, seek bar, tempo (clock rate), metronome toggle, and the live BPM with no score. */
export const Transport = withProvider(
  (p: { controls?: TransportControls; className?: string }) => <Guarded><TransportView {...p} /></Guarded>,
  'Transport',
)
