# ivories

Falling keys, a lit 88-key keyboard, notation and camera layouts for React, all on one shared clock. MIT.

```bash
npm install ivories pepperscore
```

`pepperscore` (0.3.x, peer range `^0.3.0`) is a required peer: ivories plays through its shared audio engine (`pepperscore/audio`) and engraves notation with it. Import pepperscore's stylesheet too; the notation views need it for the playback cursor and the playing-note highlight:

```tsx
import { Ivories } from 'ivories'
import 'pepperscore/style.css'
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
import './index.css'              // first: declares the layer order
import 'pepperscore/style.css'    // unlayered, scoped to pepperscore's own classes
import 'ivories/style.css'
```

pepperscore's sheet is unlayered, so it outranks every layer. Its rules only target `.pepperscore` and its descendants (plus Poppins' `@font-face` rules from `@fontsource/poppins`), so the order of the two imports does not change the result; keep the layer declaration first.

Load Poppins on the page (the library sets `font-family: Poppins, system-ui, sans-serif` but never fetches fonts).

### Sizing

Views default to `height: 100%` of their parent, so the box that contains them needs a height (a fixed height, a flex/grid track, or an aspect ratio). Otherwise pass `height` (`height={420}` or `height="50vh"`) or set it with your own CSS on `className`. The `<Ivories>` presets fall back to a `12rem` minimum, individual views do not.

## Presets

