# Changelog

## 0.3.0 - 2026-10-23

### Added

- Style templates: one plain-data option that changes the whole look (stage, keys, key lift and lip, held keys, key plate, bars, hit flash, bar labels, pitch colours). Seven built-ins (`classic`, `classic-crf`, `chord-cards`, `chord-cards-crf`, `outline`, `contrast`, `transparent`) and a `template` prop on `<Ivories>` taking a built-in id or an inline template object.
- CRF pitch palette (`CRF_PITCH_PALETTE`) and a pitch colour mode that colours bars and flashes by pitch class.
- Flat bar shading, and a note-tinted hit flash.
- Chord cards keys: lifted raised keys with a lip, held black keys sink and their lip darkens, a key plate with ink borders and a hard shadow.
- `noteBarLabelStyle` (type `BarLabelStyleInput`): font family, weight, scale, colours, stroke, case, accidentals and format for bar labels, including solfège (`'solfege'`, `'solfege-octave'`).
- `decodeTemplate`, `resolveTemplate`, `BUILTIN_TEMPLATES` and `CRF_PITCH_PALETTE` from `ivories/core`.
- `ivories/template.schema.json`, the JSON Schema for templates.
- `stage.countInInk` (`--ivories-count-in-ink`): the count-in number's colour; chord-cards sets it to ink so it reads on the paper stage.
- Under any non-classic template on a light opaque stage, the hit flash draws normally (source-over) instead of additively, so it fades over the paper.
- `ThemeSettings.template`, saved in looks and profiles. Older saves without it load unchanged; a corrupt, unknown or oversize template is dropped and the rest of the look loads.

### Changed

- An explicit `theme` prop clears a template that came from a look.

## 0.2.0 - 2026-10-22

0.1.1 was never published; its changes are folded in here.

### Breaking

