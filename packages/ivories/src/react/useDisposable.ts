import { useEffect, useState } from 'react'
import type { DependencyList } from 'react'

/**
 * Creates a resource in an effect and disposes it on cleanup. Null until the
 * first effect runs (also on the server), and StrictMode-safe: a remount gets
 * a fresh resource instead of a disposed one.
 */
export function useDisposable<T>(make: () => T | null, dispose: (t: T) => void, deps: DependencyList): T | null {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    const v = make()
    setValue(() => v)
    return () => {
      if (v !== null) dispose(v)
      setValue(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}
