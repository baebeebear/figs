import { useCallback, useEffect, useRef } from 'react'

const DISARM_DELAY_MS = 150
export const ROW_INTERACTION_COOLDOWN_MS = 200

/** Swipe-action list rows — screen carousel must ignore these. */
export const FIGS_ROW_SWIPE_SELECTOR = '[data-figs-row-swipe]'

let rowGestureActive = false
let rowSwipeOpenCount = 0
let lastRowInteractionEndAt = 0
let disarmTimer: ReturnType<typeof setTimeout> | null = null

function isActive() {
  return rowGestureActive || rowSwipeOpenCount > 0
}

export function getIsRowInteractionActive(): boolean {
  return isActive()
}

export function wasRowInteractionRecent(withinMs = ROW_INTERACTION_COOLDOWN_MS): boolean {
  if (isActive()) return true
  return Date.now() - lastRowInteractionEndAt < withinMs
}

export function isRowSwipeSurface(el: EventTarget | null): boolean {
  if (!el || !(el instanceof Element)) return false
  return !!el.closest(FIGS_ROW_SWIPE_SELECTOR)
}

export function setRowSwipeOpenHardLock(locked: boolean) {
  if (locked) {
    rowSwipeOpenCount += 1
    if (disarmTimer) {
      clearTimeout(disarmTimer)
      disarmTimer = null
    }
    return
  }
  rowSwipeOpenCount = Math.max(0, rowSwipeOpenCount - 1)
  if (rowSwipeOpenCount === 0 && !rowGestureActive) {
    lastRowInteractionEndAt = Date.now()
  }
}

/** Keep page swipe locked while a row reveal is open. */
export function useRowSwipeOpenLock(offset: number) {
  const open = offset !== 0
  useEffect(() => {
    if (!open) return undefined
    setRowSwipeOpenHardLock(true)
    return () => setRowSwipeOpenHardLock(false)
  }, [open])
}

/** Arm/disarm helpers for pointer-driven swipe rows. */
export function useRowInteractionLock() {
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
      if (disarmTimer) {
        clearTimeout(disarmTimer)
        disarmTimer = null
      }
    }
  }, [])

  const armRowInteraction = useCallback(() => {
    if (disarmTimer) {
      clearTimeout(disarmTimer)
      disarmTimer = null
    }
    if (disarmTimerRef.current) {
      clearTimeout(disarmTimerRef.current)
      disarmTimerRef.current = null
    }
    rowGestureActive = true
  }, [])

  const disarmRowInteraction = useCallback(() => {
    if (disarmTimer) clearTimeout(disarmTimer)
    if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
    disarmTimer = setTimeout(() => {
      disarmTimer = null
      rowGestureActive = false
      if (rowSwipeOpenCount === 0) {
        lastRowInteractionEndAt = Date.now()
      }
    }, DISARM_DELAY_MS)
    disarmTimerRef.current = disarmTimer
  }, [])

  return { armRowInteraction, disarmRowInteraction }
}