`<Ivories view>`: `falling`, `rising`, `keyboard`, `keyboard+notation`, `endless+falling`, `endless+keyboard`. `orientation` (`vertical` | `horizontal`) applies to the rising main view; falling is vertical only (`orientation="horizontal"` on falling is deprecated and ignored, see [Horizontal piano roll](#horizontal-piano-roll)). `chrome`: `full` (transport with seek, tempo, count-in, metronome, and the BPM field when there is no score), `minimal` (play button), `none`. `countIn` (`0 | 1 | 2`, default 1) and `noteBarLabels` (`'pitch' | 'pitch-octave' | 'none'`, default `'pitch'`) pass through; see below.

## Count-in

Play from the top (0:00, or after the score has ended) starts with a count-in before the score's first beat: `countIn` bars on the provider (`0`, `1` default, or `2`). The clock runs at negative time through it, so on a falling roll every bar, even a note on beat 1, starts fully above the keys, and on a rising roll the first tile leaves its key on beat 1 of bar 1. The count uses the opening time signature and tempo (one bar of 4/4 is four quarter beats, 3/4 three, 6/8 six eighths; over a pickup the last counted bar stops where the pickup enters). Its clicks (accent on 1) sound whether or not the metronome is on, and the views show the count large and faint over the roll ("1 2 3 4", "1 2 3 4 1 2 3 4" for two bars). With `countIn={0}` a single silent beat still runs first, so no bar starts on the keys. Before Play, the provider's own clock already waits at the start of that lead-in (and goes back there on a seek to 0:00 while paused), so the idle frame shows every bar above the keys; the time readout still reads 0:00 and `useIvories().parked()` is true. `clock.now()` reads the negative time meanwhile. A seek, a scrub or a resume from pause never replays it; that includes a seek to exactly 0:00 while playing, which plays on from beat 1 with no count-in (and no parking), so a beat-1 note is on the keys at that instant. Pause first (or seek while paused) to get the count-in from the top. The Transport's Count-in select (Off / 1 bar / 2 bars) changes it, also mid-play (it takes effect at the next Play from the top); `useIvories()` exposes `countIn`, `setCountIn` and `lead` (the lead-in in seconds). It applies to the provider's own clock or a host `AudioClock`; a `MediaClock` or `ManualClock` stays where the host puts it. A host that draws its own count passes `showCountIn={false}`. The count numbers are visual only (`aria-hidden`); one view per provider carries a polite `role="status"` (`ivories-count-in-status`) that says "Count-in" once while it runs.

## Note names on the bars

Falling and rising note bars carry their note name by default: the pitch class without octave or MIDI number, spelled as written in a MusicXML score ("F♯", "B♭"), else by the key signature (flats in a flat key), else with sharps, except B♭ is preferred over A♯. `noteBarLabels` on `<FallingKeys>`, `<RisingKeys>`, `<Ivories>` and in `Stage` `viewProps`: `'pitch'` (default), `'pitch-octave'` ("F♯4") or `'none'`. The text is white Poppins 600 over a dark translucent outline, centred, sized to the bar's width (up to 20px), and left off a bar too narrow or too short to read (black keys on a full 88-key roll in a small box, very short notes). Load Poppins on the page as for the rest of the UI.

`noteBarLabelStyle` (same views, and `Stage` `viewProps`) restyles the names: `format` (`'pitch'`, `'pitch-octave'`, `'solfege'` ("Do", "Re"), `'solfege-octave'`), `accidentals` (`'glyph'` or `'ascii'`), `show`, and `font` (`family`, `weight`, `scale`, `color`, `strokeColor`, `strokeWidth`, `case`). It beats the template's `labels`, and `noteBarLabels="none"` hides them. A font other than Poppins is loaded from Google Fonts on demand; the labels draw in `sans-serif` until it is ready, then switch once. An unsafe family or colour is dropped.

```tsx
<Ivories noteBarLabelStyle={{ format: 'solfege', font: { color: '#231f20', strokeWidth: 0 } }} />
```

## Templates

A style template restyles the stage, keys, note bars, note colours and labels in one value. The default (`classic`) is today's look, drawn identically with no template tokens written.

| Id | Look |
| --- | --- |
| `classic` | the default dark stage |
| `classic-crf` | classic, notes coloured by pitch class (CRF palette) |
| `chord-cards` | cream stage, outlined raised keys on an ink plate, flat outlined bars with a hard shadow, key flash tinted by the hand colour |
| `chord-cards-crf` | chord cards with pitch-class colours |
| `outline` | the outline preset |
| `contrast` | the high-contrast preset |
| `transparent` | see-through stage |

```tsx
<Ivories template="chord-cards-crf" />
```

The stage text overlays (chord readout, note names) take their colour from the text settings, not the template: on a light-stage template such as `chord-cards`, set the `labels` text colour to something dark. The count-in number follows the template (`stage.countInInk`).

`template` is accepted by `<Ivories>`, `<IvoriesProvider>` and every view (`<Keyboard>`, `<FallingKeys>`, `<RisingKeys>`). Its tokens are written inline on each view's root, so a non-classic template needs no stylesheet from you.

A custom template extends a built-in and overrides only what it names:

```tsx
import type { IvoriesTemplateV1 } from 'ivories/core'

const mine: IvoriesTemplateV1 = {
  v: 1,
  kind: 'ivories-template',
  id: 'sunny-cards',
  name: 'Sunny cards',
  extends: 'chord-cards',
  stage: { bg: '#fff8e1' },
  bars: { radius: 8, shading: 'velocity' },
  colour: { mode: 'pitch' },
  labels: { format: 'solfege' },
}
<Ivories template={mine} />
```

**Colour mode.** `colour.mode` is `'hand'` (the left/right-hand hues, the default) or `'pitch'` (twelve pitch-class colours from `colour.palette`, the CRF palette by default). `flash.tint` is `'white'` or `'note'` for the key flash.

**`theme` vs `template`.** `theme` picks one of the CSS presets; `template` is the richer value and a built-in template can be based on a preset. With both props, `template` wins. A `theme` prop on its own shows that preset even when a saved look carries a template.

**Overrides.** Template tokens are inline styles, so a plain stylesheet rule loses to them. To override one from your own CSS use `!important` (for example `.my-view { --ivories-stage-bg: #000 !important }`), or set `settings.theme.stageBgOverride`, which beats the template's `stage.bg`.

**Validation.** A template from a prop, look, profile or share is decoded before use: `v` must be `1`, `kind` `'ivories-template'`, `id` match `^[a-z0-9-]{1,48}$`, and the serialized size is at most 16 KiB. Unknown keys are ignored, a colour the browser rejects or an unsafe font family is dropped, numbers are clamped to their ranges, and `colour.palette` needs exactly 12 hex colours. A template that fails (or a look whose template does) falls back to classic and the rest still loads. A saved look is itself capped at 16 KiB, template included, so a template near its own 16 KiB cap will not fit in a look: keep a template you mean to save in a look well under that size. `decodeTemplate`, `validTemplateRef`, `resolveTemplate`, `BUILTIN_TEMPLATES` and `BUILTIN_TEMPLATE_IDS` are exported from `ivories/core`.

**JSON Schema.** `ivories/template.schema.json` (draft 2020-12) describes the format for editors and validators:

```json
{ "$schema": "./node_modules/ivories/dist/template.schema.json", "v": 1, "kind": "ivories-template", "id": "mine", "name": "Mine" }
```

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

## Audio

ivories has no sound engine of its own: it plays through pepperscore's (`pepperscore/audio`), the one every PepperScore reader on the page uses.

- **One AudioContext per page** (pepperscore's `getSharedAudio()`), playing through pepperscore's master compressor. Play resumes it inside the click (`resumeAudio`, with a bounded wait, so a device with no output never hangs Play; the Transport then offers "Tap to enable sound").
- **One player at a time.** Every provider claims pepperscore's playback slot when it starts (`claimPlayback`), so two ivories players, or an ivories player and a PepperScore reader, never play over each other: starting one pauses the other, and its queued notes are cancelled.
- **Ivories still decides when.** The scheduler keeps ticks as the truth and the playhead a pure function of the clock; it hands each note to its voice's pepperscore instrument (`loadInstrument`) a moment ahead, at an exact context time, as a MIDI note number. Seek, pause and tempo changes cancel what was queued.
- **A sound per voice.** Each voice loads its part's General MIDI program: `<midi-program>` in MusicXML, the track's program in MIDI, the drum kit for a percussion part or a channel-10 track, the grand piano otherwise. The voice's `instrument` is that GM name (`'violin'`) or `'drums'`; `GM_INSTRUMENT_NAMES` (from `ivories/core`) lists them. A sound that fails to load twice falls back to the piano. Live MIDI keys (`liveAudio`) sound on their own piano bus, with a short release fade. Known limitation: when the live piano resolves to an SF2 soundfont (`TimGM6mb.sf2`: a sound pack without the piano, or `sources` of kind `sf2`), pepperscore plays it through the instrument's own output, bypassing the per-key envelope, so a released key cuts off about 150 ms later instead of fading.

### Where the sounds come from

```tsx
<Ivories view="falling" scoreUrl="/minuet.mid" sounds={{ assetBaseUrl: '/pepperscore-sounds/' }} />
```

`sounds: { assetBaseUrl?: string; soundPack?: 'core' | 'complete'; sources?: SoundSource[]; instrument?: string }` maps straight onto pepperscore's options (0.1.0's `pack` is a deprecated alias of `soundPack`):

- No `sounds` (or no `assetBaseUrl`): pepperscore's pinned copy of `pepperscore-sounds-<soundPack>` on jsDelivr (`defaultAssetBaseUrl`, today `https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/`). `soundPack` is `'core'` (19 FluidR3 instruments, default) or `'complete'` (all 128).
- `assetBaseUrl`: a self-hosted copy of a pepperscore-sounds package (a relative URL resolves against the page). Its `pack.json` says which FluidR3 sounds exist; any other program plays from its `soundfonts/TimGM6mb.sf2`, and drums from `soundfonts/perfect-drums/`. Every built-in file comes from this base, so with it set the page talks to no other sound host (a strict CSP needs only that origin in `connect-src`).
- `sources`: your own sounds per GM program or for the drum kit (pepperscore's `soundSources`).
- `instrument`: the GM sound for the piano voices and the live keys (default `acoustic_grand_piano`).

Changing `sounds` (its content, not just the object) reloads every voice in place: the provider and its views stay mounted, and each voice keeps its old sound until the new one is ready. Loading failures are pepperscore's console warnings, not `onError` events; the score keeps playing on whatever did load.

### Metronome and count-in

The click is pepperscore's `createMetronome`. The Transport's sound select next to the Metronome switch picks the voice, and the count-in clicks use it too:

| Voice | Beat 1 | Other beats |
| --- | --- | --- |
| Woodblock (default) | GM hi wood block | GM low wood block |
| Drum machine | Kick | Closed hi-hat |
| Click | Soft high tick | Soft tick (synthesized, loads nothing) |

It is stored in `settings.audio.metronomeVoice` (`'woodblock' | 'drum-machine' | 'click'`, type `MetronomeVoiceName`), next to `metronome` on/off, and saved with them in profiles. The metronome loads lazily: nothing is fetched until the metronome is switched on or a count-in is about to play. The wood blocks come from `TimGM6mb.sf2` (about 6 MB) at the asset base, so the first Play with a count-in waits up to 1.5 s for them; until they arrive (or if they cannot load) pepperscore plays a synthesized knock, so no beat is silent. The count-in clicks every beat of the opening metre, eighths in compound metres (six in 6/8); the metronome itself clicks the dotted-quarter pulse there.

### Transport readouts

- **Tempo in BPM**: "♩ = 96", the quarter-note BPM of the tempo map at the playhead times the playback rate. The slider and the number field set a BPM, which becomes a rate against the BPM at the playhead, so the whole tempo map scales (a ritardando stays a ritardando) and the readout follows tempo changes as the piece plays. The rate runs from 0.25x to 2x.
- **Time signature**: the one in force at the playhead ("4/4", "6/8"), updating at every change; during the count-in and over a pickup it shows the counted metre. `controls={{ meter: false }}` hides it.

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

A non-classic `template` writes its tokens inline on each view root (see [Templates](#templates)), so they beat these class-level defaults; override one with `!important`.

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

## Guitar and bass fretboards

In Studio, open a score (or **Play live**), then choose **Fretboard** from a
slot's source menu. The adjacent controls select Guitar / Bass / Bass 5,
headstock, Note letters / Fret numbers, dark rosewood / light maple, and 12 / 24
frets. These options persist in local and shared scenes, including split/PIP.

```tsx
import { Fretboard, FretboardDiagram, IvoriesProvider, Stage } from 'ivories'
import 'ivories/style.css'

// Follows the existing provider's score, transport and live-note feed.
<IvoriesProvider score={score}>
  <Fretboard instrument="guitar" headstock="tele" noteLabels="note" input="midi" />
</IvoriesProvider>

// Self-contained, using the same source props as Keyboard.
<Fretboard midi={bytes} instrument="bass4" headstock="violin" appearance="light" />

// Pure SVG for static cards or an external host's pitches; no provider needed.
<FretboardDiagram pitches={[40, 47, 52]} instrument="guitar" className="my-fretboard" />

<Stage layout={{ kind: 'single', main: { kind: 'ivories', view: 'fretboard',
  fretboard: { instrument: 'bass5', headstock: 'precision', noteLabels: 'fret', frets: 24 }
} }} />
```

`Fretboard` and `FretboardDiagram` accept `height`, `className`, `style`, and
`theme`. `Fretboard` also accepts existing provider/source props and `template`;
stage/background theme tokens are reused. The original SVG silhouettes are
Strat/Tele-inspired (six inline tuners), P-Bass-inspired (four/five inline), or
Beatle/violin-bass-inspired (2+2, or 3+2 for bass5). Incompatible headstocks fall
back to Strat for guitar and Precision for bass. No brand artwork or logos.

The display is **exact pitch, all positions**, including open strings. A single
sounding pitch can appear on multiple strings; these are alternative locations,
not an optimised or simultaneously playable fingering. No octave shift,
reduction, pitch-class expansion or audio adaptation occurs. Pitches outside
the visible range are listed explicitly. Default labels prefer B♭ over A♯;
other chromatic notes use sharps. Across the library, explicit source-score
spellings and key-scale spellings take precedence over this default preference.
Live notes use a separate colour. High strings are at the top; internal physical
string indices are zero-based low to high, matching Chordl. Standard open MIDI
values: guitar `[40,45,50,55,59,64]`, bass4 `[28,33,38,43]`, bass5
`[23,28,33,38,43]`. Pure helpers and option types are exported from `ivories/core`.

The neck uses equal-tempered fret distances and progressively thicker lower
strings. Small slots scroll instead of shrinking note letters below readability;
focus the fretboard region to scroll with a keyboard. Give standalone views a
height or let their content establish one. At 24 frets the view is wider.

Custom CSS belongs after the library CSS, outside its `ivories` cascade layer:

```css
.ivories.my-fretboard {
  --ivories-stage-bg: #101825;
  --ivories-ink: #eef5ff;
  --ivories-ink-dim: #b2bfd4;
  --ivories-fretboard-neck: #26364b;
  --ivories-fretboard-headstock: #c3d3eb;
  --ivories-fretboard-nut: #ffffff;
  --ivories-fretboard-fret: #91a6c3;
  --ivories-fretboard-string: #dbe7f8;
  --ivories-fretboard-inlay: #718cac;
  --ivories-fretboard-note: #b1d6ff;
  --ivories-fretboard-live-note: #ffd580;
  --ivories-fretboard-label: #102137;
  --ivories-fretboard-note-stroke: #ffffff;
  --ivories-fretboard-hardware: #dde9f8;
  --ivories-fretboard-outline: #60748e;
  --ivories-fretboard-fret-width: 1.5;
  --ivories-fretboard-note-stroke-width: 2;
  --ivories-fretboard-label-weight: 600;
}
.ivories.my-fretboard .ivories-fretboard-inlay circle { r: 4px; }
.ivories.my-fretboard .ivories-fretboard-note circle { stroke-dasharray: 2 1; }
```

SVG classes expose wood, neck, nut, frets, strings, inlays, tuners, note circles,
labels, and tuning badges. `data-instrument`, `data-appearance`, `data-headstock`,
`data-string`, `data-fret`, `data-midi`, and `data-live` provide targeted hooks.
Fretboard-specific styling is CSS, not a new block in the piano template JSON
schema. Scene decoding allowlists the fretboard options; arbitrary CSS is not
serialized into shared scenes.

The Tele option includes a cropped upper body with a single cutaway, pickguard,
and neck pickup, plus strings routed to six individual tuning posts. Its SVG
gradients and masks use unique IDs so split views can use different skins.
Additional CSS tokens are `--ivories-fretboard-body`,
`--ivories-fretboard-body-edge`, `--ivories-fretboard-pickguard`,
`--ivories-fretboard-pickguard-edge`, and `--ivories-fretboard-burst-opacity`
(set to `0` for a solid finish). Hardware uses `--ivories-fretboard-hardware`.
For example:

```css
.ivories.my-fretboard {
  --ivories-fretboard-body: #e5b967;
  --ivories-fretboard-pickguard: #151713;
  --ivories-fretboard-burst-opacity: 0;
}
```
