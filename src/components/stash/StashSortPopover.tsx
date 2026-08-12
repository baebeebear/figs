import { ChevronDown, ChevronUp } from 'lucide-react'
import type { StashSortMode, StashSortState } from '../../lib/stashSort'

type Props = {
  open: boolean
  onClose: () => void
  state: StashSortState
  onChange: (next: StashSortState) => void
}

const SORT_ROWS: { mode: StashSortMode; label: string }[] = [
  { mode: 'priority', label: 'Priority (expiration)' },
  { mode: 'alphabetical', label: 'Alphabetical' },
  { mode: 'recent', label: 'Recently added' },
]

/** Sort popover for the Stash header — Priority/Alphabetical/Recently-added, single-select with a
 * direction arrow. (Category/Utility/Attribute filtering lives in the group-by tabs instead.) */
export default function StashSortPopover({ open, onClose, state, onChange }: Props) {
  if (!open) return null

  const pickMode = (mode: StashSortMode) => {
    if (state.mode === mode) {
      onChange({ ...state, direction: state.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      onChange({ ...state, mode, direction: 'asc' })
    }
  }

  return (
    <>
      <button type="button" aria-label="Close sort menu" className="fixed inset-0 z-[490]" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+8px)] z-[500] w-[210px] overflow-hidden rounded-2xl border border-[#ECE9E3] bg-white p-1.5 shadow-[0_20px_50px_-14px_rgba(20,10,40,0.34)]">
        {SORT_ROWS.map((row) => {
          const active = state.mode === row.mode
          const Arrow = state.direction === 'asc' ? ChevronUp : ChevronDown
          return (
            <button
              key={row.mode}
              type="button"
              onClick={() => pickMode(row.mode)}
              className={`flex w-full items-center justify-between rounded-[11px] px-3 py-2.5 text-left transition ${active ? 'bg-[#F6F5F2]' : 'hover:bg-[#F6F5F2]'}`}
            >
              <span className={`font-ui text-[13px] ${active ? 'font-semibold text-[#111]' : 'font-medium text-[#111]'}`}>{row.label}</span>
              {active ? <Arrow size={16} strokeWidth={2.4} className="text-[#4C6A57]" aria-hidden /> : null}
            </button>
          )
        })}
      </div>
    </>
  )
}
