import { useRef, useState } from 'react'
import { ArchiveX, Check, Flame, GripVertical, Info } from 'lucide-react'
import { useRowInteractionLock, useRowSwipeOpenLock } from '../../context/RowInteractionContext'
import { daysUntilExpiry, isExpired, urgencyColorForDays, type StashItem } from '../../lib/stash'
import { NutritionPerServingGrid } from '../NutritionPerServingGrid'
import AnchoredPopup, { type PopupAnchor } from '../AnchoredPopup'
import EatenAmountPopup from './EatenAmountPopup'
import { AttributeBadges } from './AttributeBadges'

type Props = {
  item: StashItem
  onOpen: () => void
  onEatenAll: () => void
  onReduceQuantity: (newQuantity: number) => void
  onWasted: () => void
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onLongPress?: (anchor: { clientX: number; clientY: number }) => void
  /** Select-mode only, Storage grouping only — dragging this handle across zone sections moves
   * the item between Fridge/Freezer/Pantry. Presence of this prop is what shows the handle. */
  onDragHandlePointerDown?: (e: React.PointerEvent) => void
}

const TAP_TOLERANCE = 6
const EATEN_WASTE_WIDTH = 112
const WASTE_ONLY_WIDTH = 56
const LONG_PRESS_MS = 500



/** Swipe reveals a narrow fixed-width Eaten/Waste panel (figs_1.0 style — two 56px action
 * buttons, not a panel that tracks the drag all the way across the row), bled to the true
 * screen edge (negative margin cancels the zone list's px-4) rather than stopping at the
 * row's own inset text. The reveal panel is scoped to its own row+buttons sub-container so it
 * never stretches down over the expanded nutrition preview beneath it. Tap expands a nutrition
 * preview; tapping the preview opens full details. Eaten opens an amount popup instead of
 * instantly marking the item consumed. */
