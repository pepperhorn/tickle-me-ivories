# ivories

Falling keys, a lit 88-key keyboard, notation and camera layouts for React, all on one shared clock. MIT.

```bash
npm install ivories
# notation views also need the optional peer:
npm install pepperscore@^0.2
```

Notation views also need pepperscore's stylesheet for the playback cursor and the playing-note highlight: `import 'pepperscore/style.css'`.

```tsx
import { Ivories } from 'ivories'
import 'ivories/style.css'

<Ivories view="falling" scoreUrl="/songs/minuet.mid" height={420} />
```

Hosts must import `ivories/style.css`: overlay positioning and view sizing live there. All of it sits in a single `@layer ivories`, so any unlayered host CSS wins over the defaults.

Cascade layers rank by the order they are first declared, not by import order of the rules inside them. With Tailwind v4 (`@layer theme, base, components, utilities`), put `ivories` after `base` and before `components`: above `base`, Tailwind's preflight reset (which strips button backgrounds, borders and padding) does not flatten the transport; below `utilities`, your utilities still win over the library defaults. Declare the order at the top of your main stylesheet, before `@import "tailwindcss"`, and import that stylesheet before `ivories/style.css`, since the first declaration of a layer name fixes its rank:

```css
/* index.css */
@layer theme, base, ivories, components, utilities;
@import "tailwindcss";
```

```tsx
import './index.css'          // first: declares the layer order
import 'ivories/style.css'
```

Load Poppins on the page (the library sets `font-family: Poppins, system-ui, sans-serif` but never fetches fonts).

### Sizing

Views default to `height: 100%` of their parent, so the box that contains them needs a height (a fixed height, a flex/grid track, or an aspect ratio). Otherwise pass `height` (`height={420}` or `height="50vh"`) or set it with your own CSS on `className`. The `<Ivories>` presets fall back to a `12rem` minimum, individual views do not.

## Presets

