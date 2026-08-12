import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type PopupAnchor = { clientX: number; clientY: number }

type Props = {
  anchor: PopupAnchor
  onClose: () => void
  children: React.ReactNode
  widthPx?: number
  ariaLabel?: string
}

/** Frosted-glass popup that appears anchored at the exact press point — ported from figs_1.0's
 * `StashRowContextMenu` positioning algorithm: centered horizontally on the press x, opens 10px
 * below the press y by default, flips above if it would overflow the bottom, and clamps to a
 * 12px viewport margin on every edge (including the top, so it can render over the header if the
 * press happened near the top of the screen — matches figs_1.0's behavior exactly). */
export default function AnchoredPopup({ anchor, onClose, children, widthPx = 176, ariaLabel }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const menuW = menuRef.current?.offsetWidth ?? widthPx
    const menuH = menuRef.current?.offsetHeight ?? 160
    const pad = 12
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = anchor.clientY + 10
    let left = anchor.clientX - menuW * 0.5

    if (left < pad) left = pad
    if (left + menuW > vw - pad) left = vw - pad - menuW
    if (top + menuH > vh - pad) top = Math.max(pad, anchor.clientY - menuH - 10)
    if (top < pad) top = pad

    setPos({ top, left })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.clientX, anchor.clientY])

  return createPortal(
    <div className="fixed inset-0 z-[300]" onClick={onClose} role="presentation">
      <div
        ref={menuRef}
        role="menu"
        aria-label={ariaLabel}
        className="fixed overflow-hidden rounded-2xl border border-white/75 bg-white/82 shadow-[0_12px_40px_rgba(26,13,64,0.14)] backdrop-blur-md"
        style={{ width: widthPx, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
