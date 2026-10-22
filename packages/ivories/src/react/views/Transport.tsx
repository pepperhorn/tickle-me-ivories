import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useClock, useClockTime, useIvories, useLiveBpm } from '../hooks'
import { withProvider } from '../withProvider'
import { Guarded } from '../IvoriesBoundary'
import { formatTime } from '../format'
import { cx } from '../cx'
import { cancelPendingStart, resumeAudio, startPlayback } from '../startPlayback'
import { MAX_LIVE_BPM, MIN_LIVE_BPM, parseBpmDraft } from '../../core/render/beats'

export interface TransportControls { play?: boolean; seek?: boolean; tempo?: boolean; metronome?: boolean; bpm?: boolean }

/** Filled share of a range input, read by the track gradient (WebKit has no ::range-progress). */
const progress = (value: number, min: number, max: number): CSSProperties =>
  ({ '--ivories-range-progress': `${max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0}%` }) as CSSProperties

function PlayIcon() {
  return <svg className="ivories-transport-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" fill="currentColor" /></svg>
}

function PauseIcon() {
  return <svg className="ivories-transport-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /><rect x="14" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /></svg>
}

/** Live BPM (no score). A half-typed or out-of-range value shows but is not committed (Review Focus 3). */
function BpmField() {
  const { bpm, setBpm } = useLiveBpm()
  const [draft, setDraft] = useState(String(bpm))
  useEffect(() => { setDraft(String(bpm)) }, [bpm])
  return (
    <label className="ivories-bpm ivories-transport-field">
      <span className="ivories-bpm-label ivories-transport-label">BPM</span>
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

  const seekValue = Math.min(Math.max(0, t), duration)
  const seekMax = Math.max(duration, 0.001)

  return (
    <div className={cx('ivories', 'ivories-transport', className)} role="group" aria-label="Playback" data-playing={playing ? '' : undefined}>
      {c.play && (
        <button type="button" className="ivories-btn ivories-btn-play ivories-transport-play" onClick={toggle}>
          {playing ? <PauseIcon /> : <PlayIcon />}
          <span className="ivories-transport-play-label">{playing ? 'Pause' : 'Play'}</span>
        </button>
      )}
      {c.seek && (
        <input
          type="range" aria-label="Seek" className="ivories-seek ivories-transport-range ivories-transport-seek"
          min={0} max={seekMax} step={0.01}
          value={seekValue}
          style={progress(seekValue, 0, seekMax)}
          onChange={(e) => clock.seek(Number(e.target.value))}
        />
      )}
      {/* Live mode has no length: only the clock time. */}
      <span className="ivories-time ivories-transport-time">{iv.score ? `${formatTime(t)} / ${formatTime(duration)}` : formatTime(t)}</span>
      {c.bpm && iv.liveClockActive && <BpmField />}
      {c.tempo && (
        <label className="ivories-tempo ivories-transport-field">
          <span className="ivories-tempo-label ivories-transport-label">Tempo</span>
          <input
            type="range" aria-label="Tempo" className="ivories-tempo-input ivories-transport-range ivories-transport-tempo"
            min={0.25} max={2} step={0.05} value={rate}
            style={progress(rate, 0.25, 2)}
            onChange={(e) => clock.setRate(Number(e.target.value))}
          />
          <span className="ivories-tempo-value ivories-transport-value">{Math.round(rate * 100)}%</span>
        </label>
      )}
      {c.metronome && (
        <label className="ivories-metronome ivories-transport-field">
          <input
            type="checkbox" role="switch" aria-label="Metronome" className="ivories-metronome-input ivories-transport-switch"
            checked={iv.settings.audio.metronome}
            onChange={(e) => iv.setAudio({ metronome: e.target.checked })}
          />
          <span className="ivories-metronome-label ivories-transport-label">Metronome</span>
        </label>
      )}
      {needsTap && (
        <button type="button" className="ivories-btn ivories-btn-enable-sound ivories-transport-enable-sound" onClick={() => resumeAudio(iv)}>
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
