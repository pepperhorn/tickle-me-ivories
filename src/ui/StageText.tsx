import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { ensureGoogleFont } from './googleFont'
import { spellPitch } from '../music/spell'
import type { KeyboardLayout } from '../render/geometry'
import type { KeyContext } from '../music/spell'
import type { NoteLabelContent, TextSettings as TextSettingsType, TextStyle } from '../settings/types'

/** Self-hosted via @fontsource/poppins; never requested from the CDN (F37). */
const BUNDLED_FAMILY = 'poppins'

/**
 * True when the held map holds exactly `pitches`. Runs every frame in the draw
 * loop, so it allocates nothing: a size check plus an indexed membership pass
 * (pitches has no duplicates, so equal size + all present = same set). This is
 * what keeps the overlay from re-rendering per frame without a per-frame
 * sort().join() key (F38).
 */
export function samePitches(held: ReadonlyMap<number, unknown>, pitches: readonly number[]): boolean {
  if (held.size !== pitches.length) return false
  for (let i = 0; i < pitches.length; i++) if (!held.has(pitches[i])) return false
  return true
}

export function labelText(midi: number, content: NoteLabelContent, key: KeyContext): string {
  switch (content) {
    case 'pitch': return spellPitch(midi, key)
    case 'midi': return String(midi)
    case 'both': return `${spellPitch(midi, key)} · ${midi}`
    default: return ''
  }
}

/**
 * Size is expressed relative to white-key width so labels scale with the
 * keyboard rather than fighting it (spec §15.4). The dark stroke under the fill
 * is the house note-text treatment: against arbitrary footage, flat text becomes
 * illegible the moment the background matches its colour.
 */
export function textCss(style: TextStyle, whiteW: number): CSSProperties {
  const css: CSSProperties = {
    fontFamily: `'${style.family}', Poppins, system-ui, sans-serif`,
    fontWeight: style.weight,
    fontSize: `${(style.sizeRatio * whiteW).toFixed(2)}px`,
    letterSpacing: `${style.letterSpacing}em`,
    color: style.color,
    opacity: style.opacity,
  }
  if (style.strokeWidth > 0) {
    css.WebkitTextStroke = `${style.strokeWidth}px ${style.strokeColor}`
    css.paintOrder = 'stroke fill'
  }
  return css
}

export function StageText(props: {
  layout: KeyboardLayout | null
  pitches: number[]
  text: TextSettingsType
  keyContext: KeyContext
}) {
  const { layout, pitches, text, keyContext } = props
  const { family, weight } = text.style
  // F37: no CDN request for text nobody can see, nor for the bundled family.
  const wantsFont = !(text.labels === 'off' && text.chord === 'off')
    && family.trim().toLowerCase() !== BUNDLED_FAMILY

  useEffect(() => {
    if (wantsFont) ensureGoogleFont(family, [weight])
  }, [wantsFont, family, weight])

  if (!layout || text.labels === 'off') {
    return <div className="stage-text absolute inset-0" style={{ pointerEvents: 'none' }} />
  }

  const css = textCss(text.style, layout.whiteW)
  const size = text.style.sizeRatio * layout.whiteW

  return (
    <div className="stage-text absolute inset-0" style={{ pointerEvents: 'none' }}>
      {pitches.map((pitch) => {
        const k = layout.byPitch.get(pitch)
        if (!k) return null
        const name = spellPitch(pitch, keyContext)
        // Above: just clear of the hit line, in the stage area. Below: over the
        // key face, clear of the black keys' lower edge.
        const top = text.labelPlacement === 'above'
          ? layout.hitY - size * 1.5
          : layout.hitY + layout.keyboardH - size * 1.6
        return (
          <span
            key={pitch}
            id={`note-label-${pitch}`}
            className={`note-label note-label--${k.black ? 'black' : 'white'}`}
            data-pitch={name}
            data-midi={pitch}
            style={{
              ...css,
              position: 'absolute',
              left: `${k.x + k.w / 2}px`,
              top: `${top}px`,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}
          >
            {labelText(pitch, text.labels, keyContext)}
          </span>
        )
      })}
    </div>
  )
}