export default function SwipeStashInventoryRow({
  item,
  onOpen,
  onEatenAll,
  onReduceQuantity,
  onWasted,
  selectMode = false,
  selected = false,
  onToggleSelect,
  onLongPress,
  onDragHandlePointerDown,
}: Props) {
  const [dx, setDx] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [eatenPopupOpen, setEatenPopupOpen] = useState(false)
  const [infoAnchor, setInfoAnchor] = useState<PopupAnchor | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const dragging = useRef(false)
  const longPressTimer = useRef<number | null>(null)
  const { armRowInteraction, disarmRowInteraction } = useRowInteractionLock()
  useRowSwipeOpenLock(selectMode ? 0 : dx)
  const days = daysUntilExpiry(item)
  const expired = isExpired(item)
  const revealWidth = expired ? WASTE_ONLY_WIDTH : EATEN_WASTE_WIDTH
  const urgencyColor = urgencyColorForDays(days)

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (selectMode) return
    armRowInteraction()
    startX.current = e.clientX
    dragging.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
    clearLongPress()
    const clientX = e.clientX
    const clientY = e.clientY
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null
      onLongPress?.({ clientX, clientY })
    }, LONG_PRESS_MS)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    if (Math.abs(delta) > 12) clearLongPress()
    setDx(Math.max(-revealWidth, Math.min(0, delta)))
  }
  const endDrag = () => {
    dragging.current = false
    clearLongPress()
    disarmRowInteraction()
    setDx((d) => {
      if (d < -revealWidth * 0.4) {
        setExpanded(false)
        return -revealWidth
      }
      return 0
    })
  }



  return (
    <div ref={rowRef} className="relative mx-[-16px] overflow-hidden" data-figs-row-swipe="">
      <div className="relative">
        {!selectMode ? (
          <div className="absolute inset-y-0 right-0 flex" style={{ width: revealWidth }}>
            {expired ? null : (
              <button
                type="button"
                onClick={() => {
                  setDx(0)
                  setEatenPopupOpen(true)
                }}
                className="flex flex-1 flex-col items-center justify-center gap-1 border-0 bg-[#4C6A57] text-white"
              >
                <Flame size={16} strokeWidth={2.2} />
                <span className="font-ui text-[10px] font-semibold">Eaten</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDx(0)
                onWasted()
              }}
              className="flex flex-1 flex-col items-center justify-center gap-1 border-0 bg-[#c0503a] text-white"
            >
              <ArchiveX size={16} strokeWidth={2.2} />
              <span className="font-ui text-[10px] font-semibold">Waste</span>
            </button>
          </div>
        ) : null}

        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={selectMode ? `Select ${item.name}` : `${item.name} — tap for nutrition preview`}
          className="flex w-full min-w-0 items-center gap-3 px-4 py-2.5"
          style={{
            transform: selectMode ? undefined : `translateX(${dx}px)`,
            transition: dragging.current ? 'none' : 'transform 0.2s ease',
            background: selectMode ? (selected ? '#F5F4F2' : '#fff') : expired ? '#FAF0EE' : '#fff',
          }}

          onPointerDown={selectMode ? undefined : onPointerDown}
          onPointerMove={selectMode ? undefined : onPointerMove}
          onPointerUp={selectMode ? undefined : endDrag}
          onPointerCancel={selectMode ? undefined : endDrag}
          onClick={() => {
            if (selectMode) {
              onToggleSelect?.()
              return
            }
            if (Math.abs(dx) <= TAP_TOLERANCE) setExpanded((v) => !v)
          }}
        >
          {selectMode ? (
            <span
              className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors"
              style={{
                borderColor: selected ? '#1A0D40' : '#D4D0DD',
                background: selected ? '#1A0D40' : 'transparent',
                color: selected ? '#fff' : 'transparent',
              }}
            >
              <Check size={10} strokeWidth={3} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className="min-w-0 truncate font-ui text-[14px] font-semibold text-[#1A0D40]"
                style={expired ? { textDecoration: 'line-through', textDecorationColor: '#c0a0a0' } : undefined}
              >
                {item.name}
              </span>
              <AttributeBadges attributes={item.attributes} ingredientName={item.name} />
              {item.notes ? (
                <button
                  type="button"
                  aria-label="Item notes"
                  onClick={(e) => {
                    e.stopPropagation()
                    setInfoAnchor({ clientX: e.clientX, clientY: e.clientY })
                  }}
                  className="flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-[#9a9aa0]"
                >
                  <Info size={13} strokeWidth={2.2} />
                </button>
              ) : null}
            </div>
            <div className="mt-0.5 whitespace-nowrap font-ui text-[11.5px] text-[#9a9aa0]">
              {item.quantity} {item.unit}
              {item.is_enriching ? <span className="ml-2 font-normal text-[#9a9aa0]/70">• analyzing details…</span> : null}
            </div>
          </div>
          {expired ? (
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="rounded-[5px] bg-[#c0503a] px-1.5 py-0.5 font-ui text-[9.5px] font-bold uppercase tracking-wide text-white">
                Expired
              </span>
              <span className="font-ui text-[10.5px] font-semibold text-[#c0503a]">
                {days == null ? '—' : `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`}
              </span>
            </div>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 font-ui text-[11.5px] font-semibold" style={{ color: urgencyColor }}>
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: urgencyColor }} />
              {days == null ? 'Stable' : days <= 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
            </span>
          )}
          {selectMode && onDragHandlePointerDown ? (
            <button
              type="button"
              aria-label={`Drag ${item.name} to a different zone`}
              onPointerDown={(e) => {
                e.stopPropagation()
                onDragHandlePointerDown(e)
              }}
              className="flex h-8 w-6 shrink-0 touch-none items-center justify-center border-0 bg-transparent text-[#9a9aa0]"
            >
              <GripVertical size={16} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
      </div>

      {expanded && !selectMode ? (
        <div className="px-4 pb-2">
          <NutritionPerServingGrid
            calories={item.calories}
            protein={item.protein_g}
            carbs={item.carbs_g}
            fat={item.fat_g}
            headerLabel="Nutrition"
            toggleLabel={`Per ${item.unit || 'each'}`}
            onTap={onOpen}
          />
        </div>
      ) : null}

      {eatenPopupOpen ? (
        <EatenAmountPopup
          item={item}
          onClose={() => setEatenPopupOpen(false)}
          onReduceQuantity={onReduceQuantity}
          onEatenAll={onEatenAll}
        />
      ) : null}

      {infoAnchor && item.notes ? (
        <AnchoredPopup anchor={infoAnchor} onClose={() => setInfoAnchor(null)} ariaLabel={`${item.name} notes`} widthPx={220}>
          <div className="p-3">
            <div className="mb-1 font-ui text-[12px] font-semibold text-[#1A0D40]">{item.name}</div>
            <p className="font-ui text-[12.5px] leading-[1.45] text-[#332e3d]">{item.notes}</p>
          </div>
        </AnchoredPopup>
      ) : null}
    </div>
  )
}
