// Spec §8.3: a scene with a `local` song ref carries only the file's hash and
// name, never the file. "This scene uses *name*. Drop the file to continue."
// The hash is checked on drop (in useScenes); a mismatch is refused with the
// option to "use anyway (voices may not match)".

import { useRef, useState } from 'react'

const BTN = 'rounded-full px-3 py-1 text-xs font-semibold'

export function SceneFilePrompt(props: {
  songName: string
  /** The dropped file whose hash did not match, if any. */
  mismatch: string | null
  busy?: boolean
  onFile: (file: File) => void
  onUseAnyway: () => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [over, setOver] = useState(false)

  return (
    <div
      role="region"
      aria-label="Scene needs its song file"
      className={`scene-file-prompt absolute left-1/2 top-4 z-20 flex max-w-[90%] -translate-x-1/2 flex-col gap-2 rounded-lg border px-4 py-3 text-sm text-[var(--ink)] shadow-2xl ${
        over ? 'border-[var(--accent)] bg-[var(--panel)]' : 'border-[var(--line)] bg-[var(--panel)]'
      }`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f && !props.busy) props.onFile(f)
      }}
    >
      <p className="scene-file-prompt-text">
        This scene uses <em className="scene-file-name font-semibold not-italic">{props.songName}</em>.
        {' '}Drop the file to continue.
      </p>
      {props.mismatch && (
        <p className="scene-file-mismatch text-xs text-[#ff6b6b]">
          {props.mismatch} is not the file this scene was made with.
        </p>
      )}
      <div className="scene-file-actions flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn-choose-scene-file ${BTN} bg-[var(--accent)] text-black`}
          disabled={props.busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </button>
        {props.mismatch && (
          <button
            type="button"
            className={`btn-use-anyway ${BTN} border border-[var(--line)] text-[var(--ink-dim)]`}
            disabled={props.busy}
            onClick={props.onUseAnyway}
          >
            Use anyway (voices may not match)
          </button>
        )}
        <button
          type="button"
          className={`btn-cancel-scene ${BTN} border border-[var(--line)] text-[var(--ink-dim)]`}
          disabled={props.busy}
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi"
        aria-label="Scene song file"
        className="scene-file-input hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) props.onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
