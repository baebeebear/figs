import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  open: boolean
  onClose: () => void
  label?: string
  /** Kept sharp above the blur (menu panel). */
  children: ReactNode
  /** Absolute position inside the phone shell. */
  panelStyle: CSSProperties
  panelClassName?: string
  panelRef?: React.RefObject<HTMLDivElement | null>
}

function useShellHost() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setHost(
      (document.querySelector('.figs-phone-shell') as HTMLElement | null) ??
        (document.querySelector('.figs-app-viewport') as HTMLElement | null) ??
        document.body,
    )
  }, [])
  return host
}

/**
 * Blurs everything in the phone shell. Panel is portaled above the scrim
 * so the popup stays sharp (tab-bar X sits above via its own z-index).
 */
export default function FigsGlassOverlay({
  open,
  onClose,
  label = 'Close menu',
  children,
  panelStyle,
  panelClassName = '',
  panelRef,
}: Props) {
  const host = useShellHost()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (panelRef?.current?.contains(t)) return
      if (t.closest('.figs-glass-panel')) return
      if (t.closest('.figs-tab-bar-plus')) return
      if (t.closest('[data-figs-glass-anchor]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, onClose, panelRef])

  if (!open || !host) return null

  return createPortal(
    <>
      <button type="button" aria-label={label} className="figs-glass-scrim" onClick={onClose} />
      <div
        ref={panelRef}
        className={`figs-glass-panel ${panelClassName}`.trim()}
        style={panelStyle}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    host,
  )
}

/** Measure an anchor’s box relative to the phone shell. */
export function useShellAnchorRect(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
) {
  const [rect, setRect] = useState<{
    top: number
    bottom: number
    left: number
    right: number
    width: number
    height: number
    shellW: number
    shellH: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    const measure = () => {
      const shell = document.querySelector('.figs-phone-shell') as HTMLElement | null
      const anchor = anchorRef.current
      if (!shell || !anchor) return
      const sr = shell.getBoundingClientRect()
      const ar = anchor.getBoundingClientRect()
      setRect({
        top: ar.top - sr.top,
        bottom: ar.bottom - sr.top,
        left: ar.left - sr.left,
        right: ar.right - sr.left,
        width: ar.width,
        height: ar.height,
        shellW: sr.width,
        shellH: sr.height,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, anchorRef])

  return rect
}
