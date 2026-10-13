# ivories

Falling keys, a lit 88-key keyboard, notation and camera layouts for React, all on one shared clock. MIT.

```bash
npm install ivories
# notation views also need the optional peer:
npm install pepperscore@^0.2
```

```tsx
import { Ivories } from 'ivories'
import 'ivories/style.css'

<Ivories view="falling" scoreUrl="/songs/minuet.mid" height={420} />
```

Hosts must import `ivories/style.css`: overlay positioning and view sizing live there. All of it sits in a single `@layer ivories`, so any unlayered host CSS wins over the defaults.

Cascade layers rank by the order they are first declared, not by import order of the rules inside them. Tailwind v4 puts its utilities in `@layer utilities`, so a host using Tailwind must make sure `ivories` is declared first, or the library defaults beat your utilities. Either import `ivories/style.css` before your Tailwind CSS:

```tsx
import 'ivories/style.css'   // first: declares @layer ivories
import './index.css'         // then: @import "tailwindcss";
```

or declare the order yourself at the top of your main stylesheet, before `@import "tailwindcss"`:

```css
@layer ivories, theme, base, components, utilities;
```

Load Poppins on the page (the library sets `font-family: Poppins, system-ui, sans-serif` but never fetches fonts).

### Sizing

Views default to `height: 100%` of their parent, so the box that contains them needs a height (a fixed height, a flex/grid track, or an aspect ratio). Otherwise pass `height` (`height={420}` or `height="50vh"`) or set it with your own CSS on `className`. The `<Ivories>` presets fall back to a `12rem` minimum, individual views do not.

## Presets

`<Ivories view>`: `falling`, `rising`, `keyboard`, `keyboard+notation`, `endless+falling`, `endless+keyboard`. `orientation` (`vertical` | `horizontal`) applies to the falling or rising main view. `chrome`: `full` (transport with seek, tempo, metronome, and the BPM field when there is no score), `minimal` (play button), `none`.

## Composing views

```tsx
import { IvoriesProvider, FallingKeys, Notation, Transport, Stage } from 'ivories'

<IvoriesProvider musicXml={xml} onNoteOn={(e) => console.log(e.midi, e.source)}>
  <Notation view="endless" />
  <FallingKeys lookahead={3} labels={{ noteNames: true, chords: true }} />
  <Transport />
</IvoriesProvider>
```

One provider = one score, one clock, one audio engine, one animation-frame loop. A component outside a provider makes its own from its props (`scoreUrl`, `file`, `musicXml`, `midi`, `score`).

## Clocks

`clock.now()` is score time in seconds on the score's own tempo map; `rate` scales how fast it advances.

- default `AudioClock` (plays its own audio; runs silently on `performance.now()` until sound is unlocked)
- `new MediaClock(videoEl, { offset })` follows an `<audio>`/`<video>` element; ivories' own audio is off unless `audio`
- `new ManualClock()` for host-driven time (`seek(t)`, `set(t)`, or `play()`)

Create a `MediaClock` once per element, never inline in render:

```tsx
import { useMemo } from 'react'
import { Ivories } from 'ivories'
import { MediaClock } from 'ivories/core'

function Synced({ video }: { video: HTMLVideoElement }) {
  const clock = useMemo(() => new MediaClock(video), [video])
  return <Ivories view="keyboard" scoreUrl="/a.mid" clock={clock} chrome="none" height={300} />
}
```

Ref handle on `<Ivories>` and `<IvoriesProvider>`: `{ play, pause, seek, setRate, clock }`.

## Layouts and cameras

`<Stage layout={...} aspect="16:9" onLayoutChange={setLayout} />` renders three layout kinds:

- `single`: one slot.
- `split`: two slots with a draggable, arrow-key divider (ratio).
- `pip`: a primary slot plus an inset you drag; it snaps to a corner (`margin` is a fraction of the stage width).

Swapping exchanges the two slots' sources without remounting the views or streams. `aspect` is `free` or a ratio such as `16:9`; the inset keeps the stage aspect. Each slot shows either an ivories view or a camera: a live `webcam` (`getUserMedia`, shared per device) or a `mask` (`transparent` for OBS alpha, or a chroma colour such as `#00b140`). The pure `layoutReducer` in `ivories/core` handles swap, corner, ratio, size, source and kind changes.

Props shared by every slot go in `viewProps`; `slotViewProps` overrides them for one named slot only:

```tsx
<Stage
  layout={layout}
  viewProps={{ labels: { noteNames: true } }}
  slotViewProps={{ top: { onLayout: (l) => setKeysLayout(l) }, bottom: { labels: undefined } }}
/>
```

## Live MIDI

`<Keyboard input="midi" />` lights keys from Web MIDI (sustain pedal included) in a distinct colour and fires `onNoteOn/Off` with `source: 'live'`; `liveAudio` on the provider sounds them.

### Recording

`useMidiRecorder()` (inside a provider) captures what is played on a MIDI keyboard. `start()` enables MIDI input and begins a take; `stop()` resolves to a `ScoreDocument` (one `Live` voice at 120 BPM, keys still held are closed at the stop time) that you can pass back as the provider's `score` to replay it. `stop()` resolves to `null` when the take holds no notes (zero-length notes are dropped) and on a repeated `stop()`, so check it before replacing a song.

