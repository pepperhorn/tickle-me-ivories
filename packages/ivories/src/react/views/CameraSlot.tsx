import { useEffect, useRef, useState } from 'react'
import { CameraError, cameraStreams } from '../../core/camera/streams'
import { IvoriesError } from '../../core/errors'
import { validFill } from '../../core/layout/validate'
import { useIvoriesOptional } from '../hooks'
import type { StreamRegistry } from '../../core/camera/streams'
import type { CameraSource } from '../../core/layout/types'

export function useCameraStream(deviceId: string | undefined, registry: StreamRegistry = cameraStreams) {
  const [state, setState] = useState<{ stream: MediaStream | null; error: CameraError | null }>({ stream: null, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    let offEnded = () => {}
    setState({ stream: null, error: null })
    const lease = registry.acquire(deviceId)
    lease.promise.then(
      (stream) => {
        if (!live) return
        setState({ stream, error: null })
        const onEnded = () => { if (live) setState({ stream: null, error: new CameraError('ended') }) }
        const tracks = stream.getVideoTracks()
        for (const t of tracks) t.addEventListener('ended', onEnded)
        offEnded = () => { for (const t of tracks) t.removeEventListener('ended', onEnded) }
      },
      (e) => { if (live) setState({ stream: null, error: e instanceof CameraError ? e : new CameraError('unknown', e) }) },
    )
    return () => { live = false; offEnded(); lease.release() }
  }, [deviceId, attempt, registry])
  return { ...state, retry: () => setAttempt((a) => a + 1) }
}

function Webcam({ source, registry }: { source: Extract<CameraSource, { mode: 'webcam' }>; registry?: StreamRegistry }) {
  const ctx = useIvoriesOptional()
  const { stream, error, retry } = useCameraStream(source.deviceId, registry)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v || !stream) return
    v.srcObject = stream
    try { v.play()?.catch(() => {}) } catch { /* jsdom: not implemented */ }
    return () => { v.srcObject = null }
  }, [stream])

  useEffect(() => {
    if (error) ctx?.reportError(new IvoriesError('camera-unavailable', error.message, error))
  }, [error]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    // The layout is unaffected: the slot keeps its box and offers a retry.
    return (
      <div className="ivories ivories-camera ivories-camera-placeholder" role="alert" data-reason={error.reason}>
        <p className="ivories-camera-message">{error.message}</p>
        <button type="button" className="ivories-btn ivories-btn-retry" onClick={retry}>Retry</button>
      </div>
    )
  }
  return (
    <video
      ref={videoRef}
      className="ivories ivories-camera ivories-camera-video"
      autoPlay playsInline muted
      style={{ objectFit: source.fit, transform: source.mirror ? 'scaleX(-1)' : undefined }}
    />
  )
}

/** A live webcam, or a compositing mask: transparent (OBS alpha) or a validated chroma fill. */
export function CameraSlot({ source, registry }: { source: CameraSource; registry?: StreamRegistry }) {
  if (source.mode === 'mask') {
    const fill = validFill(source.fill) ?? 'transparent'
    return <div className="ivories ivories-camera ivories-camera-mask" data-fill={fill} style={{ background: fill }} />
  }
  return <Webcam source={source} registry={registry} />
}
