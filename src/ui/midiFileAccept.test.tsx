// Android Chrome maps a file input's `accept` to a MIME-type filter; an
// extension-only value (".mid,.midi") has no MIME mapping there and the
// picker shows nothing. Both MIDI file inputs must share one constant that
// lists the MIME types too, so a fix to one can't drift from the other.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MIDI_FILE_ACCEPT } from '../io/parseMidi'
import { FileDropZone } from './FileDropZone'
import { SceneFilePrompt } from './SceneFilePrompt'

describe('MIDI_FILE_ACCEPT', () => {
  it('includes audio/midi alongside the file extensions', () => {
    expect(MIDI_FILE_ACCEPT).toContain('audio/midi')
    expect(MIDI_FILE_ACCEPT).toContain('.mid')
    expect(MIDI_FILE_ACCEPT).toContain('.midi')
  })

  it('is used by the FileDropZone file input', () => {
    const { container } = render(<FileDropZone onFile={() => {}} />)
    expect(container.querySelector('input[type="file"]')?.getAttribute('accept'))
      .toBe(MIDI_FILE_ACCEPT)
  })

  it('is used by the SceneFilePrompt file input', () => {
    const { container } = render(
      <SceneFilePrompt
        songName="song.mid"
        mismatch={null}
        onFile={() => {}}
        onUseAnyway={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(container.querySelector('input[type="file"]')?.getAttribute('accept'))
      .toBe(MIDI_FILE_ACCEPT)
  })
})
