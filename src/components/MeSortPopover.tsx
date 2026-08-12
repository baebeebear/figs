import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Check, LayoutGrid, List } from 'lucide-react'
import type { MeLayoutMode, MeOriginFilter, MeSortKey, MeSortState } from '../lib/meSort'

type Props = {
  open: boolean
  onClose: () => void
  /** Anchor element for fixed positioning (the sort trigger button's parent). */
  anchorRef?: React.RefObject<HTMLElement | null>
  origin: MeOriginFilter
  onOriginChange: (origin: MeOriginFilter) => void
  layoutMode: MeLayoutMode
  onLayoutModeChange: (mode: MeLayoutMode) => void
  state: MeSortState
  onChange: (next: MeSortState) => void
  options: { key: MeSortKey; label: string }[]
  /** Hide grid/list toggle (e.g. cookbook detail list). */
  hideLayout?: boolean
  /** Hide origin filter (e.g. cookbook detail). */
  hideOrigin?: boolean
}

export default function MeSortPopover({
  open,
  onClose,
  anchorRef,
  origin,
  onOriginChange,
  layoutMode,
  onLayoutModeChange,
  state,
  onChange,
  options,
  hideLayout = false,
  hideOrigin = false,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const el = anchorRef?.current
    if (!el) {
      setPos({ top: 72, right: 16 })
      return
    }
    const rect = el.getBoundingClientRect()
    setPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    })
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onResize = () => {
      const el = anchorRef?.current
      if (!el) {
        setPos({ top: 72, right: 16 })
        return
      }
      const rect = el.getBoundingClientRect()
      setPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, anchorRef])

  if (!open || !pos) return null

  const pickSort = (key: MeSortKey) => {
    if (state.key === key) {
      onChange({ ...state, direction: state.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      onChange({ key, direction: 'desc' })
    }
  }

  return createPortal(
    <>
      <button type="button" aria-label="Close sort menu" className="fixed inset-0 z-[600]" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-[610] w-[210px] overflow-hidden rounded-2xl border border-[#ECE9E3] bg-white p-2 shadow-[0_20px_50px_-14px_rgba(20,10,40,0.34)]"
        style={{ top: pos.top, right: pos.right }}
      >
        {!hideLayout ? (
          <>
            <div className="mb-2 flex items-center justify-between rounded-xl bg-[#F6F5F2] p-1">
              <button
                type="button"
                onClick={() => onLayoutModeChange('grid')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-ui text-[12px] font-semibold transition ${
                  layoutMode === 'grid' ? 'bg-white text-[#1A0D40] shadow-sm' : 'text-[#6E6E73]'
                }`}
              >
                <LayoutGrid size={14} strokeWidth={2} />
                Grid
              </button>
              <button
                type="button"
                onClick={() => onLayoutModeChange('list')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-ui text-[12px] font-semibold transition ${
                  layoutMode === 'list' ? 'bg-white text-[#1A0D40] shadow-sm' : 'text-[#6E6E73]'
                }`}
              >
                <List size={14} strokeWidth={2} />
                List
              </button>
            </div>
            <div className="my-1.5 h-px bg-[#ECE9E3]" />
          </>
        ) : null}

        {!hideOrigin ? (
          <>
            <div className="mb-1 flex flex-col gap-0.5">
              <div className="px-2.5 pt-1 pb-0.5 font-ui text-[10.5px] font-bold uppercase tracking-wider text-[#9a9aa0]">Origin</div>
              {[
                { id: 'all', label: 'All' },
                { id: 'created', label: 'Created' },
                { id: 'saved', label: 'Saved' },
              ].map((o) => {
                const selected = origin === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onOriginChange(o.id as MeOriginFilter)}
                    className={`flex w-full items-center justify-between rounded-[10px] px-2.5 py-1.5 text-left font-ui text-[13px] transition ${
                      selected ? 'bg-[#F6F5F2] font-semibold text-[#111]' : 'text-[#6E6E73] hover:bg-[#F6F5F2]'
                    }`}
                  >
                    <span>{o.label}</span>
                    {selected ? <Check size={14} strokeWidth={2.5} className="text-[#1A0D40]" /> : null}
                  </button>
                )
              })}
            </div>
            <div className="my-1.5 h-px bg-[#ECE9E3]" />
          </>
        ) : null}

        <div className="flex flex-col gap-0.5">
          <div className="px-2.5 pt-1 pb-0.5 font-ui text-[10.5px] font-bold uppercase tracking-wider text-[#9a9aa0]">Sort by</div>
          {options.map((row) => {
            const active = state.key === row.key
            const Arrow = state.direction === 'asc' ? ArrowUp : ArrowDown
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => pickSort(row.key)}
                className={`flex w-full items-center justify-between rounded-[10px] px-2.5 py-1.5 text-left transition ${
                  active ? 'bg-[#F6F5F2] font-semibold text-[#111]' : 'text-[#6E6E73] hover:bg-[#F6F5F2]'
                }`}
              >
                <span className="font-ui text-[13px]">{row.label}</span>
                {active ? <Arrow size={14} strokeWidth={2.2} className="text-[#1A0D40]" /> : null}
              </button>
            )
          })}
        </div>
      </div>
    </>,
    document.body,
  )
}
