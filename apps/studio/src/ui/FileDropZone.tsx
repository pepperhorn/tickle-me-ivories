import { useCallback, useRef, useState } from 'react'
import { SCORE_FILE_ACCEPT } from '../io/loadScoreFile'

/**
 * `onPick` runs synchronously inside the "Choose file" click: that click is
 * the user gesture that unlocks audio, so the AudioContext is running before
 * the file has even been chosen. (A press elsewhere in the zone is covered by
 * App's .stage-wrap pointer handlers.)
 */
export function FileDropZone({ onFile, onPick }: { onFile: (file: File) => void; onPick?: () => void }) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // No filename/extension pre-filter here: a renamed or extension-less song
  // file (or one whose `type` is empty) must still get through. The content
  // parse (loadFile -> parseScoreFile) is the real gate and already rejects
  // content that is neither MIDI nor MusicXML with a user-facing error.
  const accept = useCallback((file: File | undefined) => {
    if (!file) return
    onFile(file)
  }, [onFile])

  return (
    <div
      className={`file-drop flex flex-col items-center gap-3 rounded-xl border border-dashed px-8 py-10 transition-colors ${
        over ? 'border-[var(--accent)] bg-white/5' : 'border-[var(--line)]'
      }`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]) }}
    >
      <p className="file-drop-headline text-base font-medium">Drop a MIDI or MusicXML file to play it</p>
      <button
        type="button"
        className="btn-choose-file rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black"
        onClick={() => { onPick?.(); inputRef.current?.click() }}
      >
        Choose file
      </button>
      <input
        id="file-input"
        ref={inputRef}
        type="file"
        accept={SCORE_FILE_ACCEPT}
        className="file-input hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
    </div>
  )
}
