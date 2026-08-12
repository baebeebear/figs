import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { GrocerySortMode, GrocerySortState } from '../lib/grocerySort'

type Props = {
  open: boolean
  onClose: () => void
  state: GrocerySortState
  onChange: (next: GrocerySortState) => void
  /** Hide the Recipe/Category rows — for pages that already surface those as header tabs. */
  hideGroupRows?: boolean
}

const TAP_ROWS: { mode: GrocerySortMode; label: string }[] = [
  { mode: 'addedFrom', label: 'Recipe' },
  { mode: 'category', label: 'Category' },
]
const ARROW_ROWS: { mode: GrocerySortMode; label: string }[] = [
  { mode: 'alphabetical', label: 'Alphabetical' },
  { mode: 'recent', label: 'Recently added' },
]

/** Grocery sort popover — Recipe / Category are single-tap checkmarks (unless hidden via
 * `hideGroupRows`), Alphabetical / Recently added carry a direction arrow. */
export default function GrocerySortPopover({ open, onClose, state, onChange, hideGroupRows = false }: Props) {
  if (!open) return null

  const pick = (mode: GrocerySortMode) => {
    if (state.mode === mode && (mode === 'alphabetical' || mode === 'recent')) {
      onChange({ ...state, direction: state.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      onChange({ mode, direction: 'asc' })
    }
  }

  return (
    <>
      <button type="button" aria-label="Close sort menu" className="fixed inset-0 z-[490]" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+8px)] z-[500] w-[210px] overflow-hidden rounded-2xl border border-[#ECE9E3] bg-white p-1.5 shadow-[0_20px_50px_-14px_rgba(20,10,40,0.34)]">
        {hideGroupRows
          ? null
          : TAP_ROWS.map((row) => {
              const active = state.mode === row.mode
              return (
                <button
                  key={row.mode}
                  type="button"
                  onClick={() => pick(row.mode)}
                  className={`flex w-full items-center justify-between rounded-[11px] px-3 py-2.5 text-left transition ${active ? 'bg-[#F6F5F2]' : 'hover:bg-[#F6F5F2]'}`}
                >
                  <span className={`font-ui text-[13px] ${active ? 'font-semibold text-[#111]' : 'font-medium text-[#111]'}`}>{row.label}</span>
                  {active ? <Check size={15} strokeWidth={2.6} className="text-[#4C6A57]" /> : null}
                </button>
              )
            })}
        {hideGroupRows ? null : <div className="my-1 h-px bg-[#F0EDE7]" />}
        {ARROW_ROWS.map((row) => {
          const active = state.mode === row.mode
          const Arrow = state.direction === 'asc' ? ChevronUp : ChevronDown
          return (
            <button
              key={row.mode}
              type="button"
              onClick={() => pick(row.mode)}
              className={`flex w-full items-center justify-between rounded-[11px] px-3 py-2.5 text-left transition ${active ? 'bg-[#F6F5F2]' : 'hover:bg-[#F6F5F2]'}`}
            >
              <span className={`font-ui text-[13px] ${active ? 'font-semibold text-[#111]' : 'font-medium text-[#111]'}`}>{row.label}</span>
              {active ? <Arrow size={16} strokeWidth={2.4} className="text-[#4C6A57]" /> : null}
            </button>
          )
        })}
      </div>
    </>
  )
}
