import { parseScoreFile } from './loadScoreFile'
import { parseMusicXml } from './parseMusicXml'
import { hashFile } from './hashFile'
import { IvoriesError } from '../errors'
import type { ScoreDocument, TempoSetting } from '../model/types'

/** Score source props, matching pepperscore's (spec §3.2). First present wins. */
export interface ScoreSource {
  scoreUrl?: string
  file?: Blob
  musicXml?: string
  midi?: ArrayBuffer | Uint8Array
}

/** The score's own tempo map. Providers always load self-loaded scores at this (R1). */
export const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }

function toArrayBuffer(b: ArrayBuffer | Uint8Array): ArrayBuffer {
  return b instanceof ArrayBuffer ? b : (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
}

async function readSource(src: ScoreSource, fetchFn: typeof fetch): Promise<{ bytes: ArrayBuffer; name: string; xml?: string }> {
  try {
    if (src.musicXml !== undefined) {
      return { bytes: toArrayBuffer(new TextEncoder().encode(src.musicXml)), name: 'score.musicxml', xml: src.musicXml }
    }
    if (src.midi !== undefined) return { bytes: toArrayBuffer(src.midi), name: 'score.mid' }
    if (src.file !== undefined) return { bytes: await src.file.arrayBuffer(), name: (src.file as File).name || 'score' }
    if (src.scoreUrl !== undefined) {
      const res = await fetchFn(src.scoreUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const last = src.scoreUrl.split(/[?#]/)[0].split('/').pop() || 'score'
      return { bytes: await res.arrayBuffer(), name: decodeURIComponent(last) }
    }
  } catch (e) {
    throw new IvoriesError('score-load', `Could not load the score: ${(e as Error).message}`, e)
  }
  throw new IvoriesError('score-load', 'No score source was given.')
}

/** Loads and parses a score source. Rejects only with an IvoriesError. */
export async function loadScoreSource(
  src: ScoreSource, tempo: TempoSetting = SCALE_1, fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<ScoreDocument> {
  const { bytes, name, xml } = await readSource(src, fetchFn)
  let score: ScoreDocument
  try {
    score = xml !== undefined ? parseMusicXml(xml, name, tempo) : parseScoreFile(bytes, name, tempo)
  } catch (e) {
    throw new IvoriesError('score-parse', `Could not read ${name}: ${(e as Error).message}`, e)
  }
  if (score.notes.length === 0) throw new IvoriesError('score-parse', `${name} contains no notes.`)
  score.id = await hashFile(bytes)
  return score
}
