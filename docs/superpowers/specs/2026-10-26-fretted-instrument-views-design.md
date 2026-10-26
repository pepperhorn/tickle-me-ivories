# Guitar and bass instrument views

Status: visual-template milestone implemented in the working tree; arrangement
design remains a draft. Product direction agreed with the owner on 2026-10-26;
algorithm details below remain proposals until reviewed. See the implemented
milestone section at the end for the precise current scope.

## Agreed direction

- Extend the existing clock, transport, score import, audio, scenes, and styling
  with guitar and bass fretboard views. Reuse Chordl's instrument, pitch,
  fingering, and voicing work and the chord-card applications' experience.
- Treat supplied MIDI as instrument agnostic. Offer true-pitch and constrained
  modes rather than assuming its register or voices suit the selected instrument.
- Constrained mode adapts notes into the instrument's common register and
  playable voicings. Bass needs explicit octave management.
- Support chord visualisation for bass and, eventually, violin and cello.
  Their usual musical role must not impose a monophonic display restriction.
- Offer melody versus accompaniment priority when reducing dense input.
- Preserve source notes and timing; derived assignments must be reproducible
  after seeking. Keep manual overrides and supplied string/fret information.

## Proposed independent controls

1. Pitch: True pitch / Constrained.
2. Priority: Melody / Accompaniment.
3. Presentation: Playable voicing / Chord tones.
4. Instrument and tuning, with optional fret range, starting position, preferred
   string, and open-string preference in advanced settings.

True pitch never changes note pitches. Unreachable or conflicting notes remain
identifiable in the source but cannot receive a playable assignment. Priority
may choose the displayed playable subset without changing the original score.

Constrained mode uses an instrument-specific preferred register within its hard
physical range. Prefer whole-part or phrase octave shifts; allow local octave
changes when necessary, penalising contour changes and discontinuous movement.
An octave shift preserves pitch class; changing chord tones requires a separate,
explicit arrangement policy, outside the initial scope.

Playable voicing allocates no more than one sounding pitch to each string and
checks reach, fingering, held notes, and transitions. String count alone is not
a playability test. Instrument-specific rules are required; guitar barre rules
do not establish bowed-string playability.

Chord tones is an educational map of the harmony over the selected neck region.
It may mark several positions on one string. These marks do not claim that the
notes form a simultaneously playable grip.

## Proposed reduction and placement rules

- Explicitly selected source voices take precedence over automatic selection.
- Melody priority favours continuity of the upper line; accompaniment priority
  favours continuity of the lower line and its bass movement. Register is an
  initial heuristic, not reliable voice identity when parts cross.
- Evaluate overlapping held notes as well as notes with simultaneous onsets.
- Protect the chosen line, then prefer distinct harmonically informative tones
  over redundant octave doublings. Treat bass notes, thirds, sevenths, and
  alterations in context rather than applying one universal omission order.
- Jointly optimise note selection, octave placement, and string assignments:
  a poor assignment must not force an otherwise avoidable omission.
- Do not invent chord tones or silently arpeggiate dense chords.
- Record each source note's result: unchanged, octave shifted, omitted, or
  unassigned, with reasons and source-to-result identity.
- Use stable tie-breaks and precompute file assignments; seeking must not alter
  fingering. Live input needs a separate causal policy without future notes.

## Playback decision still open

Keep source playback available. Propose a Source / Adapted audio switch so
users can hear the resulting arrangement, while seeing octave shifts and
omissions. Decide the default before implementation: source audio can sound
notes absent from the playable display.

## Delivery and validation

Start with guitar, bass4, and bass5 layouts, exact-pitch and chord-tone display;
then add phrase assignment, constrained register adaptation, reduction, and
saved overrides. A scrolling tab/string timeline follows the static view.

Reuse Chordl's shared pure functions where appropriate, keeping chord-card
register/omission defaults separate from exact score playback. The current
NoteEvent model needs placement metadata or a derived assignment layer; import
must preserve technical string/fret annotations. Live MIDI currently groups
held notes by pitch, so per-string channel identity needs separate work.

Validate exact pitch round-trips; fixed string/fret constraints; octave shifts
preserving pitch class; sustained-note conflicts; dense chords; voice crossing;
deterministic seeking; and honest reporting of unassignable material. Review
musical results on representative piano, guitar, and bass passages.

## Implemented visual-template milestone — 2026-10-26

The initial visual view is implemented as the pre-orchestration WIP baseline
on orch/0001-fretboard-baseline. It is not merged or released. The arrangement
sections above remain proposals.

- Public `Fretboard` follows the existing provider's active score/live notes and
  clock; public `FretboardDiagram` renders host-supplied MIDI pitches without a
  provider. Separate SVG geometry leaves the piano renderer intact.
- Studio source menus expose a `fretboard` slot plus guitar/bass4/bass5, headstock,
  Note/Fret labels, light/dark appearance, and 12/24-fret controls. Scene v2
  validation preserves these options for local saves and shares. No scene
  version bump or changes to the piano template JSON format.
- Original Strat/Tele and P-Bass/violin-bass headstock silhouettes; six guitar,
  four bass, or five bass5 tuners. Violin bass uses 2+2 / bass5 3+2 layouts.
- Nut/headstock at left; high string at top with octave-labelled tuning badges.
  Equal-tempered fret geometry, weighted strings, position inlays, open-string
  markers, and scrollable narrow layouts. CSS variables and scoped SVG classes
  cover all visual parts; package README includes a custom CSS example.
- Explicit **Exact pitch · all positions** mapping. No transposition or
  optimisation; multiple markers on one string are possible. Out-of-range
  sounding pitches are listed. Default spelling prefers B-flat over A-sharp;
  other chromatic fretboard labels use sharps and are not score-aware.
- Pure tuning constants mirror Chordl's low-to-high MIDI values without adding a
  sibling repository dependency. Physical indices are low-to-high internally.

Still unimplemented: constrained/adapted pitch, phrase/string assignment,
melody/accompaniment priority, playable grips, manual overrides, preservation of
source string/fret annotations, chord-name readouts for this view, adapted audio,
and scrolling tablature. Existing source playback remains unchanged. CSS skins
are host CSS; scene payloads save appearance choices, not arbitrary custom CSS.


Milestone validation: all 117 Vitest files passed (1,386 tests, one existing
skip), including exact MIDI/string/fret mapping, live note release, transport
seeking, label/skin controls, scene share round-trips, and runtime-free platform
declarations. Package/Studio build, CSS scoping, import/hosting/geometry checks
passed. Lint has existing warnings outside this change. T3 preview checked
1440px and 390px layouts, all four silhouettes, Note/Fret switching, and
horizontal scrolling with no page overflow. Real MIDI hardware was unavailable
in the preview browser; MIDI event integration was tested with a stub device.
