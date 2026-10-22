import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useIvories } from '../hooks'
import { withProvider } from '../withProvider'
import { Guarded } from '../IvoriesBoundary'
import { cx } from '../cx'
import { IvoriesError } from '../../core/errors'
import { fromOwnTempoSec, toOwnTempoSec } from '../../core/model/ownTime'
import { loadPepperscore } from './loadPepperscore'
import { toExternalClock } from './externalClock'
import type { PepperScoreClockHandle, PepperScoreComponent } from './loadPepperscore'

/** `paper` (default): the engraving sits on a light card, readable on the dark stage.
    `ink-on-dark`: no card; the engraving is inverted to light ink on the dark stage. */
export type NotationTheme = 'paper' | 'ink-on-dark'

export interface NotationProps {
  view?: 'vertical' | 'endless'
  /** pepperscore stave scale (settings.zoom). */
  zoom?: number
  height?: number | string
  className?: string
  /** Surface for the engraving (default `paper`). */
  notationTheme?: NotationTheme
  /** The pepperscore handle (seek, currentTime), e.g. for an e2e sync check. */
  scoreRef?: Ref<PepperScoreClockHandle>
}

function NotationView({ view = 'vertical', zoom, height, className, notationTheme, scoreRef }: NotationProps) {
  const iv = useIvories()
  const [loaded, setLoaded] = useState<{ C: PepperScoreComponent | null; error: IvoriesError | null }>({ C: null, error: null })
  const xml = iv.score?.rawXml
  const needsXml = iv.score !== null && !xml

  // Read on every adapter call, so the adapter's identity tracks the clock only (R17).
  const mapRef = useRef({ score: iv.score, tempo: iv.tempo, report: iv.reportError })
  mapRef.current = { score: iv.score, tempo: iv.tempo, report: iv.reportError }
  const adapter = useMemo(() => toExternalClock(iv.clock, () => {
    const { score, tempo } = mapRef.current
    return (t: number) => (score ? toOwnTempoSec(score, tempo, t) : t)
  }), [iv.clock])

  // pepperscore reports own-tempo seconds; the provider clock runs on provider time.
  const onSeek = useCallback((seconds: number) => {
    const { score, tempo } = mapRef.current
    iv.clock.seek(score ? fromOwnTempoSec(score, tempo, seconds) : seconds)
  }, [iv.clock])
  const onError = useCallback((e: Error) => {
    mapRef.current.report(new IvoriesError('notation-unavailable', e.message, e))
  }, [])
  const settings = useMemo(() => (zoom !== undefined ? { zoom } : undefined), [zoom])

  useEffect(() => {
    if (needsXml) mapRef.current.report(new IvoriesError('notation-needs-musicxml', 'Notation needs a MusicXML score; this one is MIDI.'))
  }, [needsXml])

  useEffect(() => {
    if (!xml) return
    let live = true
    loadPepperscore().then(
      (C) => { if (live) setLoaded({ C, error: null }) },
      (e) => {
        if (!live) return
        const err = new IvoriesError('notation-unavailable', 'The notation view could not load (it needs pepperscore 0.2 or later).', e)
        setLoaded({ C: null, error: err })
        mapRef.current.report(err)
      },
    )
    return () => { live = false }
  }, [xml])

  const C = loaded.C
  const theme: NotationTheme = notationTheme === 'ink-on-dark' ? 'ink-on-dark' : 'paper'
  return (
    <div
      className={cx('ivories', 'ivories-view', 'ivories-notation', `ivories-notation-${theme}`, className)}
      data-ivories-view={view === 'endless' ? 'endless' : 'notation'}
      data-notation-theme={theme}
      style={height !== undefined ? { height } : undefined}
    >
      {!iv.score ? null
        : needsXml ? <p className="ivories-message" role="status">Notation needs MusicXML. This score is MIDI.</p>
        : loaded.error ? <p className="ivories-message" role="alert">{loaded.error.message}</p>
        : C ? (
          <C
            ref={scoreRef}
            musicXml={xml}
            chrome="none"
            audio={false}
            clock={adapter}
            onSeek={onSeek}
            view={view}
            settings={settings}
            height="fill"
            className="ivories-notation-score"
            onError={onError}
          />
        )
        : <p className="ivories-message" role="status">Loading notation…</p>}
    </div>
  )
}

function GuardedNotation(props: NotationProps) {
  return <Guarded code="notation-unavailable"><NotationView {...props} /></Guarded>
}

/** pepperscore driven by the provider clock (spec §4.3). A failure here never stops sibling views. */
export const Notation = withProvider(GuardedNotation, 'Notation')
