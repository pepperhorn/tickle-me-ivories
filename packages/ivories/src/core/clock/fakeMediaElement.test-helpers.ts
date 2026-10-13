/** A media element stand-in: events fire synchronously, time moves on advance(). */
export class FakeMedia extends EventTarget {
  paused = true
  ended = false
  private t = 0
  private r = 1
  get currentTime() { return this.t }
  set currentTime(v: number) { this.t = Math.max(0, v); this.dispatchEvent(new Event('seeked')) }
  get playbackRate() { return this.r }
  set playbackRate(v: number) { this.r = v; this.dispatchEvent(new Event('ratechange')) }
  play() { if (this.paused) { this.paused = false; this.dispatchEvent(new Event('play')) } return Promise.resolve() }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')) } }
  advance(s: number) { if (!this.paused) this.t += s * this.r }
}
