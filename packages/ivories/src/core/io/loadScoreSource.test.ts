import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Midi } from '@tonejs/midi'
import { loadScoreSource } from './loadScoreSource'

const midiBytes = () => {
  const m = new Midi()
  m.header.setTempo(120)
  const t = m.addTrack()
  t.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 })
  return new Uint8Array(m.toArray())
}
const okFetch = (bytes: Uint8Array<ArrayBuffer>) => (async () => new Response(bytes)) as unknown as typeof fetch

describe('loadScoreSource (spec §3.2 score sources)', () => {
  it('parses MIDI bytes and hashes them', async () => {
    const s = await loadScoreSource({ midi: midiBytes() })
    expect(s.notes).toHaveLength(1)
    expect(s.id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('parses a MusicXML string and keeps the raw XML for notation', async () => {
    const xml = readFileSync(join(__dirname, '__fixtures__/musescore4-minuet.musicxml'), 'utf8')
    const s = await loadScoreSource({ musicXml: xml })
    expect(s.sourceFormat).toBe('musicxml')
    expect(s.rawXml).toBe(xml)
  })

  it('fetches a scoreUrl and names the score after the file', async () => {
    const s = await loadScoreSource({ scoreUrl: '/songs/demo%20one.mid?x=1' }, undefined, okFetch(midiBytes()))
    expect(s.name).toBe('demo one.mid')
  })

  it('reports score-load for a failed fetch and score-parse for junk or an empty file', async () => {
    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    await expect(loadScoreSource({ scoreUrl: '/x.mid' }, undefined, notFound)).rejects.toMatchObject({ code: 'score-load' })
    await expect(loadScoreSource({ midi: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({ code: 'score-parse' })
    const empty = new Midi(); empty.addTrack()
    await expect(loadScoreSource({ midi: new Uint8Array(empty.toArray()) })).rejects.toMatchObject({ code: 'score-parse' })
  })
})
