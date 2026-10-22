import { useEffect } from 'react'
import { Ivories } from 'ivories'
import type { IvoriesHandle, IvoriesPreset, IvoriesProps, PepperScoreClockHandle } from 'ivories'

/** The asset base of the ?audio cases: a host that does not exist, answered by the e2e test (e2e/audio.spec.ts). */
export const FIXTURE_SOUNDS_BASE = 'https://sounds.ivories.test/'

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
  // Falling is vertical only (horizontal is deprecated and draws vertical); the horizontal roll is rising's.
  { id: 'rising-horizontal', title: 'rising, horizontal (tiles emanate from the keys)', props: { view: 'rising', orientation: 'horizontal', scoreUrl: '/fixtures/demo.mid' } },
]

interface FixtureRegistry {
  handles: Partial<Record<IvoriesPreset, IvoriesHandle>>
  notation: Partial<Record<IvoriesPreset, PepperScoreClockHandle>>
  cases: Partial<Record<string, IvoriesHandle>>
}
declare global { interface Window { __ivoriesFixture?: FixtureRegistry } }

const registry: FixtureRegistry = { handles: {}, notation: {}, cases: {} }

/**
 * /embed-fixture: every preset embedded the way a host site would (spec §9 Playwright smoke).
 * Opt-in sections keep the default page light: `?rising` adds FIXTURE_CASES.
 * `?notation-themes` adds keyboard+notation with notationTheme="ink-on-dark" (the presets show the default paper card).
 * `?audio` renders only two keyboard-only players on FIXTURE_SOUNDS_BASE (no presets, so the request log stays clean):
 * `audio-a` without a count-in, `audio-b` with the default one-bar count-in.
 * `?default-sounds` renders only a keyboard-only player on pepperscore's default asset base (network).
 * `?only=<preset>` renders that one preset (screenshots; five pianos loading at once can starve a page of connections).
 */
export function EmbedFixture({ search = typeof location === 'undefined' ? '' : location.search }: { search?: string }) {
  const flags = new URLSearchParams(search)
  const audioOnly = flags.has('audio') || flags.has('default-sounds')
  const only = flags.get('only')
  const presets = only ? FIXTURE_PRESETS.filter((p) => p.view === only) : FIXTURE_PRESETS
  useEffect(() => { window.__ivoriesFixture = registry }, [])
  return (
    <main className="embed-fixture flex h-full flex-col gap-8 overflow-y-auto bg-[var(--ground)] p-6">
      <h1 className="embed-fixture-title text-lg font-semibold text-[var(--ink)]">ivories embed fixture</h1>
      {!audioOnly && presets.map((p) => (
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
      {flags.has('notation-themes') && (
        <section className="fixture-case flex flex-col gap-2" data-case="notation-ink-on-dark">
          <h2 className="fixture-case-title text-sm text-[var(--ink-dim)]">keyboard+notation, notationTheme ink-on-dark</h2>
          <div className="fixture-case-frame h-[360px] overflow-hidden rounded-lg border border-[var(--line)]">
            <Ivories view="keyboard+notation" notationTheme="ink-on-dark" scoreUrl="/fixtures/minuet.musicxml" ref={(h) => { if (h) registry.cases['notation-ink-on-dark'] = h }} />
          </div>
        </section>
      )}
      {flags.has('audio') && (['audio-a', 'audio-b'] as const).map((id) => (
        <section key={id} className="fixture-case flex flex-col gap-2" data-case={id}>
          <h2 className="fixture-case-title text-sm text-[var(--ink-dim)]">{id}: keyboard only, sounds from {FIXTURE_SOUNDS_BASE}</h2>
          <div className="fixture-case-frame h-[200px] overflow-hidden rounded-lg border border-[var(--line)]">
            <Ivories
              view="keyboard" scoreUrl="/fixtures/demo.mid" sounds={{ assetBaseUrl: FIXTURE_SOUNDS_BASE }}
              countIn={id === 'audio-a' ? 0 : 1}
              ref={(h) => { if (h) registry.cases[id] = h }}
            />
          </div>
        </section>
      ))}
      {flags.has('default-sounds') && (
        <section className="fixture-case flex flex-col gap-2" data-case="default-sounds">
          <h2 className="fixture-case-title text-sm text-[var(--ink-dim)]">keyboard only, pepperscore's default asset base</h2>
          <div className="fixture-case-frame h-[200px] overflow-hidden rounded-lg border border-[var(--line)]">
            <Ivories view="keyboard" scoreUrl="/fixtures/demo.mid" countIn={0} ref={(h) => { if (h) registry.cases['default-sounds'] = h }} />
          </div>
        </section>
      )}
    </main>
  )
}
