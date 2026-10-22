# Changelog

## 0.1.1 - 2026-10-22

### Added

- `sounds.fallbackSoundfontUrl`: a gleitz-layout base (`<base>/MusyngKite/<instrument>-mp3.js`) that both fallback paths load from, instruments not in the pack and the backup piano when the pack fails. With it set, sample requests go only to the pack host and this one. Unset or blank: unchanged behaviour.
- `notationTheme` (`'paper' | 'ink-on-dark'`, type `NotationTheme`) on `<Ivories>` and `<Notation>`. The default `paper` puts the engraving on a light card, so black ink is readable on the dark stage (it was near-invisible on the dark panel when the host did not load pepperscore's CSS). `ink-on-dark` keeps the dark panel and inverts the engraving to light ink, keeping the cursor and playing-note hues.
- Transport and notation custom properties (`--ivories-transport-*`, `--ivories-notation-*`, see the README) with fallbacks, so hosts can theme them from any ancestor.

### Changed

- `<Transport>` restyled to match pepperscore's chrome: a green pill play button with a play/pause icon (accessible name still "Play"/"Pause"), styled seek and tempo tracks with a filled part, a switch (`role="switch"`) for Metronome, small caps labels and pepperscore's underlined BPM field. New contextual classes (`ivories-transport-play`, `ivories-transport-seek`, ...); the existing classes stay.
- The notation presets frame the score on the chrome panel with a little padding.
- README: with Tailwind v4, declare `@layer theme, base, ivories, components, utilities` (ivories above preflight). The old advice put `ivories` first, below preflight, which reset the transport's buttons to plain text. Also notes that notation needs `pepperscore/style.css` for its cursor and highlights.

## 0.1.0 - 2026-10-13

### Added

- Initial release.
