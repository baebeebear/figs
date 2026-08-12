import { useState } from 'react'
import { GripVertical, Info, X } from 'lucide-react'
import UnitDropdown from '../UnitDropdown'
import { AttributeBadges } from '../stash/AttributeBadges'
import { deriveIngredientAttributes } from '../../lib/attributeFormulas'
import { splitLeadingAmount } from '../../utils/recipeMath'
import { titleCaseGroceryName } from '../../lib/parseGroceryLine'

export type EditorIngredient = { id: string; name: string; amount: string; unit: string; notes: string | null }

type Props = {
  ingredient: EditorIngredient
  onChange: (patch: Partial<EditorIngredient>) => void
  onRemove: () => void
  onEnterName: () => void
  nameInputRef: (el: HTMLInputElement | null) => void
  onDragHandlePointerDown: (e: React.PointerEvent) => void
  rowRef: (el: HTMLElement | null) => void
  dragging?: boolean
}

const fieldClass =
  'h-9 rounded-lg border border-[#E8E8ED] bg-white px-2.5 font-ui text-[13.5px] text-[#1A0D40] outline-none transition-[border-color] placeholder:text-[#9ca3af] focus:border-[#708a7c]'

/** One editable ingredient row — name / amount / unit, an info button that opens a notes panel
 * (free-text notes plus the live-derived attribute preview, kept out of the row itself since the
 * icon cluster reads as clutter at a glance), a drag handle, and delete. */
export default function IngredientEditRow({ ingredient, onChange, onRemove, onEnterName, nameInputRef, onDragHandlePointerDown, rowRef, dragging }: Props) {
  const [notesOpen, setNotesOpen] = useState(false)
  const attributes = ingredient.name.trim() ? deriveIngredientAttributes(ingredient.name) : []

  /** Amount must stay numbers-only — on blur, peel any trailing text ("2 cloves" → "2" + "cloves")
   * into notes so the amount field is always a clean quantity. */
  const handleAmountBlur = () => {
    const { amount, extra } = splitLeadingAmount(ingredient.amount)
    if (amount === ingredient.amount && !extra) return
    const patch: Partial<EditorIngredient> = { amount }
    if (extra) {
      patch.notes = ingredient.notes ? `${ingredient.notes}; ${extra}` : extra
    }
    onChange(patch)
  }

  return (
    <div
      ref={rowRef}
      className={`flex flex-col gap-1.5 border-b border-[#F4F3F6] py-2 last:border-b-0 ${dragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={onDragHandlePointerDown}
          className="-ml-1 flex h-9 w-6 shrink-0 touch-none items-center justify-center border-0 bg-transparent text-[#c4c2c8]"
        >
          <GripVertical size={16} strokeWidth={2} />
        </button>
        <input
          className={`${fieldClass} w-14 shrink-0 text-center`}
          placeholder="1"
          inputMode="decimal"
          value={ingredient.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          onBlur={handleAmountBlur}
        />
        <UnitDropdown value={ingredient.unit} onChange={(v) => onChange({ unit: v })} className={`${fieldClass} w-[76px] shrink-0`} />
        <input
          ref={nameInputRef}
          className={`${fieldClass} min-w-0 flex-1`}
          placeholder="ingredient (e.g. vegetable oil)"
          value={ingredient.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={() => {
            const next = titleCaseGroceryName(ingredient.name)
            if (next !== ingredient.name) onChange({ name: next })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const next = titleCaseGroceryName(ingredient.name)
              if (next !== ingredient.name) onChange({ name: next })
              onEnterName()
            }
          }}
        />
        <button
          type="button"
          aria-label="Notes"
          onClick={() => setNotesOpen((v) => !v)}
          className={`flex h-9 w-8 shrink-0 items-center justify-center border-0 bg-transparent ${ingredient.notes ? 'text-[#4C6A57]' : 'text-[#9a9aa0]'}`}
        >
          <Info size={15} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          aria-label="Remove ingredient"
          onClick={onRemove}
          className="-mr-1 flex h-9 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-[#9a9aa0]"
        >
          <X size={15} strokeWidth={2.3} />
        </button>
      </div>

      {notesOpen ? (
        <div className="ml-[30px] flex flex-col gap-1.5">
          {attributes.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9a9aa0]">Attributes</span>
              <AttributeBadges attributes={attributes} ingredientName={ingredient.name} />
            </div>
          ) : null}
          <textarea
            autoFocus
            className={`${fieldClass} h-auto min-h-[44px] resize-none py-2`}
            placeholder="Notes or suggestions for this ingredient…"
            value={ingredient.notes ?? ''}
            onChange={(e) => onChange({ notes: e.target.value || null })}
          />
        </div>
      ) : null}
    </div>
  )
}
