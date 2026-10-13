import { PlatformError } from 'ivories/core'
import type { AuthProvider, AuthState, PlatformDevice } from 'ivories/core'

/** An in-memory AuthProvider for UI tests (no backend, no network). */
export function fakeAuth(o: { code?: string; handle?: string } = {}) {
  const code = o.code ?? '12345678'
  let state: AuthState = { status: 'signed-out' }
  const listeners = new Set<(s: AuthState) => void>()
  const set = (s: AuthState) => { state = s; for (const l of listeners) l(s) }
  const requested: string[] = []
  const devicesList: PlatformDevice[] = [
    { id: 'd1', label: 'This laptop', userAgent: 'UA1', lastAccessAt: null, current: true },
    { id: 'd2', label: null, userAgent: 'Phone browser', lastAccessAt: null, current: false },
  ]
  const auth: AuthProvider & { requested: string[]; devicesList: PlatformDevice[] } = {
    id: 'fake', codeLength: code.length, requested, devicesList,
    getState: () => state,
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    async requestCode(email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new PlatformError('invalid', 'Enter a valid email address.')
      requested.push(email.trim())
      set({ status: 'signed-out', pendingEmail: email.trim() })
    },
    async verifyCode(_email, c) {
      if (c !== code) throw new PlatformError('invalid_code', 'That code is not right, or it has expired.')
      const user = { id: 'u1', handle: o.handle ?? 'ana', displayName: null }
      set({ status: 'signed-in', user })
      return user
    },
    async signOut() { set({ status: 'signed-out' }) },
    async devices() { return [...devicesList] },
    async revokeDevice(id) {
      const i = devicesList.findIndex((d) => d.id === id)
      const [gone] = devicesList.splice(i, 1)
      if (gone?.current) set({ status: 'signed-out' })
    },
    async signOutEverywhere() { set({ status: 'signed-out' }) },
  }
  return auth
}
