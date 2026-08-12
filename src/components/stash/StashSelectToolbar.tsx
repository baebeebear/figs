import { ArchiveX, ChevronLeft, Flame, Trash2 } from 'lucide-react'

type Props = {
  selectedCount: number
  allSelected: boolean
  onExit: () => void
  onToggleSelectAll: () => void
  onDelete: () => void
  onEaten: () => void
  onWaste: () => void
}

/** Select-mode toolbar — a normal in-flow block (not an overlay), so it pushes the list below it
 * down rather than covering the header. Styled like the sort popover's floating card (white,
 * rounded on all four corners, bordered, soft shadow) but stretched to span the row instead of a
 * narrow dropdown. 2 condensed lines: back chevron + Select-all toggle, then Eaten/Waste/Trash. */
export default function StashSelectToolbar({ selectedCount, allSelected, onExit, onToggleSelectAll, onDelete, onEaten, onWaste }: Props) {
  const hasSelection = selectedCount > 0
  return (
    <div className="flex-none px-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
      <div className="overflow-hidden rounded-2xl border border-[#ECE9E3] bg-white shadow-[0_20px_50px_-14px_rgba(20,10,40,0.34)]">
        <div className="flex items-center justify-between px-3 py-2">
          <button type="button" aria-label="Exit select" onClick={onExit} className="flex h-7 w-7 items-center justify-center border-0 bg-transparent text-[#111]">
            <ChevronLeft size={19} strokeWidth={2.25} />
          </button>
          <button type="button" onClick={onToggleSelectAll} className="border-0 bg-transparent font-ui text-[13px] font-semibold text-[#111]">
            {allSelected ? 'Unselect all' : 'Select all'}
          </button>
        </div>
        <div className="flex items-center gap-1 border-t border-[#F0EDE7] px-2 py-1.5">
          <button
            type="button"
            disabled={!hasSelection}
            onClick={onEaten}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-0 bg-transparent py-1.5 font-ui text-[12px] font-semibold text-[#111] disabled:opacity-30"
          >
            <Flame size={14} strokeWidth={2.1} />
            Eaten
          </button>
          <button
            type="button"
            disabled={!hasSelection}
            onClick={onWaste}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-0 bg-transparent py-1.5 font-ui text-[12px] font-semibold text-[#111] disabled:opacity-30"
          >
            <ArchiveX size={14} strokeWidth={2.1} />
            Waste
          </button>
          <button
            type="button"
            disabled={!hasSelection}
            onClick={onDelete}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-0 bg-transparent py-1.5 font-ui text-[12px] font-semibold text-[#111] disabled:opacity-30"
          >
            <Trash2 size={14} strokeWidth={2.1} />
            Trash
          </button>
        </div>
      </div>
    </div>
  )
}
