import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { attributeColor, attributeIcon, sortAttributesByProminence } from '../../lib/attributeIcons'
import { normalizeFigsAttributes } from '../../lib/stashTaxonomy'

type Props = {
  attributes: string[] | null | undefined
  ingredientName?: string
  maxVisible?: number
  className?: string
}

function AttributePopup({ name, attributes, onClose }: { name: string; attributes: string[]; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-end justify-center bg-[#1A0D40]/28 p-4 backdrop-blur-[3px] sm:items-center"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div className="mx-auto w-full max-w-sm rounded-[24px] bg-white p-5 shadow-[0_24px_70px_rgba(26,13,64,0.32)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-editorial text-[17px] font-semibold text-[#1A0D40]">{name}</h3>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-[#F5F5F7] text-[#1A0D40]"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} strokeWidth={2.25} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {attributes.map((attr) => {
            const Icon = attributeIcon(attr)
            const color = attributeColor(attr)
            return (
              <div key={attr} className="flex items-center gap-2.5">
                <Icon size={15} strokeWidth={2.2} style={{ color }} aria-hidden />
                <span className="font-ui text-[13px] capitalize text-[#1A0D40]">{attr}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Icon-only badges (no circle backdrop) for an item's diet/sourcing attributes, ranked by
 * importance. Tapping any badge opens a popup listing every attribute for this ingredient. */
export function AttributeBadges({ attributes, ingredientName = 'Attributes', maxVisible = 3, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const sorted = sortAttributesByProminence(normalizeFigsAttributes(attributes ?? []))
  if (!sorted.length) return null

  const visible = sorted.slice(0, maxVisible)
  const overflow = sorted.length - visible.length

  return (
    <>
      <button
        type="button"
        className={`inline-flex shrink-0 items-center gap-1 border-0 bg-transparent p-0 ${className}`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {visible.map((attr) => {
          const Icon = attributeIcon(attr)
          const color = attributeColor(attr)
          return <Icon key={attr} size={12} strokeWidth={2.4} style={{ color }} aria-hidden />
        })}
        {overflow > 0 ? (
          <span className="font-ui text-[9.5px] font-bold tabular-nums text-[#9a9aa0]">+{overflow}</span>
        ) : null}
      </button>
      {open ? <AttributePopup name={ingredientName} attributes={sorted} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
