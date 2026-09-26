// Tickle's provider interfaces (spec §2, "Tickle provider interfaces").
//
// package.json exposes this file as the `./platform` export. The PepperHorn
// plugin (spec §4) type-checks THIS SOURCE FILE directly under its own
// tsconfig -- `skipLibCheck` does not cover a `.ts` file reached this way,
// even through `import type` (preflight F4). So this module, and everything
// it imports, must stay runtime-free: no settings/profile.ts (pulls in
// zustand via transport/useTransport.ts, and @tonejs/midi/tonal via
// io/parseMidi.ts), no zustand, no @tonejs/midi. `settings/types.ts` and
// `model/types.ts` have no runtime imports of their own, so they're the only
// tickle modules this file may import from.
//
// SceneV1/LookV1/SongRefWithTitle are declared here rather than in
// src/platform/scene.ts as spec §8.1 shows them, because this task (2.2a)
// runs before 2.3 (the scene/look codecs) per the phase-2 pre-flight's
// dependency ordering: types.ts can't wait for scene.ts to exist, and
// scene.ts can't be typed without these shapes existing somewhere first.
// 2.3's scene.ts re-exports these types and adds songKey/sceneFromState/
// lookFromSettings/applyLook.

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
export interface AuthProvider {
  readonly id: string
  readonly codeLength: number                // 8 on ph-apps (OTP_AUTH_CODE_DIGITS)
  getState(): AuthState
  subscribe(listener: (s: AuthState) => void): () => void
  requestCode(email: string): Promise<void>  // always resolves for a well-formed email (no enumeration)
  verifyCode(email: string, code: string): Promise<PlatformUser>  // PlatformError('invalid_code')
  signOut(): Promise<void>
  manageAccount?(): void                     // opens the device list (plugin-rendered link/route)
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
  | { kind: 'scene'; id?: string; name: string; payload: SceneV1 }
  | { kind: 'look'; id?: string; name: string; payload: LookV1 }
export interface StorageProvider {
  readonly id: string
  readonly remote: boolean
  list(kind: SaveKind): Promise<SaveSummary[]>
  load(kind: 'scene', id: string): Promise<SceneV1 | null>
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
  share(input: { kind: 'scene'; payload: SceneV1 } | { kind: 'look'; payload: LookV1 }): Promise<ShareResult>
  shareSaved?(kind: SaveKind, saveId: string, visibility: Exclude<Visibility, 'private'>): Promise<ShareResult>
  match(loc: { pathname: string; hash: string }): string | null   // '/s/<code>' or '#share=<blob>'
  resolve(code: string): Promise<ResolvedShare | null>
  update?(code: string, payload: SceneV1 | LookV1): Promise<void>  // link_edit
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
  decodeScene(u: unknown): SceneV1                  // throws; the app's own validators (§9.1)
  decodeLook(u: unknown): LookV1
}
export interface TicklePlugin {
  id: string; name: string; version: string
  auth?: AuthProvider; storage?: StorageProvider; share?: ShareProvider
  content?: ContentProvider[]
}
export type ActivatePlugin = (host: TickleHost) => TicklePlugin | Promise<TicklePlugin>
