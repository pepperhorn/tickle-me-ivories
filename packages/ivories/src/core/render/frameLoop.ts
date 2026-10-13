/**
 * One requestAnimationFrame loop per provider (spec §3.2). Every subscriber
 * gets the same t from a single clock read, so two views never disagree.
 * Runs only while something is subscribed; never touches window at import.
 */
export class FrameLoop {
  private readonly fns = new Set<(t: number) => void>()
  private raf = 0
  private readonly now: () => number

  constructor(now: () => number) { this.now = now }

  add(fn: (t: number) => void): () => void {
    this.fns.add(fn)
    this.ensure()
    return () => {
      this.fns.delete(fn)
      if (this.fns.size === 0) this.halt()
    }
  }

  tick(): void {
    const t = this.now()
    for (const fn of [...this.fns]) {
      try { fn(t) } catch (err) { console.error('ivories: frame subscriber threw', err) }
    }
  }

  dispose(): void {
    this.fns.clear()
    this.halt()
  }

  private ensure(): void {
    if (this.raf || typeof requestAnimationFrame !== 'function') return
    const loop = () => { this.raf = requestAnimationFrame(loop); this.tick() }
    this.raf = requestAnimationFrame(loop)
  }

  private halt(): void {
    if (this.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf)
    this.raf = 0
  }
}
