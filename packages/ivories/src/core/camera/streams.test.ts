import { describe, it, expect } from 'vitest'
import { StreamRegistry, classifyCameraError, listVideoInputs } from './streams'
import { fakeDevices } from './fakeMedia.test-helpers'

describe('camera streams (spec §5.3)', () => {
  it('one stream per deviceId, shared by slots; stopped only when the last slot lets go', async () => {
    const f = fakeDevices()
    const reg = new StreamRegistry(() => f.devices, () => true)
    const a = reg.acquire('cam-1'), b = reg.acquire('cam-1')
    expect(await a.promise).toBe(await b.promise)
    expect(f.devices.getUserMedia).toHaveBeenCalledTimes(1)
    expect(f.devices.getUserMedia).toHaveBeenCalledWith({ video: { deviceId: { exact: 'cam-1' } }, audio: false })
    a.release(); a.release()               // idempotent
    expect(f.made[0].track.stop).not.toHaveBeenCalled()
    b.release()
    expect(f.made[0].track.stop).toHaveBeenCalled()
  })

  it('a stream whose track ends is dropped, so the next acquire asks again (Review Focus 1)', async () => {
    const f = fakeDevices()
    const reg = new StreamRegistry(() => f.devices, () => true)
    await reg.acquire(undefined).promise
    f.made[0].track.end()
    await reg.acquire(undefined).promise
    expect(f.devices.getUserMedia).toHaveBeenCalledTimes(2)
  })

  it('maps failures: denied, no device, in use, insecure origin', async () => {
    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('denied')
    expect(classifyCameraError({ name: 'NotFoundError' })).toBe('no-device')
    expect(classifyCameraError({ name: 'OverconstrainedError' })).toBe('no-device')
    expect(classifyCameraError({ name: 'NotReadableError' })).toBe('in-use')
    const insecure = new StreamRegistry(() => null, () => false)
    await expect(insecure.acquire('x').promise).rejects.toMatchObject({ reason: 'insecure' })
    const denied = new StreamRegistry(() => fakeDevices('NotAllowedError').devices, () => true)
    await expect(denied.acquire('x').promise).rejects.toMatchObject({ reason: 'denied' })
  })

  it('a secure page with no mediaDevices reports no-device, not insecure', async () => {
    const reg = new StreamRegistry(() => null, () => true)
    await expect(reg.acquire('x').promise).rejects.toMatchObject({ reason: 'no-device' })
  })

  it('lists video inputs with fallback labels (labels appear after permission)', async () => {
    const f = fakeDevices()
    expect(await listVideoInputs(() => f.devices)).toEqual([{ deviceId: 'cam-1', label: 'Camera 1' }])
  })
})