```tsx
function RecordButton({ onTake }: { onTake(s: ScoreDocument): void }) {
  const { recording, start, stop } = useMidiRecorder()
  return (
    <button onClick={async () => {
      if (!recording) { start(); return }
      const take = await stop()
      if (take) onTake(take)
    }}>
      {recording ? 'Stop' : 'Record'}
    </button>
  )
}
```

## Rising notes

`<RisingKeys>` turns the roll around: a note appears at the keyboard edge when it starts, grows from its key while held, then detaches and drifts away. It takes the same `labels`, `range`, `input`, `theme`, `height`, `className` and `onLayout` props as `<FallingKeys>`, plus `orientation`, `visibleBeats` (beats between the keys and the far edge, default 8), `beatsPerBar` (live grid, default 4) and `beatGrid` (beat and bar lines, default true).

- With a score, notes move on the score's clock. A beat is a quarter note on its tempo map, and grid lines follow its time signatures (stronger on each bar).
- Live notes (`input="midi"`) are stamped in the provider's clock time and drawn in the live colour, next to the score's notes when there is one.
- With no score and no `clock` prop, the provider runs a free-running live clock that starts on the first key (`autoStart` starts it at mount; `liveClock` turns it on without a `<RisingKeys>`). `bpm` (default 100, 20-300) sets the speed and grid; changing it re-spaces the grid but never moves notes already played. `<Transport>` shows a BPM field only while this live clock is the active clock (not while a score is loading, and not on a provider without a live clock; `controls={{ bpm: false }}` hides it), shows the clock time without a duration, and Play/Pause still pauses the live clock; `useLiveBpm()` returns `{ bpm, setBpm }`, and `onBpmChange(bpm)` reports changes.

```tsx
<IvoriesProvider bpm={90} liveAudio>
  <RisingKeys input="midi" />
  <Transport controls={{ seek: false }} />
</IvoriesProvider>
```

## Horizontal piano roll

`orientation="horizontal"` on `<FallingKeys>`, `<RisingKeys>` and `<Ivories>` stands the keyboard on the left edge, low notes at the bottom, with time running across: falling notes arrive from the right, rising notes leave to the right. Key proportions are unchanged. `onLayout` still reports the vertical (canonical) geometry; `toScreen`, `fromScreen` and `pitchAtScreen` from `ivories/core` map between it and the view. In a `<Stage>` layout an ivories slot carries it: `{ kind: 'ivories', view: 'rising', orientation: 'horizontal' }`.

## GM piano sounds

By default the piano is smplr's Splendid Grand Piano. Pass `sounds` to load it from the pepperscore-sounds GM sample packs instead (the same packs and CDN layout pepperscore uses):

```tsx
// A MIDI keyboard in, piano out:
<Keyboard input="midi" liveAudio sounds={{ pack: 'core' }} />
```

`sounds: { pack?: 'core' | 'complete'; assetBaseUrl?: string; instrument?: string }`. Files load from `https://cdn.jsdelivr.net/npm/pepperscore-sounds-<pack>@0.1.0/`, or from `assetBaseUrl` for a self-hosted copy: `pack.json` lists the instruments and `soundfonts/fluidr3/<name>.json` holds the samples. `instrument` picks the GM sound for the piano voice and the live keys (default `acoustic_grand_piano`); other score voices whose instrument is in the pack load from it too. If the pack cannot be reached, that instrument falls back to the default piano, a later load tries again, and a `console.warn('[ivories] audio: ...')` says why (these are not `onError` events). Browsers start audio only after a user gesture on the page; after one, the first live key resumes a suspended context. Changing `sounds` (its content, not just the object) reloads the instrument in place: the provider and its views stay mounted, live MIDI and the live clock keep running, and each voice keeps its old sound until the new one is ready. Several providers on one page share one loader for the default piano samples.

`resetGmSoundCaches`, `isGmInstrument` and `AudioEngine.isGmVoice` (exported from `ivories/core`) are internal test probes, not part of the supported API, and may be removed.

## Errors

Components never throw into the page. `onError(err)` receives `{ code, message, cause }` with `code` one of `score-load`, `score-parse`, `audio-unavailable`, `midi-unavailable`, `camera-unavailable`, `notation-unavailable`, `notation-needs-musicxml`, `render-failed`, and the component shows an inline message in its own box.

The exceptions are `audio-unavailable` and `midi-unavailable`: they are reported through `onError` only, with no inline message, because the views keep working (the score plays silently, or without live keys). Show your own notice if you want one.

Every reported error is also logged once with `console.warn('[ivories] <code>: <message>', cause)` (once per provider for each code and message), so an embed without `onError` still shows why audio or MIDI went quiet.

A callback you pass (`onNoteOn`, `onNoteOff`, `onError`, a live-note subscriber) that throws is logged once with `console.error` and never stops the other callbacks.

## Styling

Every rule lives under `.ivories`; theme tokens are `--ivories-*` custom properties (stage, keys, grid, flash, progress, live hue) and `ivories-theme-classic|outline|contrast|transparent` presets.

## SSR

Modules import without touching `window`. Canvas, audio, MIDI, camera and pepperscore are only touched in effects, so it works under SSR frameworks. In Astro, hydrate on the client: `<Ivories client:visible view="falling" scoreUrl="/a.mid" height={420} />`.
