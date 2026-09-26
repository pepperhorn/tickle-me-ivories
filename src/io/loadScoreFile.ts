// One entry point for a dropped or picked song file (spec §5 loadFile.ts).
// Dispatch is by CONTENT, never by name or MIME type: a renamed file, or one
// Android hands over as application/octet-stream, must still load.

import { MIDI_FILE_ACCEPT, parseMidi } from './parseMidi'
import { MAX_XML_BYTES, MUSICXML_FILE_ACCEPT, decodeXmlText, parseMusicXml, unpackMxl } from './parseMusicXml'
import type { ScoreDocument, TempoSetting } from '../model/types'

/**
 * The `accept` for every song-file input. It lists MIME types alongside the
 * extensions because Android Chrome filters by MIME type (see parseMidi's
 * MIDI_FILE_ACCEPT); content sniffing below is still the real gate.
 */
export const SCORE_FILE_ACCEPT = `${MIDI_FILE_ACCEPT},${MUSICXML_FILE_ACCEPT}`

export type ScoreFileKind = 'midi' | 'mxl' | 'musicxml'

/** Identifies a song file from its first bytes, or null if it is none of ours. */
export function sniffScoreFile(bytes: Uint8Array): ScoreFileKind | null {
  const at = (i: number, s: string) => [...s].every((c, j) => bytes[i + j] === c.charCodeAt(0))
  if (at(0, 'MThd')) return 'midi'
  if (at(0, 'PK\x03\x04')) return 'mxl'
  // XML: skip a BOM and whitespace, require '<', then look for the root
  // element near the top (after the prolog, DOCTYPE and comments).
  const head = decodeXmlText(bytes.subarray(0, 4096)).replace(/^﻿/, '').trimStart()
  if (head.startsWith('<') && /<score-(partwise|timewise)[\s>]/.test(head)) return 'musicxml'
  return null
}

/** Parses a song file into a ScoreDocument (id left empty; the caller hashes). */
export function parseScoreFile(bytes: ArrayBuffer, name: string, setting: TempoSetting): ScoreDocument {
  const view = new Uint8Array(bytes)
  switch (sniffScoreFile(view)) {
    case 'midi': return parseMidi(bytes, name, setting)
    case 'mxl': return parseMusicXml(unpackMxl(view), name, setting)
    case 'musicxml':
      if (view.length > MAX_XML_BYTES) {
        throw new Error(`the MusicXML file is larger than ${MAX_XML_BYTES / (1024 * 1024)} MiB.`)
      }
      return parseMusicXml(decodeXmlText(view), name, setting)
    default: throw new Error('it is not a MIDI or MusicXML file.')
  }
}
