import { useEffect } from 'react'
import { Ivories } from 'ivories'
import type { IvoriesHandle, IvoriesPreset, PepperScoreClockHandle } from 'ivories'

export const FIXTURE_PRESETS: { view: IvoriesPreset; src: string }[] = [
  { view: 'falling', src: '/fixtures/demo.mid' },
  { view: 'keyboard', src: '/fixtures/demo.mid' },
  { view: 'keyboard+notation', src: '/fixtures/minuet.musicxml' },
  { view: 'endless+falling', src: '/fixtures/minuet.musicxml' },
  { view: 'endless+keyboard', src: '/fixtures/minuet.musicxml' },
]

interface FixtureRegistry {
  handles: Partial<Record<IvoriesPreset, IvoriesHandle>>
  notation: Partial<Record<IvoriesPreset, PepperScoreClockHandle>>
}
declare global { interface Window { __ivoriesFixture?: FixtureRegistry } }

const registry: FixtureRegistry = { handles: {}, notation: {} }

/** /embed-fixture: every preset embedded the way a host site would (spec §9 Playwright smoke). */
export function EmbedFixture() {
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
    </main>
  )
}
