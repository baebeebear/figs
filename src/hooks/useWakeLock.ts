import { useCallback, useEffect, useRef } from 'react'

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}

/**
 * Screen Wake Lock helper — keeps the display awake during long scrapes / OCR.
 * Gracefully no-ops when `navigator.wakeLock` is missing (desktop Safari, some WebViews).
 */
export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)
  const wantLockRef = useRef(false)

  const releaseWakeLock = useCallback(async () => {
    wantLockRef.current = false
    const sentinel = sentinelRef.current
    sentinelRef.current = null
    if (!sentinel || sentinel.released) return
    try {
      await sentinel.release()
    } catch {
      /* ignore */
    }
  }, [])

  const requestWakeLock = useCallback(async () => {
    wantLockRef.current = true
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
      }
      if (!nav.wakeLock?.request) return
      if (document.visibilityState !== 'visible') return
      const sentinel = await nav.wakeLock.request('screen')
      sentinelRef.current = sentinel
      sentinel.addEventListener?.('release', () => {
        if (sentinelRef.current === sentinel) sentinelRef.current = null
      })
    } catch (e) {
      console.warn('[useWakeLock] request failed', e)
    }
  }, [])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && wantLockRef.current) {
        void requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      void releaseWakeLock()
    }
  }, [requestWakeLock, releaseWakeLock])

  return { requestWakeLock, releaseWakeLock }
}
