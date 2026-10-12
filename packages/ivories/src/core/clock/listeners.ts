import type { ClockEvent } from './types'

/** A throwing subscriber must not stop the others (a view crashing must not
    stop the scheduler hearing a seek). */
export class ClockListeners {
  private readonly fns = new Set<(e: ClockEvent) => void>()

  add(fn: (e: ClockEvent) => void): () => void {
    this.fns.add(fn)
    return () => { this.fns.delete(fn) }
  }

  emit(e: ClockEvent): void {
    for (const fn of [...this.fns]) {
      try { fn(e) } catch (err) { console.error('ivories: clock subscriber threw', err) }
    }
  }

  clear(): void { this.fns.clear() }
}