`<Ivories view>`: `falling`, `rising`, `keyboard`, `keyboard+notation`, `endless+falling`, `endless+keyboard`. `orientation` (`vertical` | `horizontal`) applies to the rising main view; falling is vertical only (`orientation="horizontal"` on falling is deprecated and ignored, see [Horizontal piano roll](#horizontal-piano-roll)). `chrome`: `full` (transport with seek, tempo, count-in, metronome, and the BPM field when there is no score), `minimal` (play button), `none`. `countIn` (`0 | 1 | 2`, default 1) and `noteBarLabels` (`'pitch' | 'pitch-octave' | 'none'`, default `'pitch'`) pass through; see below.

## Count-in

Play from the top (0:00, or after the score has ended) starts with a count-in before the score's first beat: `countIn` bars on the provider (`0`, `1` default, or `2`). The clock runs at negative time through it, so on a falling roll every bar, even a note on beat 1, starts fully above the keys, and on a rising roll the first tile leaves its key on beat 1 of bar 1. The count uses the opening time signature and tempo (one bar of 4/4 is four quarter beats, 3/4 three, 6/8 six eighths; over a pickup the last counted bar stops where the pickup enters). Its clicks (accent on 1) sound whether or not the metronome is on, and the views show the count large and faint over the roll ("1 2 3 4", "1 2 3 4 1 2 3 4" for two bars). With `countIn={0}` a single silent beat still runs first, so no bar starts on the keys. Before Play, the provider's own clock already waits at the start of that lead-in (and goes back there on a seek to 0:00 while paused), so the idle frame shows every bar above the keys; the time readout still reads 0:00 and `useIvories().parked()` is true. `clock.now()` reads the negative time meanwhile. A seek, a scrub or a resume from pause never replays it. The Transport's Count-in select (Off / 1 bar / 2 bars) changes it; `useIvories()` exposes `countIn`, `setCountIn` and `lead` (the lead-in in seconds). It applies to the provider's own clock or a host `AudioClock`; a `MediaClock` or `ManualClock` stays where the host puts it. A host that draws its own count passes `showCountIn={false}`.

## Note names on the bars

Falling and rising note bars carry their note name by default: the pitch class without octave or MIDI number, spelled as written in a MusicXML score ("F♯", "B♭"), else by the key signature (flats in a flat key), else with sharps. `noteBarLabels` on `<FallingKeys>`, `<RisingKeys>`, `<Ivories>` and in `Stage` `viewProps`: `'pitch'` (default), `'pitch-octave'` ("F♯4") or `'none'`. The text is white Poppins 600 over a dark translucent outline, centred, sized to the bar's width (up to 20px), and left off a bar too narrow or too short to read (black keys on a full 88-key roll in a small box, very short notes). Load Poppins on the page as for the rest of the UI.

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

## Sizing a keyboard-only view

`<Keyboard>` (and `view="keyboard"`) has no roll, so its keys may use the whole height of the box, up to their natural proportion (white keys 5.8x as long as wide). A box taller than that keeps the keys anchored to the bottom edge with empty stage above; a shorter box gives shorter keys. The keyboard-only view is always vertical; `orientation` applies only to the rising view. Falling and rising views still cap the keyboard at 55% of the stage height to leave room for the roll.

To size the box so the keys fill it exactly, use `keyboardAspect(range?)` from `ivories/core` as the CSS `aspect-ratio`. It returns width / height for `'full'` (the default, 88 keys: 52 / 5.8) or a `[low, high]` range, widened to whole black-key groups as the `range` prop is. It matches only an explicit `range` (or `'full'`): a view with no `range` follows `settings.display.zoom`, and `'fit'` picks its range from the score, which `keyboardAspect` cannot know. Note labels placed `above` and an `above-keys` chord readout move onto the keys and to the top of the stage when there is no room above the keyboard.

```tsx
import { keyboardAspect } from 'ivories/core'

<div className="keyboard-embed" style={{ width: '100%', aspectRatio: keyboardAspect([36, 96]) }}>
  <Keyboard range={[36, 96]} height="100%" />
</div>
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

`orientation="horizontal"` on `<RisingKeys>` and `<Ivories view="rising">` stands the keyboard on the left edge, low notes at the bottom, with time running across: each tile is born at its key when the note sounds and travels away to the right, after the count-in. Falling is vertical only: `orientation="horizontal"` on `<FallingKeys>` / `<Ivories view="falling">` (and a falling `Stage` slot) is deprecated, draws vertical and warns once in development; use the rising roll for a horizontal view. Key proportions are unchanged. `onLayout` still reports the vertical (canonical) geometry; `toScreen`, `fromScreen` and `pitchAtScreen` from `ivories/core` map between it and the view. In a `<Stage>` layout an ivories slot carries it: `{ kind: 'ivories', view: 'rising', orientation: 'horizontal' }`.

## GM piano sounds

By default the piano is smplr's Splendid Grand Piano. Pass `sounds` to load it from the pepperscore-sounds GM sample packs instead (the same packs and CDN layout pepperscore uses):

```tsx
// A MIDI keyboard in, piano out:
<Keyboard input="midi" liveAudio sounds={{ pack: 'core' }} />
```

`sounds: { pack?: 'core' | 'complete'; assetBaseUrl?: string; instrument?: string; fallbackSoundfontUrl?: string }`. Files load from `https://cdn.jsdelivr.net/npm/pepperscore-sounds-<pack>@0.1.0/`, or from `assetBaseUrl` for a self-hosted copy: `pack.json` lists the instruments and `soundfonts/fluidr3/<name>.json` holds the samples. `instrument` picks the GM sound for the piano voice and the live keys (default `acoustic_grand_piano`); other score voices whose instrument is in the pack load from it too. If the pack cannot be reached, that instrument falls back to the default piano, a later load tries again, and a `console.warn('[ivories] audio: ...')` says why (these are not `onError` events). Browsers start audio only after a user gesture on the page; after one, the first live key resumes a suspended context. Changing `sounds` (its content, not just the object) reloads the instrument in place: the provider and its views stay mounted, live MIDI and the live clock keep running, and each voice keeps its old sound until the new one is ready. Several providers on one page share one loader for the default piano samples (not when the soundfont fallback is serving the piano).

Fallback sample host: instruments that are not in the pack load from smplr's Soundfont on `gleitz.github.io`, and a pack that fails to load falls back to the Splendid Grand Piano on `smpldsnds.github.io`. `fallbackSoundfontUrl` names a gleitz-layout base (`<base>/MusyngKite/<instrument>-mp3.js`). When it is set, both cases load from it, including the backup piano (`acoustic_grand_piano`), so a strict CSP needs only the pack host and this one. For example, pinned on jsDelivr:

```tsx
sounds={{ pack: 'core', fallbackSoundfontUrl: 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef' }}
```

Unset or blank means unchanged behaviour. Without any `sounds` prop, the default piano still comes from smpldsnds.

`resetGmSoundCaches`, `isGmInstrument` and `AudioEngine.isGmVoice` (exported from `ivories/core`) are internal test probes, not part of the supported API, and may be removed.

## Errors

Components never throw into the page. `onError(err)` receives `{ code, message, cause }` with `code` one of `score-load`, `score-parse`, `audio-unavailable`, `midi-unavailable`, `camera-unavailable`, `notation-unavailable`, `notation-needs-musicxml`, `render-failed`, and the component shows an inline message in its own box.

The exceptions are `audio-unavailable` and `midi-unavailable`: they are reported through `onError` only, with no inline message, because the views keep working (the score plays silently, or without live keys). Show your own notice if you want one.

Every reported error is also logged once with `console.warn('[ivories] <code>: <message>', cause)` (once per provider for each code and message), so an embed without `onError` still shows why audio or MIDI went quiet.

A callback you pass (`onNoteOn`, `onNoteOff`, `onError`, a live-note subscriber) that throws is logged once with `console.error` and never stops the other callbacks.

## Styling

Every rule lives under `.ivories`; theme tokens are `--ivories-*` custom properties (stage, keys, grid, flash, progress, live hue) and `ivories-theme-classic|outline|contrast|transparent` presets.

The default (classic) look follows pepperscore's palette: a deep green-black stage under its `#345642` green chrome, sage accents, Poppins. The stage tokens are declared on every `.ivories` root, so override them on the view (its `className`) or with a more specific selector; the canvas reads them when the layout or theme changes.

| Property | Default | Used for |
| --- | --- | --- |
| `--ivories-stage-bg` | `#0e1511` | stage behind the roll (the `contrast` preset keeps `#000000`, `transparent` is see-through) |
| `--ivories-panel` | `#16211a` | chrome panels (transport, notation frame, messages) |
| `--ivories-line` | `#2a3830` | chrome borders |
| `--ivories-ink` / `--ivories-ink-dim` | `#eef3ec` / `#a7b5aa` | chrome text |
| `--ivories-accent` | `#8fb89a` | split divider focus |
| `--ivories-key-white` / `--ivories-key-black` | `#f6f2e4` / `#151d18` | keys |
| `--ivories-key-border` | `rgba(143,184,154,.55)` | the key line the bars land on (the keyboard's inner edge on a horizontal roll) |
| `--ivories-progress-fill` | `#8fb89a` | 3px progress strip on the keyboard's outer edge |
| `--ivories-message-bg` / `-border` / `-ink` | panel / line / ink | loading and info messages |
| `--ivories-message-alert-bg` / `-border` / `-ink` | `#2a1a14` / `rgba(196,104,72,.6)` / `#f3c2b1` | error messages (pepperscore's terracotta) |

Note bars keep one hue per voice (left hand blue 207, right hand amber 28, the same pair as pepperscore's blue cursor and amber playing notes), velocity driving lightness; set hues per voice through `settings`/`look`.

### Notation surface

`notationTheme` on `<Ivories>` (notation presets) and on `<Notation>`:

- `paper` (default): the engraving sits on a light card with a subtle border, radius and inner padding, like pepperscore's own reader, so black ink reads on the dark stage. It does not depend on pepperscore's stylesheet being loaded.
- `ink-on-dark`: no card; the engraving is inverted to light ink on the dark panel (`filter: invert(1) hue-rotate(180deg)`, which keeps pepperscore's amber playing notes and blue cursor in their hues). pepperscore's white grounds are cleared with `!important`, because its sheet is unlayered.

```tsx
<Ivories view="keyboard+notation" notationTheme="ink-on-dark" musicXml={xml} />
<Notation view="endless" notationTheme="paper" />
```

### Transport and notation custom properties

The transport follows pepperscore's chrome (a green pill play button with a play/pause icon, slim filled range tracks, a switch for the metronome, small caps labels, Poppins). These properties are read with fallbacks rather than declared on `.ivories`, so set them on any ancestor (the element you pass as `className`, a page wrapper, or `:root`):

| Property | Default | Used for |
| --- | --- | --- |
| `--ivories-transport-bg` | `var(--ivories-panel)` | transport bar background |
| `--ivories-transport-border` | `var(--ivories-line)` | bar top border, secondary button border |
| `--ivories-transport-border-strong` | `rgba(255,255,255,.28)` | BPM field underline |
| `--ivories-transport-ink` | `var(--ivories-ink)` | text, BPM value |
| `--ivories-transport-ink-dim` | `var(--ivories-ink-dim)` | labels, time readout, tempo % |
| `--ivories-transport-font` | `Poppins, system-ui, sans-serif` | transport font stack |
| `--ivories-transport-radius` | `10px` | button radius |
| `--ivories-transport-play-bg` | `#345642` | play button |
| `--ivories-transport-play-bg-hover` | `#41694f` | play button hover |
| `--ivories-transport-play-ink` | `#ffffff` | play icon and label |
| `--ivories-transport-accent` | `#8fb89a` | "Tap to enable sound" button |
| `--ivories-transport-fill` | `#8fb89a` | filled part of the seek and tempo tracks, thumb ring |
| `--ivories-transport-track` | `rgba(255,255,255,.14)` | unfilled track |
| `--ivories-transport-thumb` | `#ffffff` | slider thumb, switch knob |
| `--ivories-transport-switch-off` | `rgba(255,255,255,.2)` | metronome switch off |
| `--ivories-transport-switch-on` | `#5d8164` | metronome switch on |
| `--ivories-transport-focus` | `#8fb89a` | keyboard focus ring |
| `--ivories-transport-control-h` | `2rem` (`2.5rem` on touch) | height of the play button, fields, range hit areas |
| `--ivories-transport-select-h` | `1.875rem` (`2.25rem` on touch) | count-in select |
| `--ivories-notation-paper` | `#ffffff` | paper card |
| `--ivories-notation-border` | `#e2e9e0` | paper card border (pepperscore's panel border) |
| `--ivories-notation-shadow` | `0 12px 32px rgba(8,16,11,.45)` | paper card shadow |
| `--ivories-notation-radius` | `12px` | paper card radius |
| `--ivories-notation-padding` | `0.5rem` | paper card inner padding |
| `--ivories-notation-ink` | `#242824` | text colour inside the notation (before inversion in `ink-on-dark`) |
| `--ivories-notation-dark-bg` | `var(--ivories-panel)` | `ink-on-dark` background |
| `--ivories-notation-ink-filter` | `invert(1) hue-rotate(180deg)` | `ink-on-dark` filter |

The seek track is drawn under the range input and broken at every beat of the score's time signatures (the denominator note; dotted quarters in 6/8, 9/8 and 12/8), with a stronger mark at each bar line, following the tempo map. When beats would sit closer than 4px only bar lines are marked, and when those crowd too, every 2nd, 4th, 8th... bar. `--ivories-transport-tick` (default `rgba(255,255,255,.45)`) colours the bar marks; the breaks take `--ivories-transport-bg`. The on-stage count is `--ivories-count-in-ink` (default `rgba(255,255,255,.3)`).

Without a `zoom`, the notation presets fit the engraving to the panel's height, so a whole system (both staves of a grand staff) is always visible: when pepperscore's default overflows the panel, the stave scale is reduced until the tallest system fits, and tried again at the default when the panel grows.

Contextual classes for overrides and tests: `ivories-transport-play` (with `ivories-transport-play-label` and `ivories-transport-icon`), `ivories-transport-seek` (in `ivories-seek-wrap`, over `ivories-seek-track`), `ivories-count-in-select`, `ivories-count-in-overlay` (the on-stage count, `data-count` while counting), `ivories-transport-tempo`, `ivories-transport-range`, `ivories-transport-time`, `ivories-transport-switch` (the metronome checkbox, `role="switch"`), `ivories-transport-label`, `ivories-notation-paper`, `ivories-notation-ink-on-dark`. The transport root carries `data-playing` while playing.

## SSR

Modules import without touching `window`. Canvas, audio, MIDI, camera and pepperscore are only touched in effects, so it works under SSR frameworks. In Astro, hydrate on the client: `<Ivories client:visible view="falling" scoreUrl="/a.mid" height={420} />`.
