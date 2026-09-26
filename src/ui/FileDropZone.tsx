import { useCallback, useRef, useState } from 'react'
import { MIDI_FILE_ACCEPT } from '../io/parseMidi'

export function FileDropZone({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // No filename/extension pre-filter here: a renamed or extension-less MIDI
  // file (or one whose `type` is empty) must still get through. The content
  // parse (loadFile -> parseMidi) is the real gate and already rejects
  // non-MIDI content with a user-facing error.
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
      <p className="file-drop-headline text-base font-medium">Drop a MIDI file to play it</p>
      <button
        type="button"
        className="btn-choose-file rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black"
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </button>
      <input
        id="file-input"
        ref={inputRef}
        type="file"
        accept={MIDI_FILE_ACCEPT}
        className="file-input hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
    </div>
  )
}
