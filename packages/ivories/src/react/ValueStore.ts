/** A tiny external store for useSyncExternalStore (the library ships no zustand, R12). */
export class ValueStore<T> {
  private value: T
  private readonly listeners = new Set<() => void>()

  constructor(value: T) { this.value = value }

  get = (): T => this.value

  set(v: T): void {
    if (Object.is(v, this.value)) return
    this.value = v
    for (const l of [...this.listeners]) l()
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }
}
