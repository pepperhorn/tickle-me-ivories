import type { ChordDisplay, NoteLabelContent, TextSettings } from '../../core/settings/types'

/** R10: `labels` overrides settings.text; true = pitch names / chord symbol. */
export type LabelsProp = { noteNames?: NoteLabelContent | boolean; chords?: ChordDisplay | boolean }

export function applyLabels(text: TextSettings, labels?: LabelsProp): TextSettings {
  if (!labels) return text
  const out = { ...text }
  if (labels.noteNames !== undefined) {
    out.labels = labels.noteNames === true ? 'pitch' : labels.noteNames === false ? 'off' : labels.noteNames
  }
  if (labels.chords !== undefined) {
    out.chord = labels.chords === true ? 'symbol' : labels.chords === false ? 'off' : labels.chords
  }
  return out
}
