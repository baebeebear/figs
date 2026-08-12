import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import CenteredPopup from '../CenteredPopup'
import type { StashItem } from '../../lib/stash'

type Props = {
  item: StashItem
  onClose: () => void
  onReduceQuantity: (newQuantity: number) => void
  onEatenAll: () => void
}

/** Swiping Eaten opens this instead of instantly marking the item consumed — lets the user
 * say how much they actually ate (reduce/increase the remaining amount) or clear it entirely. */
export default function EatenAmountPopup({ item, onClose, onReduceQuantity, onEatenAll }: Props) {
  const [remaining, setRemaining] = useState(item.quantity)
  const step = item.quantity >= 4 ? 1 : 0.5

  const adjust = (delta: number) => setRemaining((q) => Math.max(0, Math.min(item.quantity, +(q + delta).toFixed(2))))

  const confirmReduce = () => {
    if (remaining <= 0) {
      onEatenAll()
    } else {
      onReduceQuantity(remaining)
    }
    onClose()
  }

  const eatenAll = () => {
    onEatenAll()
    onClose()
  }

  return (
    <CenteredPopup title="How much did you eat?" subtitle={item.name} onClose={onClose} widthClassName="max-w-xs">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Decrease remaining amount"
            onClick={() => adjust(-step)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ECE9E3] bg-[#F4F3F0] text-[#1A0D40]"
          >
            <Minus size={16} strokeWidth={2.4} />
          </button>
          <span className="min-w-[92px] text-center font-ui text-[17px] font-semibold text-[#1A0D40]">
            {remaining} {item.unit}
          </span>
          <button
            type="button"
            aria-label="Increase remaining amount"
            onClick={() => adjust(step)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ECE9E3] bg-[#F4F3F0] text-[#1A0D40]"
          >
            <Plus size={16} strokeWidth={2.4} />
          </button>
        </div>
        <p className="text-center font-ui text-[12px] text-[#9a9aa0]">
          left out of {item.quantity} {item.unit}
        </p>

        <button
          type="button"
          onClick={confirmReduce}
          className="h-[50px] w-full rounded-full border-0 bg-[#1A0D40] font-ui text-[14.5px] font-semibold text-white transition hover:opacity-95"
        >
          Update amount
        </button>
        <button
          type="button"
          onClick={eatenAll}
          className="h-[50px] w-full rounded-full border border-[#ECE9E3] bg-white font-ui text-[14.5px] font-semibold text-[#1A0D40] transition hover:bg-[#FAF9FC]"
        >
          Eaten all
        </button>
      </div>
    </CenteredPopup>
  )
}
