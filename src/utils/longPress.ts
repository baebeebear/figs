/** Native Pointer Events long-press detector — no gesture library. Ported from figs_1.0's
 * `armLongPress` pattern: arms a timer on pointerdown, cancels it if the pointer moves past
 * `moveThreshold` or lifts before `ms` elapses. Returns the pointer-event handlers to spread
 * onto the target element. */
export function armLongPress(
  onLongPress: (e: React.PointerEvent) => void,
  opts: { ms?: number; moveThreshold?: number } = {},
) {
  const ms = opts.ms ?? 500
  const moveThreshold = opts.moveThreshold ?? 12
  let timer: number | null = null
  let startX = 0
  let startY = 0

  const clear = () => {
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      startX = e.clientX
      startY = e.clientY
      clear()
      const evt = e
      timer = window.setTimeout(() => {
        timer = null
        onLongPress(evt)
      }, ms)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (timer == null) return
      if (Math.abs(e.clientX - startX) > moveThreshold || Math.abs(e.clientY - startY) > moveThreshold) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
  }
}
