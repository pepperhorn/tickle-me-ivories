import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useClock, useClockTime, useIvories, useLiveBpm } from '../hooks'
import { withProvider } from '../withProvider'
import { Guarded } from '../IvoriesBoundary'
import { formatTime } from '../format'
import { cx } from '../cx'
import { cancelPendingStart, resumeAudio } from '../startPlayback'
import { MAX_LIVE_BPM, MIN_LIVE_BPM, parseBpmDraft } from '../../core/render/beats'
import { beatTickPositions } from '../../core/render/transportTicks'
import { clampCountIn, metreAt } from '../../core/model/countIn'
import { effectiveBpmAt } from '../../core/model/tempoMap'
import { METRONOME_VOICE_NAMES, validMetronomeVoice } from '../../core/audio/metronome'
import type { MetronomeVoiceName } from '../../core/settings/types'
import type { Clock } from '../../core/clock/types'
import type { ScoreDocument, TempoSetting } from '../../core/model/types'

/** `meter`: the time signature readout. The metronome voice select follows `metronome`. */
export interface TransportControls { play?: boolean; seek?: boolean; tempo?: boolean; metronome?: boolean; bpm?: boolean; countIn?: boolean; meter?: boolean }

/** The clock rate's bounds: the tempo control scales the score's tempo map between these. */
export const MIN_TEMPO_RATE = 0.25
export const MAX_TEMPO_RATE = 2

const METRONOME_VOICE_LABELS: Record<MetronomeVoiceName, string> = { woodblock: 'Woodblock', 'drum-machine': 'Drum machine', click: 'Click' }

/**
 * Tempo in BPM: the tempo map's BPM at the playhead times the clock rate ("♩ = 96"). The
 * slider and the field set a BPM, which becomes a rate against the BPM at the playhead, so
 * the whole tempo map scales (a ritardando stays a ritardando) and the readout follows it.
 */
function TempoField({ score, tempo, t, rate, clock }: { score: ScoreDocument; tempo: TempoSetting; t: number; rate: number; clock: Clock }) {
  const base = effectiveBpmAt(score.tempoMap, Math.max(0, t), tempo)
  const bpm = Math.round(base * rate)
  const min = Math.max(1, Math.ceil(base * MIN_TEMPO_RATE))
  const max = Math.floor(base * MAX_TEMPO_RATE)
  const setBpm = (v: number) => {
    if (!Number.isFinite(v) || base <= 0) return
    const next = Math.min(MAX_TEMPO_RATE, Math.max(MIN_TEMPO_RATE, v / base))
    if (Math.abs(next - rate) > 1e-9) clock.setRate(next)
  }
  const [draft, setDraft] = useState(String(bpm))
  const editing = useRef(false)
  useEffect(() => { if (!editing.current) setDraft(String(bpm)) }, [bpm])
  return (
    <span className="ivories-tempo ivories-transport-field" data-bpm={bpm}>
      <span className="ivories-tempo-label ivories-transport-label">Tempo</span>
      <input
        type="range" aria-label="Tempo" aria-valuetext={`${bpm} BPM`} className="ivories-tempo-input ivories-transport-range ivories-transport-tempo"
        min={min} max={max} step={1} value={Math.min(max, Math.max(min, bpm))}
        style={progress(bpm, min, max)}
        onChange={(e) => setBpm(Number(e.target.value))}
      />
      <span className="ivories-tempo-value ivories-transport-value">
        <span className="ivories-tempo-note" aria-hidden="true">{'\u2669 ='}</span>
        <input
          type="number" aria-label="Tempo in BPM" className="ivories-bpm-input ivories-tempo-bpm"
          min={min} max={max} step={1} value={draft}
          onFocus={() => { editing.current = true }}
          onChange={(e) => {
            setDraft(e.target.value)
            const n = Number(e.target.value)
            if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) setBpm(n)
          }}
          onBlur={() => { editing.current = false; setDraft(String(bpm)) }}
        />
      </span>
    </span>
  )
}


/** Half the seek thumb (14px): the thumb's centre runs from here to width - this. */
const THUMB_HALF_PX = 7

/**
 * The seek track, drawn under a transparent native range: the pepperscore-style
 * 4px track and fill, broken at every beat and marked more strongly at every bar
 * line (beatTickPositions). Static per score and width; only the fill moves.
 */
