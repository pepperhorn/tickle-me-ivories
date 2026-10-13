import { describe, it, expect, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CameraSlot } from './CameraSlot'
import { StreamRegistry } from '../../core/camera/streams'
import { fakeDevices } from '../../core/camera/fakeMedia.test-helpers'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { fakeEngine } from '../testEngine.test-helpers'

const webcam = { kind: 'camera', mode: 'webcam', mirror: true, fit: 'contain' } as const

describe('CameraSlot (spec §5.3)', () => {
  it('shows the webcam mirrored with the chosen fit', async () => {
    const f = fakeDevices()
    const { container } = render(<CameraSlot source={webcam} registry={new StreamRegistry(() => f.devices, () => true)} />)
    await waitFor(() => expect(container.querySelector('video.ivories-camera-video')).not.toBeNull())
    const video = container.querySelector('video.ivories-camera-video') as HTMLVideoElement
    expect(video.classList.contains('ivories')).toBe(true)
    expect(video.muted).toBe(true)
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(video.style.objectFit).toBe('contain')
    expect(video.style.transform).toBe('scaleX(-1)')
    await waitFor(() => expect((video as unknown as { srcObject: unknown }).srcObject).toBe(f.made[0].stream))
  })

  it('a StrictMode render opens the camera once', async () => {
    const f = fakeDevices()
    const { container } = render(<StrictMode><CameraSlot source={webcam} registry={new StreamRegistry(() => f.devices, () => true)} /></StrictMode>)
    await waitFor(() => expect((container.querySelector('video') as unknown as { srcObject: unknown }).srcObject).toBe(f.made[0].stream))
    expect(f.devices.getUserMedia).toHaveBeenCalledTimes(1)
    expect(f.made[0].track.stop).not.toHaveBeenCalled()
  })

  it('stops the stream on unmount', async () => {
    const f = fakeDevices()
    const { unmount } = render(<CameraSlot source={webcam} registry={new StreamRegistry(() => f.devices, () => true)} />)
    await waitFor(() => expect(f.made).toHaveLength(1))
    unmount()
    expect(f.made[0].track.stop).toHaveBeenCalled()
  })

  it('track ended → placeholder; retry calls getUserMedia again (Review Focus 1)', async () => {
    const f = fakeDevices()
    render(<CameraSlot source={webcam} registry={new StreamRegistry(() => f.devices, () => true)} />)
    await waitFor(() => expect(f.made).toHaveLength(1))
    act(() => f.made[0].track.end())
    const alert = await screen.findByRole('alert')
    expect(alert.dataset.reason).toBe('ended')
    expect(alert.classList.contains('ivories')).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(f.devices.getUserMedia).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('a denied camera reports camera-unavailable through the provider', async () => {
    const onError = vi.fn()
    render(
      <IvoriesProvider score={null} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}>
        <CameraSlot source={webcam} registry={new StreamRegistry(() => fakeDevices('NotAllowedError').devices, () => true)} />
      </IvoriesProvider>,
    )
    expect((await screen.findByRole('alert')).textContent).toMatch(/denied/)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'camera-unavailable' }))
  })

  it('a mask is transparent or a solid chroma fill', () => {
    const { container } = render(<CameraSlot source={{ kind: 'camera', mode: 'mask', fill: '#00b140' }} />)
    const el = container.querySelector('.ivories-camera-mask') as HTMLElement
    expect(el.classList.contains('ivories')).toBe(true)
    expect(el.dataset.fill).toBe('#00b140')
    expect(el.style.background).toMatch(/0, 177, 64|#00b140/)
  })

  it('a transparent mask is see-through', () => {
    const { container } = render(<CameraSlot source={{ kind: 'camera', mode: 'mask', fill: 'transparent' }} />)
    const el = container.querySelector('.ivories-camera-mask') as HTMLElement
    expect(el.dataset.fill).toBe('transparent')
    expect(el.style.background).toBe('transparent')
  })

  it('an invalid mask fill never reaches the style', () => {
    const { container } = render(<CameraSlot source={{ kind: 'camera', mode: 'mask', fill: 'red; background-image: url(x)' }} />)
    const el = container.querySelector('.ivories-camera-mask') as HTMLElement
    expect(el.dataset.fill).toBe('transparent')
    expect(el.getAttribute('style')).not.toMatch(/url/)
    expect(el.style.background).toBe('transparent')
  })
})
