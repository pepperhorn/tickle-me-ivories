import { useCallback, useRef, useState } from 'react'

export function FileDropZone({ onFile }: { onFile: (file: File) => void }) {
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const accept = useCallback((file: File | undefined) => {
    if (!file) return
    if (!/\.midi?$/i.test(file.name)) {
      setError(`${file.name} is not a MIDI file. Choose a .mid or .midi file.`)
      return
    }
    setError(null)
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
        accept=".mid,.midi"
        className="file-input hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
      {error && <p className="file-drop-error text-sm text-[#ff6b6b]">{error}</p>}
    </div>
  )
}
