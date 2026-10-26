/** Types only: scene/platform declarations must stay runtime-free. */
export type FrettedInstrument = 'guitar' | 'bass4' | 'bass5'
export type HeadstockStyle = 'strat' | 'tele' | 'precision' | 'violin'
export interface FretboardOptions {
  instrument?: FrettedInstrument
  headstock?: HeadstockStyle
  noteLabels?: 'note' | 'fret'
  appearance?: 'dark' | 'light'
  frets?: 12 | 24
}
