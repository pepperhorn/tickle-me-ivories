import { useCallback, useSyncExternalStore } from 'react'
import type { AuthProvider, AuthState } from 'ivories/core'

/** The provider's auth state, or null without a provider. getState is stable per change (plugin contract). */
export function useAuthState(auth: AuthProvider | null): AuthState | null {
  const subscribe = useCallback((onChange: () => void) => (auth ? auth.subscribe(() => onChange()) : () => {}), [auth])
  const get = useCallback(() => (auth ? auth.getState() : null), [auth])
  return useSyncExternalStore(subscribe, get, get)
}
