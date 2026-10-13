// Tickle's provider interfaces (spec §2, "Tickle provider interfaces").
//
// Consumers (the PepperHorn plugin) reach this file as a declaration through
// `ivories/core` (dist/types/core/platform/types.d.ts), as a TYPE-ONLY import.
// It must stay runtime-free: it may import only settings/types.ts,
// model/types.ts, layout/types.ts and ./errors (types.test.ts walks the graph).
//
// SceneV1/LookV1/SongRefWithTitle are declared here rather than in
// src/platform/scene.ts as spec §8.1 shows them, because this task (2.2a)
// runs before 2.3 (the scene/look codecs) per the phase-2 pre-flight's
// dependency ordering: types.ts can't wait for scene.ts to exist, and
// scene.ts can't be typed without these shapes existing somewhere first.
// 2.3's scene.ts re-exports these types and adds songKey/sceneFromState/
// lookFromSettings/applyLook.

import type { Aspect, Layout } from '../layout/types'
import type { DisplayMode, ScoreDocument } from '../model/types'
import type {
  DisplaySettings, SongProfile, TextSettings, ThemeSettings, VelocityScheme,
} from '../settings/types'

export type { PlatformErrorCode } from './errors'
export { PlatformError, isPlatformError } from './errors'

// ---- shared ----
export type SaveKind = 'scene' | 'look'
export type Visibility = 'private' | 'link_view' | 'link_edit' | 'public'

// ---- auth ----
export interface PlatformUser { id: string; handle: string; displayName: string | null }
export type AuthState =
  | { status: 'unknown' }                    // restoring
  | { status: 'signed-out'; pendingEmail?: string }
  | { status: 'signed-in'; user: PlatformUser }
/** One signed-in browser or app session, as the account's device list shows it. */
export interface PlatformDevice {
  id: string
  label: string | null
  userAgent: string | null
  lastAccessAt: string | null
  current: boolean
}
export interface AuthProvider {
  readonly id: string
  readonly codeLength: number                // 8 on ph-apps (OTP_AUTH_CODE_DIGITS)
  getState(): AuthState
  subscribe(listener: (s: AuthState) => void): () => void
  requestCode(email: string): Promise<void>  // always resolves for a well-formed email (no enumeration)
  verifyCode(email: string, code: string): Promise<PlatformUser>  // PlatformError('invalid_code')
  signOut(): Promise<void>
  manageAccount?(): void                     // opens the device list (plugin-rendered link/route)
  /** The account's signed-in devices. Optional: a provider without sessions omits it. */
  devices?(): Promise<PlatformDevice[]>
  /** Ends one device's session. Revoking the current device signs this browser out. */
  revokeDevice?(id: string): Promise<void>
  signOutEverywhere?(): Promise<void>
}

// ---- scene / look payloads (spec §8.1) ----
export type SongRef =
  | { kind: 'opensongs'; id: string; ref: string }                     // ref: tag or 40-hex SHA
  | { kind: 'local'; sha256: string; name: string; format: 'midi' | 'musicxml' }
  | { kind: 'midi'; sha256: string; name: string; dataB64: string }    // signed-in only
  | { kind: 'ph-asset'; assetId: string }                              // phase 6
export type SongRefWithTitle = SongRef & { title: string }
export interface SceneV1 {
  v: 1
  kind: 'scene'
  song: SongRefWithTitle
  profile: SongProfile                // PROFILE_SCHEMA_VERSION 1; invariant: profile.song.id === songKey(song)
}
/** Spec §5.4: SceneV1 + the stage layout. What every provider stores and shares now. */
export interface SceneV2 {
  v: 2
  kind: 'scene'
  song: SongRefWithTitle
  profile: SongProfile
  layout: Layout
  aspect: Aspect
}
export interface LookV1 {
  v: 1
  kind: 'look'
  theme: ThemeSettings                // name + matte (stageBgOverride)
  display: { mode: DisplayMode; fallSeconds: number; settings: DisplaySettings }
  text: Omit<TextSettings, 'keyOverride'>   // keyOverride is song-specific
  velocity: VelocityScheme
}

