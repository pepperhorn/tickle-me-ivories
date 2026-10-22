import { Soundfont } from 'smplr'
import type { InstrumentFactoryFn } from './engine'
import { GM_PIANO } from './gmSounds'
import { isSafeSoundName } from './soundNames'

/** The gleitz kit the fallback loads; smplr's own default, so the backup sound keeps its character. */
export const FALLBACK_SOUNDFONT_KIT = 'MusyngKite'

/** Absolute soundfont base with exactly one trailing slash; a relative URL resolves against the page. */
export function resolveFallbackSoundfontBase(raw: string, pageBase?: string): string {
  const trimmed = raw.trim()
  const withSlash = trimmed.replace(/\/+$/, '') + '/'
  const page = pageBase ?? (typeof document !== 'undefined' ? document.baseURI : undefined)
  try { return new URL(withSlash, page).href } catch { return withSlash }
}

/** `<base>MusyngKite/<name>-mp3.js`; an unsafe instrument id becomes the grand piano, never leaving the base. */
export function soundfontFileUrl(base: string, instrument: string): string {
  const name = isSafeSoundName(instrument) ? instrument : GM_PIANO
  return `${base}${FALLBACK_SOUNDFONT_KIT}/${name}-mp3.js`
}

/**
 * An engine instrument factory that loads every voice from a gleitz-layout soundfont base.
 * Only `instrumentUrl` is passed: smplr derives a gleitz.github.io URL from `instrument`/`kit`,
 * and a loop-data URL from `loadLoopData`.
 */
export function soundfontFallbackFactory(rawBase: string, deps: { pageBase?: string } = {}): InstrumentFactoryFn {
  const base = resolveFallbackSoundfontBase(rawBase, deps.pageBase)
  return async (ctx, id, destination, loader) => {
    const inst = Soundfont(ctx, { instrumentUrl: soundfontFileUrl(base, id), destination, loader } as never)
    try { await inst.ready } catch (e) { inst.dispose(); throw e }
    return inst
  }
}
