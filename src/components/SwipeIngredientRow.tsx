import { useRef, useState } from 'react'
import { ArrowLeftRight, Check, Info, ListPlus } from 'lucide-react'
import AnchoredPopup, { type PopupAnchor } from './AnchoredPopup'
import { AttributeBadges } from './stash/AttributeBadges'
import { useRowInteractionLock, useRowSwipeOpenLock } from '../context/RowInteractionContext'
import { armLongPress } from '../utils/longPress'
import { formatGroceryDisplay } from '../lib/parseGroceryLine'
import { parseAmount } from '../utils/recipeMath'
import { deriveIngredientAttributes } from '../lib/attributeFormulas'
import type { StashCoverageLevel } from '../lib/stashCoverage'

type Props = {
  name: string
  amount?: string
  unit?: string
  /** @deprecated Prefer coverageLevel — kept for callers that only know boolean match. */
  inStash?: boolean
  coverageLevel?: StashCoverageLevel
  coverageMessage?: string
  /** Shown as a checkmark once this ingredient has been added to a grocery list. */
  added: boolean
  /** Optional label under/near the check (e.g. list name). */
  addedListLabel?: string | null
  notes?: string | null
  /** Recipe-authored swap options count as extra info. */
  alternatives?: string[]
  /** Not in stash, but a suggested swap is in stash — show quick-swap affordance. */
  showSwapAffordance?: boolean
  onOpenSwap?: () => void
  /** Holding down the row opens the swap/info sheet — replaces the old tap-to-open behavior. */
  onLongPress: () => void
  onAddToGroceryList: () => void
  /** When already added, tapping the check can uncheck / remove from list. */
  onUncheck?: () => void
}

const ACTION_WIDTH = 64

/** Swipe left reveals Add to Grocery List — reveal-then-press (the action only runs when the user
 * taps the now-visible button), matching SwipeStashInventoryRow's pattern. */
