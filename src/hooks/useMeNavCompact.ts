import { useEffect, useRef, useState, type RefObject } from 'react'

const SCROLL_DOWN_PX = 2
const TOP_RESET_PX = 8
/** High lerp so shrink/expand settles in one quick motion (~6–8 frames). */
const LERP = 0.55
/** Layout chrome follows progress once past this. */
const LAYOUT_AT = 0.18

/** Scroll-driven nav compact — ported from figs_1.2.9's Me tab: one smooth progress curve (0→1,
 * lerped via rAF) drives both a boolean `compact` flag and a continuous `progress` value so a
 * header can shrink/fade in step with the scroll instead of snapping. Expands again only at the
 * very top of the scroll container (or when `forceExpandKey` bumps). */
export function useMeNavCompact(scrollRef: RefObject<HTMLElement | null>, enabled: boolean, forceExpandKey = 0, paused = false) {
  const [compact, setCompact] = useState(false)
  const [progress, setProgress] = useState(0)
  const lastY = useRef(0)
  const target = useRef(0)
  const current = useRef(0)
  const rafRef = useRef<number | null>(null)

  const stopLoop = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const syncCompact = (p: number) => {
    setCompact(p >= LAYOUT_AT)
  }

  const tick = () => {
    const next = current.current + (target.current - current.current) * LERP
    const settled = Math.abs(target.current - next) < 0.002
    current.current = settled ? target.current : next
    setProgress(current.current)
    syncCompact(current.current)

    if (!settled) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      rafRef.current = null
    }
  }

  const kick = () => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }

  const reset = () => {
    stopLoop()
    target.current = 0
    current.current = 0
    setCompact(false)
    setProgress(0)
    lastY.current = 0
  }

  useEffect(() => {
    if (!enabled) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    if (!enabled || paused || forceExpandKey === 0) return
    target.current = 0
    setCompact(false)
    kick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpandKey, enabled, paused])

  useEffect(() => {
    if (!enabled || paused) {
      stopLoop()
      return
    }

    let cancelled = false
    let detach: (() => void) | undefined

    const attach = () => {
      const scrollEl = scrollRef.current
      if (!scrollEl || cancelled) return false

      const onScroll = () => {
        const y = scrollEl.scrollTop
        const dy = y - lastY.current
        const atTop = y <= TOP_RESET_PX

        if (atTop) {
          target.current = 0
        } else if (dy > SCROLL_DOWN_PX) {
          target.current = 1
        }

        lastY.current = y
        kick()
      }

      lastY.current = scrollEl.scrollTop
      if (scrollEl.scrollTop > TOP_RESET_PX) {
        target.current = 1
      }
      scrollEl.addEventListener('scroll', onScroll, { passive: true })
      onScroll()
      detach = () => scrollEl.removeEventListener('scroll', onScroll)
      return true
    }

    if (!attach()) {
      const id = requestAnimationFrame(() => {
        attach()
      })
      return () => {
        cancelled = true
        cancelAnimationFrame(id)
        stopLoop()
        detach?.()
      }
    }

    return () => {
      cancelled = true
      stopLoop()
      detach?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paused, scrollRef])

  return { compact, progress }
}
