// Android Chrome maps a file input's `accept` to a MIME-type filter; an
// extension-only value (".mid,.midi") has no MIME mapping there and the
// picker shows nothing. Both song-file inputs must share one constant that
// lists the MIME types too, so a fix to one can't drift from the other. It
// covers MusicXML (.xml/.musicxml/.mxl) as well as MIDI.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SCORE_FILE_ACCEPT } from 'ivories/core'
import { FileDropZone } from './FileDropZone'
import { SceneFilePrompt } from './SceneFilePrompt'

describe('SCORE_FILE_ACCEPT', () => {
  it('includes audio/midi alongside the file extensions', () => {
    const list = SCORE_FILE_ACCEPT.split(',')
    for (const v of ['audio/midi', '.mid', '.midi']) expect(list).toContain(v)
  })

  it('includes MusicXML extensions and MIME types', () => {
    const list = SCORE_FILE_ACCEPT.split(',')
    for (const v of ['.xml', '.musicxml', '.mxl', 'application/vnd.recordare.musicxml+xml',
      'application/vnd.recordare.musicxml', 'application/xml', 'text/xml']) expect(list).toContain(v)
  })

  it('is used by the FileDropZone file input', () => {
    const { container } = render(<FileDropZone onFile={() => {}} />)
    expect(container.querySelector('input[type="file"]')?.getAttribute('accept'))
      .toBe(SCORE_FILE_ACCEPT)
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
      .toBe(SCORE_FILE_ACCEPT)
  })
})