function SeekTrack({ score, tempo, progress }: { score: ScoreDocument | null; tempo: TempoSetting; progress: number }) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const inner = Math.max(0, width - 2 * THUMB_HALF_PX)
  const ticks = useMemo(() => (score && inner > 0 ? beatTickPositions(score, inner, tempo) : []), [score, inner, tempo])
  const { beats, bars } = useMemo(() => {
    let b = '', r = ''
    for (const t of ticks) {
      const x = (THUMB_HALF_PX + t.x).toFixed(1)
      if (t.bar) r += `M${x} 2V14`
      else b += `M${x} 5V11`
    }
    return { beats: b, bars: r }
  }, [ticks])
  const fillW = THUMB_HALF_PX + inner * Math.min(1, Math.max(0, progress))
  return (
    <svg ref={ref} className="ivories-seek-track" aria-hidden="true" focusable="false" height="16" data-beat-ticks={ticks.length}>
      <rect className="ivories-seek-track-bg" x="0" y="6" width="100%" height="4" rx="2" />
      <rect className="ivories-seek-track-fill" x="0" y="6" width={fillW} height="4" rx="2" />
      {beats && <path className="ivories-seek-beat-gaps" d={beats} />}
      {bars && <path className="ivories-seek-bar-gaps" d={bars} />}
      {bars && <path className="ivories-seek-bar-marks" d={bars} />}
    </svg>
  )
}

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
  const c = { play: true, seek: true, tempo: true, metronome: true, bpm: true, countIn: true, meter: true, ...controls }
  const duration = iv.score?.durationSec ?? 0
  const meter = iv.score ? metreAt(iv.score, t, iv.tempo) : null
  const toggle = () => {
    if (playing) { cancelPendingStart(clock); clock.pause(); return }
    iv.play()
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
        <span className="ivories-seek-wrap" data-count-in={t < 0 && !iv.parked() ? '' : undefined}>
          <SeekTrack score={iv.score} tempo={iv.tempo} progress={seekValue / seekMax} />
          <input
            type="range" aria-label="Seek" className="ivories-seek ivories-transport-range ivories-transport-seek"
            min={0} max={seekMax} step={0.01}
            value={seekValue}
            style={progress(seekValue, 0, seekMax)}
            onChange={(e) => clock.seek(Number(e.target.value))}
          />
        </span>
      )}
      {/* Live mode has no length: only the clock time. */}
      <span className="ivories-time ivories-transport-time">{iv.score ? `${formatTime(t)} / ${formatTime(duration)}` : formatTime(t)}</span>
      {c.bpm && iv.liveClockActive && <BpmField />}
      {c.meter && meter && (
        <span className="ivories-meter ivories-transport-meter" role="img" aria-label={`Time signature ${meter.numerator}/${meter.denominator}`} data-meter={`${meter.numerator}/${meter.denominator}`}>
          <span className="ivories-meter-value" aria-hidden="true">{meter.numerator}/{meter.denominator}</span>
        </span>
      )}
      {c.tempo && iv.score && <TempoField score={iv.score} tempo={iv.tempo} t={t} rate={rate} clock={clock} />}
      {c.countIn && iv.score && (
        <label className="ivories-count-in-field ivories-transport-field">
          <span className="ivories-count-in-label ivories-transport-label">Count-in</span>
          <select
            aria-label="Count-in" className="ivories-count-in-select ivories-transport-select"
            value={iv.countIn}
            onChange={(e) => iv.setCountIn(clampCountIn(Number(e.target.value)))}
          >
            <option className="ivories-count-in-option" value={0}>Off</option>
            <option className="ivories-count-in-option" value={1}>1 bar</option>
            <option className="ivories-count-in-option" value={2}>2 bars</option>
          </select>
        </label>
      )}
      {c.metronome && (
        // The switch and its sound select wrap together, as one control.
        <span className="ivories-metronome-group">
          <label className="ivories-metronome ivories-transport-field">
            {/* Label first, like every other field in the row (and pepperscore's switch rows). */}
            <span className="ivories-metronome-label ivories-transport-label">Metronome</span>
            <input
              type="checkbox" role="switch" aria-label="Metronome" className="ivories-metronome-input ivories-transport-switch"
              checked={iv.settings.audio.metronome}
              onChange={(e) => iv.setAudio({ metronome: e.target.checked })}
            />
          </label>
          <select
            aria-label="Metronome sound" className="ivories-metronome-voice ivories-transport-select"
            value={validMetronomeVoice(iv.settings.audio.metronomeVoice)}
            onChange={(e) => iv.setAudio({ metronomeVoice: validMetronomeVoice(e.target.value) })}
          >
            {METRONOME_VOICE_NAMES.map((v) => <option key={v} className="ivories-metronome-voice-option" value={v}>{METRONOME_VOICE_LABELS[v]}</option>)}
          </select>
        </span>
      )}
      {needsTap && (
        <button type="button" className="ivories-btn ivories-btn-enable-sound ivories-transport-enable-sound" onClick={() => resumeAudio(iv)}>
          Tap to enable sound
        </button>
      )}
    </div>
  )
}

/** Play/pause, seek bar (broken at every beat), time signature, tempo in BPM (scales the tempo map), count-in, metronome toggle and sound, and the live BPM with no score. */
export const Transport = withProvider(
  (p: { controls?: TransportControls; className?: string }) => <Guarded><TransportView {...p} /></Guarded>,
  'Transport',
)
