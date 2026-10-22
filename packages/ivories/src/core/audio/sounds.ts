import type { InstrumentOptions, SoundPackName, SoundSource } from 'pepperscore/audio'
import { GM_INSTRUMENT_NAMES } from './gmNames'

export type { SoundPackName, SoundSource }

/**
 * Where the provider's instruments and metronome load from: pepperscore/audio's sound resolution
 * (your `sources`, then the pack's FluidR3 sound, then TimGM6mb.sf2; drums from Perfect Drums).
 * Every built-in file comes from the asset base, so a self-hosted base means no other host is asked.
 */
export interface SoundsOption {
  /** Picks the default asset base: 'core' (default, 19 FluidR3 instruments) or 'complete' (all 128). */
  soundPack?: SoundPackName
  /** @deprecated 0.1.0's name for `soundPack` (used when `soundPack` is unset). */
  pack?: SoundPackName
  /** Root of a pepperscore-sounds-<pack> layout (a relative URL resolves against the page).
      Default: pepperscore's pinned jsDelivr copy (defaultAssetBaseUrl). */
  assetBaseUrl?: string
  /** Your own sounds, claimed per GM program or for the drum kit (pepperscore's `soundSources`). */
  sources?: readonly SoundSource[]
  /** The GM sound the piano voices and the live keys load. Default 'acoustic_grand_piano'. */
  instrument?: string
}

export const GM_PIANO = 'acoustic_grand_piano'
/** The GM drum kit (a percussion part or channel-10 track). */
export const GM_DRUMS = 'drums'

/** The pepperscore/audio options for a sounds option (blank strings and absent fields are left out). */
export function instrumentOptions(o: SoundsOption | undefined): Pick<InstrumentOptions, 'assetBaseUrl' | 'soundPack' | 'sources'> {
  const out: Pick<InstrumentOptions, 'assetBaseUrl' | 'soundPack' | 'sources'> = {}
  if (!o) return out
  const base = o.assetBaseUrl?.trim()
  if (base) out.assetBaseUrl = base
  const pack = o.soundPack ?? o.pack
  if (pack) out.soundPack = pack
  if (o.sources?.length) out.sources = o.sources
  return out
}

/** The sound a voice instrument id loads: the piano takes sounds.instrument; every other id is itself. */
export function soundFor(id: string, o: SoundsOption | undefined): string {
  return id === GM_PIANO ? (o?.instrument?.trim() || GM_PIANO) : id
}

/** Can a Voice carry this instrument id? A GM name or the drum kit. */
export function isInstrumentName(name: unknown): name is string {
  return typeof name === 'string' && (name === GM_DRUMS || GM_INSTRUMENT_NAMES.includes(name))
}

/** A GM program (1-128, as MusicXML <midi-program> numbers it) to its sound name; anything else is the piano. */
export function instrumentForProgram(program: number | null | undefined): string {
  if (typeof program !== 'number' || !Number.isInteger(program) || program < 1 || program > 128) return GM_PIANO
  return GM_INSTRUMENT_NAMES[program - 1]
}
