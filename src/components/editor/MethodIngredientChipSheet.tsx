import { useState } from 'react'
import CenteredPopup from '../CenteredPopup'
import UnitDropdown from '../UnitDropdown'

type Props = {
  name: string
  amount: string
  unit: string
  onClose: () => void
  onSave: (next: { name: string; amount: string; unit: string }) => void
}

const fieldClass =
  'h-9 rounded-lg border border-[#E8E8ED] bg-white px-2.5 font-ui text-[13.5px] text-[#1A0D40] outline-none focus:border-[#708a7c]'

/** Tap a method ingredient bubble → edit display name + amount/unit on the linked row. */
export default function MethodIngredientChipSheet({ name, amount, unit, onClose, onSave }: Props) {
  const [nextName, setNextName] = useState(name)
  const [nextAmount, setNextAmount] = useState(amount)
  const [nextUnit, setNextUnit] = useState(unit)

  return (
    <CenteredPopup title="Ingredient" subtitle="Swap name or adjust amount" onClose={onClose} widthClassName="max-w-sm">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9a9aa0]">Name</span>
          <input
            className={fieldClass}
            value={nextName}
            onChange={(e) => setNextName(e.target.value)}
            placeholder="Ingredient"
            autoFocus
          />
        </label>
        <div className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9a9aa0]">Amount</span>
            <input
              className={`${fieldClass} w-full text-center`}
              value={nextAmount}
              onChange={(e) => setNextAmount(e.target.value)}
              placeholder="1"
            />
          </label>
          <label className="flex w-[88px] shrink-0 flex-col gap-1">
            <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9a9aa0]">Unit</span>
            <UnitDropdown value={nextUnit} onChange={setNextUnit} className={`${fieldClass} w-full`} />
          </label>
        </div>
        <button
          type="button"
          onClick={() => onSave({ name: nextName.trim() || name, amount: nextAmount, unit: nextUnit })}
          className="mt-1 h-11 w-full rounded-xl border-0 bg-[#1A0D40] font-ui text-[14px] font-semibold text-white"
        >
          Save
        </button>
      </div>
    </CenteredPopup>
  )
}
