import { useEffect, useState } from 'react'
import { Ivories, IvoriesProvider, Keyboard, useIvories } from 'ivories'
import type { IvoriesHandle, IvoriesPreset, IvoriesProps, PepperScoreClockHandle } from 'ivories'
import { LIVE_VOICE_ID } from 'ivories/core'

export const FIXTURE_PRESETS: { view: IvoriesPreset; src: string }[] = [
  { view: 'falling', src: '/fixtures/demo.mid' },
  { view: 'keyboard', src: '/fixtures/demo.mid' },
  { view: 'keyboard+notation', src: '/fixtures/minuet.musicxml' },
  { view: 'endless+falling', src: '/fixtures/minuet.musicxml' },
  { view: 'endless+keyboard', src: '/fixtures/minuet.musicxml' },
]

/** Rising-roll cases (rising-roll spec §4 e2e): live MIDI with no score, a score, and both rolls horizontal. */
export const FIXTURE_CASES: { id: string; title: string; props: IvoriesProps }[] = [
  { id: 'rising-live', title: 'rising (live MIDI, no score)', props: { view: 'rising', input: 'midi' } },
  { id: 'rising-score', title: 'rising (score)', props: { view: 'rising', scoreUrl: '/fixtures/demo.mid' } },
  { id: 'falling-horizontal', title: 'falling, horizontal', props: { view: 'falling', orientation: 'horizontal', scoreUrl: '/fixtures/demo.mid' } },
  { id: 'rising-horizontal', title: 'rising, horizontal', props: { view: 'rising', orientation: 'horizontal', scoreUrl: '/fixtures/demo.mid' } },
]

interface FixtureRegistry {
  handles: Partial<Record<IvoriesPreset, IvoriesHandle>>
  notation: Partial<Record<IvoriesPreset, PepperScoreClockHandle>>
  cases: Partial<Record<string, IvoriesHandle>>
}
declare global { interface Window { __ivoriesFixture?: FixtureRegistry } }

const registry: FixtureRegistry = { handles: {}, notation: {}, cases: {} }

/** Publishes whether the provider's live keys were built from the GM pack (R-G e2e probe). */
function GmProbe() {
  const { engine } = useIvories()
  const [gm, setGm] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => setGm(engine.isGmVoice(LIVE_VOICE_ID)), 100)
    return () => window.clearInterval(id)
  }, [engine])
  return <span className="fixture-gm-probe hidden" data-gm-live={String(gm)} />
}

/**
 * /embed-fixture: every preset embedded the way a host site would (spec §9 Playwright smoke).
 * Opt-in sections keep the default page light: `?rising` adds FIXTURE_CASES, `?gm` adds a
 * live keyboard whose piano loads from the pepperscore-sounds GM pack (network).
 */
export function EmbedFixture({ search = typeof location === 'undefined' ? '' : location.search }: { search?: string }) {
  const flags = new URLSearchParams(search)
  useEffect(() => { window.__ivoriesFixture = registry }, [])
  return (
    <main className="embed-fixture flex h-full flex-col gap-8 overflow-y-auto bg-[var(--ground)] p-6">
      <h1 className="embed-fixture-title text-lg font-semibold text-[var(--ink)]">ivories embed fixture</h1>
      {FIXTURE_PRESETS.map((p) => (
        <section key={p.view} className="fixture-preset flex flex-col gap-2" data-preset={p.view}>
          <h2 className="fixture-preset-title text-sm text-[var(--ink-dim)]">{p.view}</h2>
          <div className="fixture-preset-frame h-[360px] overflow-hidden rounded-lg border border-[var(--line)]">
            <Ivories
              view={p.view}
              scoreUrl={p.src}
              ref={(h) => { if (h) registry.handles[p.view] = h }}
              notationRef={(h) => { if (h) registry.notation[p.view] = h }}
            />
          </div>
        </section>
      ))}
      {flags.has('rising') && FIXTURE_CASES.map((c) => (
        <section key={c.id} className="fixture-case flex flex-col gap-2" data-case={c.id}>
          <h2 className="fixture-case-title text-sm text-[var(--ink-dim)]">{c.title}</h2>
          <div className="fixture-case-frame h-[360px] overflow-hidden rounded-lg border border-[var(--line)]">
            <Ivories {...c.props} ref={(h) => { if (h) registry.cases[c.id] = h }} />
          </div>
        </section>
      ))}
      {flags.has('gm') && (
        <section className="fixture-case flex flex-col gap-2" data-case="gm-live">
          <h2 className="fixture-case-title text-sm text-[var(--ink-dim)]">live keys, GM piano (pepperscore-sounds core)</h2>
          <div className="fixture-case-frame h-[160px] overflow-hidden rounded-lg border border-[var(--line)]">
            <IvoriesProvider sounds={{ pack: 'core' }} liveAudio>
              <Keyboard input="midi" />
              <GmProbe />
            </IvoriesProvider>
          </div>
        </section>
      )}
    </main>
  )
}
