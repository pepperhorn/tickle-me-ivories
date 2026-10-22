# Changelog

## 0.1.1 - 2026-10-22

### Added

- `sounds.fallbackSoundfontUrl`: a gleitz-layout base (`<base>/MusyngKite/<instrument>-mp3.js`) that both fallback paths load from, instruments not in the pack and the backup piano when the pack fails. With it set, sample requests go only to the pack host and this one. Unset or blank: unchanged behaviour.
- `notationTheme` (`'paper' | 'ink-on-dark'`, type `NotationTheme`) on `<Ivories>` and `<Notation>`. The default `paper` puts the engraving on a light card, so black ink is readable on the dark stage (it was near-invisible on the dark panel when the host did not load pepperscore's CSS). `ink-on-dark` keeps the dark panel and inverts the engraving to light ink, keeping the cursor and playing-note hues.
- Transport and notation custom properties (`--ivories-transport-*`, `--ivories-notation-*`, see the README) with fallbacks, so hosts can theme them from any ancestor.
- Count-in: Play from the top (0:00, or after the end) runs `countIn` bars (`0 | 1 | 2`, default 1, type `CountInBars`) before the score's first beat, at negative clock time, so no falling bar touches the keys as playback starts and a rising tile leaves its key on beat 1. Count-in clicks (accent on 1) sound with the metronome off, and the falling, rising and keyboard views show the count over the stage. With 0 a silent beat still runs first. Seeks and resumes never replay it. Transport: a Count-in select (Off / 1 bar / 2 bars); `useIvories()` gains `play`, `countIn`, `setCountIn`, `lead`; provider prop `showCountIn` (default true) hides the on-stage count for hosts that draw their own.
- Note names on falling and rising bars by default (`noteBarLabels`: `'pitch'` default, `'pitch-octave'`, `'none'`, type `NoteBarLabels`): spelled as written in MusicXML (new optional `NoteEvent.spelling`), else by key signature, else sharps; white Poppins 600 with a dark outline, sized to the bar and hidden when it would not be legible.
- Transport beat ticks: the seek track breaks at every beat of the time signatures (dotted quarters in compound metres) and marks bar lines more strongly, through the tempo map; dense scores keep bar lines only, then every Nth bar. `--ivories-transport-tick`, `--ivories-count-in-ink`.

### Changed

- Falling is vertical only: `orientation="horizontal"` on `<FallingKeys>`, `<Ivories view="falling">` and falling `Stage` slots is deprecated (`@deprecated` in the types), ignored (draws vertical) and warns once in development. The horizontal roll is the rising roll, whose tiles emanate from the keys. `viewOrientation('falling', 'horizontal')` is now `undefined`.
- `PlaybackDriver`: `setScore(score, tempo, lead?)` takes the lead-in; option `countInClicks: 'always'` clicks the count-in with the metronome off (the providers use it).
- `<Transport>` restyled to match pepperscore's chrome: a green pill play button with a play/pause icon (accessible name still "Play"/"Pause"), styled seek and tempo tracks with a filled part, a switch (`role="switch"`) for Metronome, small caps labels and pepperscore's underlined BPM field. New contextual classes (`ivories-transport-play`, `ivories-transport-seek`, ...); the existing classes stay.
- The notation presets frame the score on the chrome panel with a little padding.

### Fixed

- `keyboard+notation` / `endless+keyboard` (and `<Notation>` without `zoom`): the notation panel cut off the bottom of a grand staff. The engraving is now fitted to the panel's height so a whole system shows.

### Docs

- README: with Tailwind v4, declare `@layer theme, base, ivories, components, utilities` (ivories above preflight). The old advice put `ivories` first, below preflight, which reset the transport's buttons to plain text. Also notes that notation needs `pepperscore/style.css` for its cursor and highlights.

## 0.1.0 - 2026-10-13

### Added

- Initial release.
