import { useState } from 'react'
import AnchoredPopup, { type PopupAnchor } from '../AnchoredPopup'

type Props = {
  itemName: string
  anchor: PopupAnchor
  onClose: () => void
  onSelect: () => void
  onDelete: () => void
}

/** Long-press popup on a Stash row, anchored at the press point (figs_1.0's
 * `StashRowContextMenu` pattern) — "Select" enters batch mode with this row pre-selected,
 * "Delete" hard-removes just this item (with an inline confirm step). */
export default function StashRowActionsPopup({ itemName, anchor, onClose, onSelect, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false)

  return (
    <AnchoredPopup anchor={anchor} onClose={onClose} ariaLabel={`Actions for ${itemName}`} widthPx={confirming ? 224 : 176}>
      {confirming ? (
        <div className="p-3">
          <p className="mb-3 font-ui text-[12.5px] leading-snug text-[#1A0D40]">Delete "{itemName}" permanently?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-8 flex-1 rounded-xl border-0 bg-[#1A0D40]/[0.06] font-ui text-[12.5px] font-medium text-[#1A0D40]"
            >
              Cancel
            </button>
            <button type="button" onClick={onDelete} className="h-8 flex-1 rounded-xl border-0 bg-red-600 font-ui text-[12.5px] font-medium text-white">
              Delete
            </button>
          </div>
        </div>
      ) : (
        <ul className="m-0 list-none p-1.5">
          <li>
            <button
              type="button"
              onClick={onSelect}
              className="block w-full rounded-xl border-0 bg-transparent px-3 py-2.5 text-left font-ui text-sm font-medium text-[#1A0D40] transition hover:bg-[#1A0D40]/[0.04] active:bg-[#1A0D40]/[0.07]"
            >
              Select
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="block w-full rounded-xl border-0 bg-transparent px-3 py-2.5 text-left font-ui text-sm font-medium text-red-600 transition hover:bg-[#1A0D40]/[0.04] active:bg-[#1A0D40]/[0.07]"
            >
              Delete
            </button>
          </li>
        </ul>
      )}
    </AnchoredPopup>
  )
}
