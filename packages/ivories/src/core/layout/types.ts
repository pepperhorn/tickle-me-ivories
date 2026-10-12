// Spec §5.1. Types only: platform/types.ts imports this file and must stay runtime-free.
export type IvoriesView = 'keyboard' | 'falling' | 'notation' | 'endless'
/** Falling/rising views: keyboard along the bottom (vertical) or up the left edge (horizontal piano roll). */
export type Orientation = 'vertical' | 'horizontal'
export type CameraFit = 'cover' | 'contain'

export type SlotSource =
  | { kind: 'ivories'; view: IvoriesView }
  | { kind: 'camera'; mode: 'webcam'; deviceId?: string; mirror: boolean; fit: CameraFit }
  | { kind: 'camera'; mode: 'mask'; fill: 'transparent' | string }   // string = CSS colour, e.g. '#00b140'

export type CameraSource = Extract<SlotSource, { kind: 'camera' }>
export type Corner = 'tl' | 'tr' | 'bl' | 'br'

export type Layout =
  | { kind: 'single'; main: SlotSource }
  | { kind: 'split'; top: SlotSource; bottom: SlotSource; ratio: number }      // ratio = top share, 0.15-0.85
  | { kind: 'pip'; main: SlotSource; inset: SlotSource; corner: Corner; size: number; margin: number }
  // size = inset width / stage width, 0.15-0.5; margin = fraction of stage width, 0-0.1 (R8)

export type LayoutKind = Layout['kind']
export type Aspect = 'free' | '16:9' | '9:16'
export type SlotName = 'main' | 'top' | 'bottom' | 'inset'
