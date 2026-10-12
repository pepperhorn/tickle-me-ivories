export type CameraFailure = 'denied' | 'no-device' | 'in-use' | 'insecure' | 'ended' | 'unknown'

export const CAMERA_MESSAGES: Record<CameraFailure, string> = {
  denied: 'Camera permission was denied.',
  'no-device': 'No camera was found.',
  'in-use': 'The camera is in use by another app.',
  insecure: 'The camera needs a secure (https) page.',
  ended: 'The camera stopped.',
  unknown: 'The camera could not start.',
}

export class CameraError extends Error {
  readonly reason: CameraFailure

  constructor(reason: CameraFailure, cause?: unknown) {
    super(CAMERA_MESSAGES[reason], cause === undefined ? undefined : { cause })
    this.name = 'CameraError'
    this.reason = reason
  }
}

export function classifyCameraError(e: unknown): CameraFailure {
  switch ((e as { name?: string } | null)?.name) {
    case 'NotAllowedError': case 'SecurityError': return 'denied'
    case 'NotFoundError': case 'OverconstrainedError': return 'no-device'
    case 'NotReadableError': case 'AbortError': return 'in-use'
    default: return 'unknown'
  }
}

export interface MediaDevicesLike {
  getUserMedia(c: MediaStreamConstraints): Promise<MediaStream>
  enumerateDevices(): Promise<MediaDeviceInfo[]>
}

export interface CameraLease { promise: Promise<MediaStream>; release(): void }

// Read lazily on acquire, never at import: the module is SSR-safe.
const defaultDevices = (): MediaDevicesLike | null =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' ? navigator.mediaDevices : null
const defaultSecure = (): boolean =>
  typeof globalThis.isSecureContext === 'boolean' ? globalThis.isSecureContext : true

interface Entry { promise: Promise<MediaStream>; count: number; stream: MediaStream | null }

const stopStream = (s: MediaStream) => { for (const t of s.getTracks()) t.stop() }

function rejected(reason: CameraFailure): CameraLease {
  const promise = Promise.reject(new CameraError(reason))
  promise.catch(() => {})
  return { promise, release: () => {} }
}

/**
 * One getUserMedia stream per deviceId, shared by every slot showing it
 * (spec §5.3). Requested only when a slot mounts; stopped when the last
 * lease is released. A stream whose track ends is forgotten, so a retry
 * asks the browser again.
 */
export class StreamRegistry {
  private readonly entries = new Map<string, Entry>()
  private readonly devices: () => MediaDevicesLike | null
  private readonly secure: () => boolean

  constructor(devices: () => MediaDevicesLike | null = defaultDevices, secure: () => boolean = defaultSecure) {
    this.devices = devices
    this.secure = secure
  }

  acquire(deviceId?: string): CameraLease {
    const key = deviceId || 'default'
    let entry = this.entries.get(key)
    if (entry) {
      entry.count++
    } else {
      if (!this.secure()) return rejected('insecure')
      const md = this.devices()
      if (!md) return rejected('no-device')
      const created: Entry = { promise: Promise.resolve(null as unknown as MediaStream), count: 1, stream: null }
      created.promise = md.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false }).then(
        (stream) => {
          created.stream = stream
          for (const track of stream.getVideoTracks()) {
            track.addEventListener('ended', () => { if (this.entries.get(key) === created) this.entries.delete(key) })
          }
          if (created.count <= 0) stopStream(stream)
          return stream
        },
        (e) => {
          if (this.entries.get(key) === created) this.entries.delete(key)
          throw new CameraError(classifyCameraError(e), e)
        },
      )
      created.promise.catch(() => {})
      this.entries.set(key, created)
      entry = created
    }
    const held = entry
    let released = false
    return {
      promise: held.promise,
      release: () => {
        if (released) return
        released = true
        held.count--
        if (held.count > 0) return
        if (this.entries.get(key) === held) this.entries.delete(key)
        if (held.stream) stopStream(held.stream)
      },
    }
  }
}

/** The page-wide registry every CameraSlot uses by default. */
export const cameraStreams = new StreamRegistry()

/** Video inputs for a device picker; labels are blank until permission is granted. */
export async function listVideoInputs(devices: () => MediaDevicesLike | null = defaultDevices): Promise<{ deviceId: string; label: string }[]> {
  const md = devices()
  if (!md) return []
  try {
    const all = await md.enumerateDevices()
    return all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
  } catch {
    return []
  }
}