- `pepperscore` (`^0.3.0`, i.e. 0.3.x) is a **required** peer dependency (it was optional, for notation only). ivories plays through pepperscore's shared audio engine, `pepperscore/audio`: install it with ivories and import `pepperscore/style.css`.
- `smplr` is no longer a dependency. The Splendid Grand Piano and smplr's Soundfont hosts (`smpldsnds.github.io`, `gleitz.github.io`) are gone: every sound comes from the pepperscore-sounds asset base.
- `ivories/core` audio: `AudioEngine` builds on pepperscore's shared context by default; `AudioEngineDeps` is `{ makeContext?, makeInstrument?, sounds?, audioApi? }` and `InstrumentFactoryFn` is `(ctx, id, destination) => Promise<Instrument>` (no loader). `Instrument` is pepperscore's (`start({ note, time, duration, velocity })` returns that note's stop). The synthesized `MetronomeVoice` class is replaced by `SharedMetronome`; the `gmSounds` exports (`defaultSoundsBase`, `loadGmBuffers`, `gmInstrumentFactory`, `resetGmSoundCaches`, `isGmInstrument`, ...) and `AudioEngine.isGmVoice` are removed, as are `defaultMakeInstrument` (engine) and ivories' own `SOUNDS_VERSION` (use pepperscore/audio's).
- `claimPlayback` / `releasePlayback` (from `ivories/core`) now use pepperscore's page-wide slot, so a PepperScore reader starting playback pauses an ivories player and the other way round.
- The Transport's tempo slider is in BPM (it was a 25-200 % rate); its accessible name is still "Tempo".

### Added

- Shared audio engine: one AudioContext per page (`getSharedAudio`, through pepperscore's master compressor), resumed on the Play gesture with a bounded wait (`resumeAudio`), one player at a time (`claimPlayback`), and an instrument per voice (`loadInstrument`). ivories' scheduler is unchanged: ticks stay the truth and the playhead a pure function of the clock; only the instrument layer moved.
- `sounds` is now `{ assetBaseUrl?, soundPack?: 'core' | 'complete', sources?, instrument? }`, passed straight to pepperscore (`pack` still works as a deprecated alias of `soundPack`; `sources` is new): a self-hosted base means every sample, soundfont and drum file comes from that one origin. Without it (and without any `sounds`), pepperscore's pinned `pepperscore-sounds-core@0.1.0` on jsDelivr. Changing it reloads every voice in place.
- Each voice plays its part's GM program: MusicXML `<midi-program>`, the MIDI track's program, the drum kit (`'drums'`) for percussion parts and channel-10 tracks; the grand piano otherwise. `GM_INSTRUMENT_NAMES`, `GM_PIANO`, `GM_DRUMS`, `instrumentForProgram` and `isInstrumentName` in `ivories/core`.
- Metronome voices from pepperscore's `createMetronome`: Woodblock (default), Drum machine, Click. The Transport has a compact sound select next to the Metronome switch; the count-in clicks use the same voice. Stored as `settings.audio.metronomeVoice` (type `MetronomeVoiceName`, validated in profiles like `metronome`; the studio's Audio settings have the select too). The metronome loads lazily, only when it is switched on or a count-in is about to play (the wood blocks fetch `TimGM6mb.sf2`, about 6 MB); Play waits up to 1.5 s for it, and pepperscore knocks synthetically until it arrives.
- Transport: tempo as "♩ = 96" (the tempo map's BPM at the playhead times the rate), editable in a field or on the slider in BPM, scaling the whole tempo map; the time signature at the playhead ("4/4", following changes; the counted metre during the count-in and over a pickup). `TransportControls.meter`, `metreAt()` in `ivories/core`.
- `notationTheme` (`'paper' | 'ink-on-dark'`, type `NotationTheme`) on `<Ivories>` and `<Notation>`. The default `paper` puts the engraving on a light card, so black ink is readable on the dark stage (it was near-invisible on the dark panel when the host did not load pepperscore's CSS). `ink-on-dark` keeps the dark panel and inverts the engraving to light ink, keeping the cursor and playing-note hues.
- Transport and notation custom properties (`--ivories-transport-*`, `--ivories-notation-*`, see the README) with fallbacks, so hosts can theme them from any ancestor.
- Count-in: Play from the top (0:00, or after the end) runs `countIn` bars (`0 | 1 | 2`, default 1, type `CountInBars`) before the score's first beat, at negative clock time, so no falling bar touches the keys as playback starts and a rising tile leaves its key on beat 1. Count-in clicks (accent on 1) sound with the metronome off, and the falling, rising and keyboard views show the count over the stage. With 0 a silent beat still runs first. Seeks and resumes never replay it. Transport: a Count-in select (Off / 1 bar / 2 bars); `useIvories()` gains `play`, `countIn`, `setCountIn`, `lead`; provider prop `showCountIn` (default true) hides the on-stage count for hosts that draw their own.
- Note names on falling and rising bars by default (`noteBarLabels`: `'pitch'` default, `'pitch-octave'`, `'none'`, type `NoteBarLabels`): spelled as written in MusicXML (new optional `NoteEvent.spelling`), else by key signature, else sharps; white Poppins 600 with a dark outline, sized to the bar and hidden when it would not be legible.
- Transport beat ticks: the seek track breaks at every beat of the time signatures (dotted quarters in compound metres) and marks bar lines more strongly, through the tempo map; dense scores keep bar lines only, then every Nth bar. `--ivories-transport-tick`, `--ivories-count-in-ink`.

### Changed

- Falling is vertical only: `orientation="horizontal"` on `<FallingKeys>`, `<Ivories view="falling">` and falling `Stage` slots is deprecated (`@deprecated` in the types), ignored (draws vertical) and warns once in development. The horizontal roll is the rising roll, whose tiles emanate from the keys. `viewOrientation('falling', 'horizontal')` is now `undefined`.
- `PlaybackDriver`: `setScore(score, tempo, lead?)` takes the lead-in, and `setLeadIn(score, tempo, lead)` rebuilds only the beat cursor (a Count-in change, also mid-play, never re-hands a note or click); it asks the engine for its metronome on every use; option `countInClicks: 'always'` clicks the count-in with the metronome off (the providers use it).
- `<Transport>` restyled to match pepperscore's chrome: a green pill play button with a play/pause icon (accessible name still "Play"/"Pause"), styled seek and tempo tracks with a filled part, a switch (`role="switch"`) for Metronome, small caps labels and pepperscore's underlined BPM field. New contextual classes (`ivories-transport-play`, `ivories-transport-seek`, ...); the existing classes stay.
- The notation presets frame the score on the chrome panel with a little padding.
- Design pass against pepperscore's reader: the classic theme moves from a pure black stage and navy chrome to pepperscore's green family (stage `#0e1511`, panel `#16211a`, ink `#eef3ec`, sage `#8fb89a` accent, progress strip and key line; was red `#e8384f` and a faint white line). The `contrast` preset keeps black. Transport controls share one height (`--ivories-transport-control-h`, 2rem, 2.5rem on touch pointers), the count-in select is styled (30px, bordered, drawn chevron) instead of the OS control, and the Metronome label now precedes its switch like every other field. Loading and error messages are panel chips (`--ivories-message-*`), errors in terracotta. The paper notation card takes pepperscore's `#e2e9e0` border and a green-black shadow (`--ivories-notation-shadow`).

### Fixed

- No sound with `sounds` set (0.1.0 too): the GM pack reached smplr's Sampler keyed by MIDI-number strings, which matched no note, so every view played silently with no error. The path is gone; notes now reach pepperscore's instruments as MIDI note numbers, and unit and browser tests count the voices that actually start (keyboard-only view, Stop cancelling queued notes, two players on one page, only the asset base host asked).
- A note that cannot start no longer takes the rest of the session's audio with it.
- Idle frame: before Play (and after a seek to 0:00 while paused) the provider's own clock waits at the start of the count-in (`-lead.sec`: `countIn` bars, or the one silent beat with `countIn={0}`) instead of at 0, so the falling roll never idles with a beat-1 note drawn on the keys. The time readout still reads 0:00, the seek thumb sits at the start, no count is shown, and Play from there runs the whole count-in. `clock.now()` and `onTimeUpdate` report the negative time while parked; `useIvories().parked()` tells a host. A host-supplied `AudioClock`, `MediaClock` or `ManualClock` is never moved.
- `keyboard+notation` / `endless+keyboard` (and `<Notation>` without `zoom`): the notation panel cut off the bottom of a grand staff. The engraving is now fitted to the panel's height so a whole system shows.

### Known limitations

- Live keys on an SF2 piano (`TimGM6mb.sf2`: a sound pack without the piano, or `sources` of kind `sf2`) cut off about 150 ms after release instead of fading: pepperscore plays SF2 sounds through the instrument's output, past ivories' per-key envelope.
- A seek to exactly 0:00 while playing plays on with no count-in (a seek never replays it); pause first to count in from the top.

### Docs

- README: with Tailwind v4, declare `@layer theme, base, ivories, components, utilities` (ivories above preflight). The old advice put `ivories` first, below preflight, which reset the transport's buttons to plain text. Also notes that notation needs `pepperscore/style.css` for its cursor and highlights.

## 0.1.0 - 2026-10-13

### Added

- Initial release.