// ---- storage (named saves; autosave of tmi.profile.* stays local, always) ----
export interface SaveSummary {
  id: string; kind: SaveKind; name: string; updatedAt: string
  visibility: Visibility; songTitle?: string
}
export type SaveInput =
  | { kind: 'scene'; id?: string; name: string; payload: SceneV2 }
  | { kind: 'look'; id?: string; name: string; payload: LookV1 }
export interface StorageProvider {
  readonly id: string
  readonly remote: boolean
  list(kind: SaveKind): Promise<SaveSummary[]>
  load(kind: 'scene', id: string): Promise<SceneV2 | null>
  load(kind: 'look', id: string): Promise<LookV1 | null>
  save(input: SaveInput): Promise<SaveSummary>   // id minted client-side (crypto.randomUUID) when absent
  remove(kind: SaveKind, id: string): Promise<void>
}

// ---- share ----
export interface ShareResult { code: string; url: string; shortUrl: string | null; revokeKey?: string }
export interface ResolvedShare {
  code: string; kind: SaveKind; payload: unknown     // ALWAYS untrusted, decoded by the host
  owner: { handle: string } | null; visibility: Visibility
  isOwner: boolean; canEdit: boolean; canFork: boolean
}
export interface ShareProvider {
  readonly id: string
  readonly supports: { anonymous: boolean; owned: boolean; revoke: boolean; fork: boolean }
  share(input: { kind: 'scene'; payload: SceneV2 } | { kind: 'look'; payload: LookV1 }): Promise<ShareResult>
  shareSaved?(kind: SaveKind, saveId: string, visibility: Exclude<Visibility, 'private'>): Promise<ShareResult>
  match(loc: { pathname: string; hash: string }): string | null   // '/s/<code>' or '#share=<blob>'
  resolve(code: string): Promise<ResolvedShare | null>
  update?(code: string, payload: SceneV2 | LookV1): Promise<void>  // link_edit
  fork?(code: string, name: string): Promise<SaveSummary>
  revoke?(code: string, revokeKey?: string): Promise<void>
}

// ---- content ----
export type Access = 'free' | 'sign-in' | 'locked' | 'owned'
export interface LibraryItem {
  ref: SongRef; title: string; composer: string | null
  difficulty: number | null; tags: string[]; access: Access
  cta?: { label: string; href: string }                                // "Subscribe to unlock"; UI only
}
export interface LoadedSong { score: ScoreDocument; songKey: string; attribution: string | null }
export interface ContentProvider {
  readonly id: string; readonly label: string
  handles(ref: SongRef): boolean
  list(q: { search?: string; cursor?: string; limit?: number }): Promise<{ items: LibraryItem[]; next: string | null }>
  load(ref: SongRef): Promise<LoadedSong>                              // PlatformError('forbidden') when gated
}

// ---- plugin contract ----
export interface TickleHost {
  appVersion: string
  origin: string                                    // for share URLs: `${origin}/s/<code>`
  /** Throws; the app's own validators (§9.1). `shared: true` for a payload from
      someone else's link: camera deviceIds are dropped (they name another
      browser's devices). Own saves decode without it. */
  decodeScene(u: unknown, o?: { shared?: boolean }): SceneV2
  decodeLook(u: unknown): LookV1
  /** What a scene may carry out of this browser (no camera deviceIds). A
      provider applies it to every scene it uploads for sharing. */
  sceneForShare(s: SceneV2): SceneV2
}
export interface TicklePlugin {
  id: string; name: string; version: string
  auth?: AuthProvider; storage?: StorageProvider; share?: ShareProvider
  content?: ContentProvider[]
}
export type ActivatePlugin = (host: TickleHost) => TicklePlugin | Promise<TicklePlugin>
