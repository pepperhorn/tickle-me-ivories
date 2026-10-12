import { useClock, useClockTime, useIvories } from '../hooks'
import { withProvider } from '../withProvider'
import { Guarded } from '../IvoriesBoundary'
import { formatTime } from '../format'
import { cx } from '../cx'
import { cancelPendingStart, resumeAudio, startPlayback } from '../startPlayback'

export interface TransportControls { play?: boolean; seek?: boolean; tempo?: boolean; metronome?: boolean }

function TransportView({ controls, className }: { controls?: TransportControls; className?: string }) {
  const iv = useIvories()
  const { clock, playing, rate } = useClock()
  const t = useClockTime(10)
  const c = { play: true, seek: true, tempo: true, metronome: true, ...controls }
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

/** Play/pause, seek bar, tempo (clock rate) and metronome toggle. */
export const Transport = withProvider(
  (p: { controls?: TransportControls; className?: string }) => <Guarded><TransportView {...p} /></Guarded>,
  'Transport',
)
