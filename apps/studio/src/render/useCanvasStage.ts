import { useEffect, useRef } from 'react'

/**
 * Owns the canvas sizing and the rAF loop. Calls draw(ctx, w, h) every frame.
 * The draw callback is held in a ref so changing it never restarts the loop.
 */
export function useCanvasStage(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0, h = 0, raf = 0

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, r.width)
      h = Math.max(1, r.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const frame = () => { raf = requestAnimationFrame(frame); drawRef.current(ctx, w, h) }
    raf = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return canvasRef
}
