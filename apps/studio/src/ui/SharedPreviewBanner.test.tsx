import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SharedPreviewBanner } from './SharedPreviewBanner'
import { SceneFilePrompt } from './SceneFilePrompt'

const handlers = () => ({ onApply: vi.fn(), onSaveCopy: vi.fn(), onDismiss: vi.fn() })

describe('SharedPreviewBanner', () => {
  it('renders nothing with no preview and no error', () => {
    const { container } = render(<SharedPreviewBanner preview={null} error={null} {...handlers()} />)
    expect(container.innerHTML).toBe('')
  })

  it('names the shared scene and owner, and offers Apply, Save a copy and Dismiss', () => {
    const h = handlers()
    render(<SharedPreviewBanner
      preview={{ kind: 'scene', title: '<b>Nocturne</b>', owner: 'ana', saved: false }} error={null} {...h}
    />)
    const banner = document.querySelector('.shared-preview-banner')!
    expect(banner.textContent).toMatch(/Shared scene: <b>Nocturne<\/b> by @ana/) // text, never HTML
    expect(banner.querySelector('b')).toBeNull()
    fireEvent.click(document.querySelector('.btn-apply-share')!)
    fireEvent.click(document.querySelector('.btn-save-copy')!)
    fireEvent.click(document.querySelector('.btn-dismiss-share')!)
    expect(h.onApply).toHaveBeenCalledTimes(1)
    expect(h.onSaveCopy).toHaveBeenCalledTimes(1)
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('disables Save a copy once saved', () => {
    render(<SharedPreviewBanner preview={{ kind: 'look', title: '', owner: null, saved: true }} error={null} {...handlers()} />)
    expect(screen.getByText(/Shared look/)).toBeTruthy()
    expect((document.querySelector('.btn-save-copy') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows an unopenable link as an error with Dismiss only', () => {
    const h = handlers()
    render(<SharedPreviewBanner preview={null} error="made with a newer version" {...h} />)
    expect(screen.getByRole('alert').textContent).toMatch(/newer version/)
    expect(document.querySelector('.btn-apply-share')).toBeNull()
    fireEvent.click(document.querySelector('.btn-dismiss-share')!)
    expect(h.onDismiss).toHaveBeenCalled()
  })
})

describe('SceneFilePrompt', () => {
  const p = () => ({ onFile: vi.fn(), onUseAnyway: vi.fn(), onCancel: vi.fn() })

  it('asks for the named file and passes a chosen or dropped file on', () => {
    const h = p()
    render(<SceneFilePrompt songName="demo.mid" mismatch={null} {...h} />)
    expect(document.querySelector('.scene-file-prompt')?.textContent)
      .toMatch(/This scene uses demo\.mid\. Drop the file to continue\./)
    expect(document.querySelector('.btn-use-anyway')).toBeNull()
    const f = new File(['x'], 'demo.mid')
    fireEvent.change(screen.getByLabelText('Scene song file'), { target: { files: [f] } })
    fireEvent.drop(document.querySelector('.scene-file-prompt')!, { dataTransfer: { files: [f] } })
    expect(h.onFile).toHaveBeenCalledTimes(2)
    fireEvent.click(document.querySelector('.btn-cancel-scene')!)
    expect(h.onCancel).toHaveBeenCalled()
  })

  it('refuses a mismatch with "use anyway"', () => {
    const h = p()
    render(<SceneFilePrompt songName="demo.mid" mismatch="other.mid" {...h} />)
    expect(document.querySelector('.scene-file-mismatch')?.textContent).toMatch(/other\.mid is not the file/)
    fireEvent.click(screen.getByRole('button', { name: 'Use anyway (voices may not match)' }))
    expect(h.onUseAnyway).toHaveBeenCalled()
  })

  it('while busy, ignores drops and disables Cancel', () => {
    const h = p()
    render(<SceneFilePrompt songName="demo.mid" mismatch="other.mid" busy {...h} />)
    fireEvent.drop(document.querySelector('.scene-file-prompt')!, { dataTransfer: { files: [new File(['x'], 'demo.mid')] } })
    expect(h.onFile).not.toHaveBeenCalled()
    expect((document.querySelector('.btn-cancel-scene') as HTMLButtonElement).disabled).toBe(true)
    expect((document.querySelector('.btn-use-anyway') as HTMLButtonElement).disabled).toBe(true)
  })
})