export default function SwipeIngredientRow({
  name,
  amount,
  unit,
  inStash = false,
  coverageLevel,
  coverageMessage,
  added,
  addedListLabel,
  notes,
  alternatives,
  showSwapAffordance,
  onOpenSwap,
  onLongPress,
  onAddToGroceryList,
  onUncheck,
}: Props) {
  const [dx, setDx] = useState(0)
  const [popped, setPopped] = useState(false)
  const [infoAnchor, setInfoAnchor] = useState<PopupAnchor | null>(null)
  const [stashAnchor, setStashAnchor] = useState<PopupAnchor | null>(null)
  const startX = useRef(0)
  const dragging = useRef(false)
  const popTimeout = useRef<number | null>(null)
  const { armRowInteraction, disarmRowInteraction } = useRowInteractionLock()
  useRowSwipeOpenLock(dx)

  const notesText = (notes ?? '').trim()
  const altList = (alternatives ?? []).map((a) => a.trim()).filter(Boolean)
  const attributes = name.trim() ? deriveIngredientAttributes(name) : []
  // Only recipe-provided extras (notes / alternatives) — not computed attribute tags alone.
  const hasExtraInfo = Boolean(notesText) || altList.length > 0

  const level: StashCoverageLevel =
    coverageLevel ?? (inStash ? 'full' : 'none')
  const stashMsg =
    coverageMessage ??
    (level === 'none' ? 'Not in your stash.' : 'This item is in your stash.')

  const triggerPop = () => {
    setPopped(true)
    if (popTimeout.current != null) window.clearTimeout(popTimeout.current)
    popTimeout.current = window.setTimeout(() => setPopped(false), 170)
  }

  const longPress = useRef(
    armLongPress(() => {
      triggerPop()
      onLongPress()
    }),
  ).current

  const onPointerDown = (e: React.PointerEvent) => {
    armRowInteraction()
    startX.current = e.clientX
    dragging.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
    longPress.onPointerDown(e)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    longPress.onPointerMove(e)
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    setDx(Math.max(-ACTION_WIDTH, Math.min(0, delta)))
  }
  const endDrag = () => {
    longPress.onPointerUp()
    dragging.current = false
    disarmRowInteraction()
    setDx((v) => (v < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0))
  }
  const cancelDrag = () => {
    longPress.onPointerUp()
    dragging.current = false
    disarmRowInteraction()
    setDx(0)
  }

  const n = amount ? parseAmount(amount) : null
  const phrase = formatGroceryDisplay(n, unit ?? '', name)

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        aria-label="Add to grocery list"
        onClick={() => {
          setDx(0)
          onAddToGroceryList()
        }}
        className="absolute inset-y-0 right-0 flex w-16 items-center justify-center border-0 bg-[#1A0D40] text-white"
      >
        <ListPlus size={16} strokeWidth={2.2} />
      </button>

      <div
        className="flex items-center gap-3 border-b border-[#F4F3F6] bg-white py-2.5 last:border-b-0"
        style={{
          transform: `translateX(${dx}px) scale(${popped ? 1.035 : 1})`,
          transition: dragging.current ? 'none' : popped ? 'transform 0.12s cubic-bezier(0.34,1.56,0.64,1)' : 'transform 0.2s ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
      >
        {level === 'none' ? (
          <button
            type="button"
            aria-label="Stash coverage"
            onClick={(e) => {
              e.stopPropagation()
              setStashAnchor({ clientX: e.clientX, clientY: e.clientY })
            }}
            className="h-[9px] w-[9px] shrink-0 rounded-full border border-[#D4D0DD] bg-transparent"
          />
        ) : (
          <button
            type="button"
            aria-label="Stash coverage"
            onClick={(e) => {
              e.stopPropagation()
              setStashAnchor({ clientX: e.clientX, clientY: e.clientY })
            }}
            className={`h-[9px] w-[9px] shrink-0 rounded-full bg-transparent ${
              level === 'full'
                ? 'border border-[#1c1c1e]'
                : 'border border-dashed border-[#1c1c1e]'
            }`}
          />
        )}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 font-ui text-[14.5px]">
          <span className="min-w-0 shrink truncate text-[#1c1c1e]">
            <span className="font-medium text-[#111]">{phrase}</span>
          </span>
          {hasExtraInfo ? (
            <button
              type="button"
              aria-label="Ingredient info"
              onClick={(e) => {
                e.stopPropagation()
                setInfoAnchor({ clientX: e.clientX, clientY: e.clientY })
              }}
              className="flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-[#4C6A57]"
            >
              <Info size={13} strokeWidth={2.2} />
            </button>
          ) : null}
        </span>
        {showSwapAffordance && onOpenSwap ? (
          <button
            type="button"
            aria-label="Swap ingredient"
            onClick={(e) => {
              e.stopPropagation()
              onOpenSwap()
            }}
            className="flex shrink-0 items-center justify-center border-0 bg-transparent p-0 text-[#1A0D40]"
          >
            <ArrowLeftRight size={14} strokeWidth={2.2} />
          </button>
        ) : null}
        {added ? (
          <button
            type="button"
            aria-label={addedListLabel ? `Added to ${addedListLabel}` : 'Added to grocery list'}
            title={addedListLabel ?? 'Added'}
            onClick={(e) => {
              e.stopPropagation()
              onUncheck?.()
            }}
            className="flex shrink-0 items-center justify-center border-0 bg-transparent p-0"
          >
            <Check size={14} strokeWidth={2.6} className="text-[#4C6A57]" />
          </button>
        ) : null}
      </div>

      {infoAnchor && hasExtraInfo ? (
        <AnchoredPopup anchor={infoAnchor} onClose={() => setInfoAnchor(null)} ariaLabel={`${name} info`} widthPx={240}>
          <div className="flex flex-col gap-2 p-3">
            <div className="font-ui text-[12px] font-semibold text-[#1A0D40]">{name}</div>
            {notesText ? (
              <p className="font-ui text-[12.5px] leading-[1.45] text-[#332e3d]">{notesText}</p>
            ) : null}
            {altList.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.04em] text-[#9a9aa0]">
                  Also listed
                </span>
                <p className="font-ui text-[12.5px] leading-[1.45] text-[#332e3d]">{altList.join(', ')}</p>
              </div>
            ) : null}
            {attributes.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.04em] text-[#9a9aa0]">
                  Attributes
                </span>
                <AttributeBadges attributes={attributes} ingredientName={name} />
              </div>
            ) : null}
          </div>
        </AnchoredPopup>
      ) : null}

      {stashAnchor ? (
        <AnchoredPopup anchor={stashAnchor} onClose={() => setStashAnchor(null)} ariaLabel="Stash status" widthPx={220}>
          <div className="p-3">
            <p className="font-ui text-[12.5px] leading-[1.45] text-[#332e3d]">{stashMsg}</p>
          </div>
        </AnchoredPopup>
      ) : null}
    </div>
  )
}
