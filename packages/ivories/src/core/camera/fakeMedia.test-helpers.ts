import { vi } from 'vitest'

export class FakeTrack extends EventTarget {
  readyState: MediaStreamTrackState = 'live'
  stop = vi.fn(() => { this.readyState = 'ended' })
  end() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')) }
}

export function fakeStream() {
  const track = new FakeTrack()
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

export function fakeDevices(fail?: string) {
  const made: ReturnType<typeof fakeStream>[] = []
  const devices = {
    getUserMedia: vi.fn(async () => {
      if (fail) throw Object.assign(new Error(fail), { name: fail })
      const s = fakeStream()
      made.push(s)
      return s.stream
    }),
    enumerateDevices: vi.fn(async () => [
      { kind: 'videoinput', deviceId: 'cam-1', label: '' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
    ] as MediaDeviceInfo[]),
  }
  return { devices, made }
}
