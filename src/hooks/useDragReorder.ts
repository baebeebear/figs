import { useRef, useState } from 'react'

/** Pointer-based drag-to-reorder for a flat list, driven by a 6-dot handle on each row — mirrors
 * the zone-drag pattern already used in Stash's select mode, generalized to any array. Rows report
 * their DOM node via `setRef(index)`; while dragging, whichever row the pointer is currently over
 * becomes the drop target, and releasing commits the reorder. */
export function useDragReorder<T>(items: T[], onReorder: (next: T[]) => void) {
  const rowRefs = useRef(new Map<number, HTMLElement>())
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragInfo = useRef<{ from: number; over: number | null }>({ from: -1, over: null })

  const setRef = (index: number) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(index, el)
    else rowRefs.current.delete(index)
  }

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    setDraggingIndex(index)
    setOverIndex(index)
    dragInfo.current = { from: index, over: index }

    const handleMove = (ev: PointerEvent) => {
      let hovered: number | null = null
      for (const [idx, el] of rowRefs.current) {
        const r = el.getBoundingClientRect()
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          hovered = idx
          break
        }
      }
      if (hovered != null) {
        dragInfo.current.over = hovered
        setOverIndex(hovered)
      }
    }

    const handleUp = () => {
      const { from, over } = dragInfo.current
      if (from >= 0 && over != null && over !== from) {
        const next = [...items]
        const [moved] = next.splice(from, 1)
        next.splice(over, 0, moved)
        onReorder(next)
      }
      setDraggingIndex(null)
      setOverIndex(null)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  return { setRef, startDrag, onDragMove: () => {}, endDrag: () => {}, draggingIndex, overIndex }
}
