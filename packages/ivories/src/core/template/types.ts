// The style template format (v1). Type-only and importing nothing, so
// platform/types.ts can reach it without breaking its runtime-free rule.

export type BuiltinTemplateId =
  | 'classic' | 'classic-crf' | 'chord-cards' | 'chord-cards-crf' | 'outline' | 'contrast' | 'transparent'

export interface TemplateStage {
  bg?: string; gridLine?: string; gridLineC4?: string; beatLine?: string; barLine?: string
  middleCMark?: string; progressTrack?: string; progressFill?: string
}

export interface TemplateRaisedKeys { enabled: boolean; shadowColor: string; shadowDepth: number; lipColor: string; lipDepth: number }
export interface TemplateKeyPlate {
  enabled: boolean; fill: string; borderColor: string; borderWidth: number
  shadowColor: string; shadowDepth: number; padding: number
}

export interface TemplateKeys {
  white?: string; black?: string; border?: string; borderWidth?: number; gap?: number
  whiteRadius?: number; blackRadius?: number; outline?: string
  raised?: Partial<TemplateRaisedKeys>; plate?: Partial<TemplateKeyPlate>
}

export type BarShading = 'velocity' | 'flat'
export interface TemplateBars {
  radius?: number; outlineColor?: string; outlineWidth?: number
  shadowColor?: string; shadowDepth?: number; shading?: BarShading
}

export type ColourMode = 'hand' | 'pitch'
export interface TemplateColour { mode?: ColourMode; palette?: string[] }

export type FlashTint = 'white' | 'note'

export type BarLabelFormat = 'pitch' | 'pitch-octave' | 'solfege' | 'solfege-octave'
export interface BarLabelFont {
  family: string; weight: number; scale: number; color: string; strokeColor: string; strokeWidth: number
  case: 'upper' | 'lower'
}
export interface BarLabelStyle { show: boolean; format: BarLabelFormat; accidentals: 'glyph' | 'ascii'; font: BarLabelFont }
export interface BarLabelStyleInput {
  show?: boolean; format?: BarLabelFormat; accidentals?: 'glyph' | 'ascii'; font?: Partial<BarLabelFont>
}

export interface IvoriesTemplateV1 {
  v: 1
  kind: 'ivories-template'
  id: string
  name: string
  extends?: BuiltinTemplateId
  stage?: TemplateStage
  keys?: TemplateKeys
  bars?: TemplateBars
  colour?: TemplateColour
  flash?: { tint?: FlashTint }
  labels?: BarLabelStyleInput
  chrome?: Record<string, string>
}

export type TemplateRef = BuiltinTemplateId | IvoriesTemplateV1
