import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Inbox, Info, Pencil, Check, Repeat, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useRowInteractionLock, useRowSwipeOpenLock } from '../context/RowInteractionContext'
import GrocerySortPopover from './GrocerySortPopover'
import UnitDropdown from './UnitDropdown'
import { groceryIconFor } from '../lib/groceryIcons'
import type { GroceryItem, GroceryList } from '../lib/groceryLists'
import { parseGroceryLine, formatGroceryDisplay } from '../lib/parseGroceryLine'
import { defaultGrocerySortState, groupByCategory, groupByOrigin, isGroupedMode, sortFlat, type GrocerySortState } from '../lib/grocerySort'
import AnchoredPopup, { type PopupAnchor } from './AnchoredPopup'
import { armLongPress } from '../utils/longPress'
import { evaluateStashCoverage } from '../lib/stashCoverage'
import type { StashItem } from '../lib/stash'

type Props = {
  list: GroceryList
  rawItems: GroceryItem[]
  progress: { checked: number; total: number }
  defaultOpen?: boolean
  onToggleItem: (item: GroceryItem) => void
  onEditItem: (item: GroceryItem, patch: { name?: string; qty?: number | null; unit?: string | null }) => void
  onAddItem: (input: { name: string; qty?: number | null; unit?: string | null }) => Promise<void>
  onAddCompletedToStash: () => void
  onOpenEdit: () => void
  onOpenRecipe?: (recipeId: string) => void
  onDeleteItem?: (item: GroceryItem) => void
  onQuickStash?: (item: GroceryItem) => void
  /** Dedicated Grocery Lists page styling — hides the progress bar/"X of Y checked" line and
   * shows an Edit button (opens the list's edit sheet) in place of the per-card Sort button. */
  hideProgress?: boolean
  onOpenEditInsteadOfSort?: () => void
  /** Overrides `list.is_recurring` for the recurring-icon badge only (display concern, not the
   * underlying record) — used for the two pinned lists, where "Staples" hides the icon despite
   * being internally recurring, and "Added by you" always shows it despite not being. */
  recurringIconOverride?: boolean
  /** Overrides the displayed title for the two pinned slots ("Staples"/"Added by you") — the
   * underlying list's own `name` can be anything (legacy data, a differently-named first recurring
   * list, etc.); the pinned slots always read by their fixed role, not the literal DB value. */
  nameOverride?: string
  /** Holding down any item row opens the ingredient swap/info sheet. */
  onLongPressItem?: (item: GroceryItem) => void
  stashItems?: StashItem[]
}

const ACTION_WIDTH = 64
const TAP_TOLERANCE = 6

export function GroceryRow({
  item,
  editing,
  onStartEdit,
  onStopEdit,
  onChange,
  onToggleItem,
  onDeleteItem,
  onQuickStash,
  onLongPress,
  stashItems,
}: {
  item: GroceryItem
  editing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onChange: (patch: { name?: string; qty?: number | null; unit?: string | null }) => void
  onToggleItem: (item: GroceryItem) => void
  onDeleteItem?: (item: GroceryItem) => void
  onQuickStash?: (item: GroceryItem) => void
  /** Holding down the row opens the ingredient swap/info sheet, for any item regardless of origin. */
  onLongPress?: (item: GroceryItem) => void
  stashItems?: StashItem[]
}) {
  const [dx, setDx] = useState(0)
  const [popped, setPopped] = useState(false)
  const [infoAnchor, setInfoAnchor] = useState<PopupAnchor | null>(null)
  const [stashAnchor, setStashAnchor] = useState<PopupAnchor | null>(null)
  const startX = useRef(0)
  const dragging = useRef(false)
  const lastDragDistance = useRef(0)
  const popTimeout = useRef<number | null>(null)
  const canSwipe = !!(onDeleteItem || onQuickStash)
  const { armRowInteraction, disarmRowInteraction } = useRowInteractionLock()
  useRowSwipeOpenLock(canSwipe ? dx : 0)

  const coverage =
    stashItems && stashItems.length
      ? evaluateStashCoverage(
          {
            name: item.name,
            amount: item.qty != null ? String(item.qty) : null,
            unit: item.unit,
          },
          stashItems,
        )
      : null

  /** Brief scale "pop" the instant a long-press registers, so the user gets visible confirmation
   * the hold worked before the swap sheet finishes opening. */
  const triggerPop = () => {
    setPopped(true)
    if (popTimeout.current != null) window.clearTimeout(popTimeout.current)
    popTimeout.current = window.setTimeout(() => setPopped(false), 170)
  }

  const longPress = useRef(
    armLongPress(() => {
      triggerPop()
      onLongPress?.(item)
    }),
  ).current

  const onPointerDown = (e: React.PointerEvent) => {
    longPress.onPointerDown(e)
    if (!canSwipe) return
    armRowInteraction()
    startX.current = e.clientX
    dragging.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    longPress.onPointerMove(e)
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    setDx(Math.max(-ACTION_WIDTH, Math.min(ACTION_WIDTH, delta)))
  }
  const endDrag = () => {
    longPress.onPointerUp()
    dragging.current = false
    disarmRowInteraction()
    setDx((d) => {
      lastDragDistance.current = d
      if (d > ACTION_WIDTH * 0.5) return ACTION_WIDTH
      if (d < -ACTION_WIDTH * 0.5) return -ACTION_WIDTH
      return 0
    })
  }
  const cancelDrag = () => {
    longPress.onPointerCancel()
    endDrag()
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2">
        <input
          defaultValue={String(item.qty ?? '')}
          onBlur={(e) => {
            const raw = e.target.value.trim()
            if (!raw) {
              onChange({ qty: null })
              return
            }
            const n = Number(raw)
            onChange({ qty: Number.isFinite(n) ? n : null })
          }}
          inputMode="decimal"
          className="w-14 shrink-0 rounded-lg border border-[#E8E8ED] bg-white px-2 py-1.5 font-ui text-[13.5px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
        />
        <UnitDropdown
          value={item.unit ?? ''}
          onChange={(v) => onChange({ unit: v || null })}
          className="w-20 shrink-0 rounded-lg border border-[#E8E8ED] bg-white px-2 py-1.5 font-ui text-[13.5px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
        />
        <input
          autoFocus
          defaultValue={item.name}
          onBlur={(e) => onChange({ name: e.target.value.trim() || item.name })}
          className="min-w-0 flex-1 rounded-lg border border-[#E8E8ED] bg-white px-2.5 py-1.5 font-ui text-[13.5px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
        />
        <button
          type="button"
          onClick={onStopEdit}
          aria-label="Done editing"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-[#1A0D40] text-white"
        >
          <Check size={13} strokeWidth={3} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative mx-[-16px] overflow-hidden" data-figs-row-swipe={canSwipe ? '' : undefined}>
      {onQuickStash ? (
        <button
          type="button"
          aria-label="Add to stash"
          onClick={() => {
            setDx(0)
            onQuickStash(item)
          }}
          className="absolute inset-y-0 left-0 flex w-16 items-center justify-center border-0 bg-[#4C6A57] text-white"
        >
          <Inbox size={16} strokeWidth={2.2} />
        </button>
      ) : null}
      {onDeleteItem ? (
        <button
          type="button"
          aria-label="Delete"
          onClick={() => {
            setDx(0)
            onDeleteItem(item)
          }}
          className="absolute inset-y-0 right-0 flex w-16 items-center justify-center border-0 bg-[#c0503a] text-white"
        >
          <Trash2 size={16} strokeWidth={2.2} />
        </button>
      ) : null}

      <div
        className="flex items-center gap-3 bg-white px-4 py-2.5"
        style={{
          transform: `${canSwipe ? `translateX(${dx}px) ` : ''}scale(${popped ? 1.03 : 1})`,
          transition: dragging.current ? 'none' : popped ? 'transform 0.12s cubic-bezier(0.34,1.56,0.64,1)' : 'transform 0.2s ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={cancelDrag}
      >
        <button
          type="button"
          onClick={() => onToggleItem(item)}
          aria-label={item.is_checked ? 'Mark not bought' : 'Mark bought'}
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors"
          style={{
            borderColor: item.is_checked ? '#4C6A57' : '#D4D0DD',
            background: item.is_checked ? '#4C6A57' : 'transparent',
            color: item.is_checked ? '#fff' : 'transparent',
          }}
        >
          <Check size={10} strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (Math.abs(lastDragDistance.current) <= TAP_TOLERANCE) onStartEdit()
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent p-0 text-left"
        >
          <span
            className="min-w-0 truncate font-ui text-[14.5px] font-medium"
            style={{ color: item.is_checked ? '#B4B4BA' : '#000000', textDecoration: item.is_checked ? 'line-through' : 'none' }}
          >
            {formatGroceryDisplay(item.qty, item.unit, item.name)}
          </span>
          {item.notes ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Item notes"
              onClick={(e) => {
                e.stopPropagation()
                setInfoAnchor({ clientX: e.clientX, clientY: e.clientY })
              }}
              className="flex h-5 w-5 shrink-0 items-center justify-center border-0 bg-transparent text-[#9a9aa0]"
            >
              <Info size={13} strokeWidth={2.2} />
            </span>
          ) : null}
        </button>
        {coverage && coverage.level !== 'none' ? (
          <button
            type="button"
            aria-label="Stash coverage"
            onClick={(e) => {
              e.stopPropagation()
              setStashAnchor({ clientX: e.clientX, clientY: e.clientY })
            }}
            className={`h-[9px] w-[9px] shrink-0 rounded-full bg-transparent ${
              coverage.level === 'full'
                ? 'border border-[#1c1c1e]'
                : 'border border-dashed border-[#1c1c1e]'
            }`}
          />
        ) : null}
      </div>

      {infoAnchor && item.notes ? (
        <AnchoredPopup anchor={infoAnchor} onClose={() => setInfoAnchor(null)} ariaLabel={`${item.name} notes`} widthPx={220}>
          <div className="p-3">
            <div className="mb-1 font-ui text-[12px] font-semibold text-[#1A0D40]">{item.name}</div>
            <p className="font-ui text-[12.5px] leading-[1.45] text-[#332e3d]">{item.notes}</p>
          </div>
        </AnchoredPopup>
      ) : null}
      {stashAnchor && coverage ? (
        <AnchoredPopup anchor={stashAnchor} onClose={() => setStashAnchor(null)} ariaLabel="Stash status" widthPx={220}>
          <div className="p-3">
            <p className="font-ui text-[12.5px] leading-[1.45] text-[#332e3d]">{coverage.message}</p>
          </div>
        </AnchoredPopup>
      ) : null}
    </div>
  )
}

export function SeamlessAddRow({
  onCommit,
  autoFocus = false,
  bare = false,
}: {
  onCommit: (input: { name: string; qty?: number | null; unit?: string | null }) => Promise<void>
  autoFocus?: boolean
  /** When true, render only the input (parent supplies surrounding chrome e.g. checkbox). */
  bare?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [line, setLine] = useState('')
  const committing = useRef(false)

  const submit = async () => {
    const parsed = parseGroceryLine(line)
    if (!parsed || committing.current) return
    committing.current = true
    setLine('')
    try {
      await onCommit({ name: parsed.name, qty: parsed.qty, unit: parsed.unit })
    } finally {
      committing.current = false
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void submit()
  }

  const input = (
    <input
      ref={inputRef}
      autoFocus={autoFocus}
      placeholder="Qty Unit Ingredient"
      value={line}
      onChange={(e) => setLine(e.target.value)}
      onKeyDown={onEnter}
      className="min-w-0 w-full flex-1 border-0 bg-transparent py-0.5 font-ui text-[13.5px] text-[#1A0D40] outline-none placeholder:text-[#9a9aa0]"
    />
  )

  if (bare) return input

  return <div className="flex w-full items-center gap-2 py-1 opacity-45">{input}</div>
}

export default function GroceryListCard({
  list,
  rawItems,
  progress,
  defaultOpen = false,
  onToggleItem,
  onEditItem,
  onAddItem,
  onAddCompletedToStash,
  onOpenEdit,
  onOpenRecipe,
  onDeleteItem,
  onQuickStash,
  hideProgress = false,
  onOpenEditInsteadOfSort,
  recurringIconOverride,
  nameOverride,
  onLongPressItem,
  stashItems,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortState, setSortState] = useState<GrocerySortState>(defaultGrocerySortState())
  const [editingId, setEditingId] = useState<string | null>(null)

  const pct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0
  const Icon = groceryIconFor(list.icon_key)
  const grouped = isGroupedMode(sortState.mode)
  const groups = grouped
    ? sortState.mode === 'addedFrom'
      ? groupByOrigin(rawItems)
      : groupByCategory(rawItems)
    : null
  const flat = grouped ? null : sortFlat(rawItems, sortState.mode, sortState.direction)

  return (
    <div className="home-card" style={{ padding: 0 }}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenEdit()
          }}
          aria-label="Edit list"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-[11px] text-[#1A0D40]"
          style={{ background: list.image_url ? undefined : list.icon_color ?? '#F4F1F9' }}
        >
          {list.image_url ? <img src={list.image_url} alt="" className="h-full w-full object-cover" /> : <Icon size={19} strokeWidth={2} />}
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent p-0 text-left">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate font-ui text-[15px] font-semibold text-[#111]">{nameOverride ?? list.name}</span>
              {(recurringIconOverride ?? list.is_recurring) ? (
                <Repeat size={12} strokeWidth={2.2} className="shrink-0 text-[#9a9aa0]" aria-label="Recurring" />
              ) : null}
            </div>
            {hideProgress ? (
              <div className="font-ui text-[11.5px] text-[#9a9aa0]">{progress.total} item{progress.total === 1 ? '' : 's'}</div>
            ) : (
              <div className="font-ui text-[11.5px] text-[#9a9aa0]">
                {progress.checked} of {progress.total} checked
              </div>
            )}
          </div>
        </button>
        <div className="relative flex shrink-0 items-center gap-1.5">
          {open && onOpenEditInsteadOfSort ? (
            <button type="button" aria-label="Edit list" onClick={onOpenEditInsteadOfSort} className="flex h-8 w-8 items-center justify-center border-0 bg-transparent text-[#111]">
              <Pencil size={15} strokeWidth={2} />
            </button>
          ) : open && !hideProgress ? (
            <button type="button" aria-label="Sort" onClick={() => setSortOpen((v) => !v)} className="flex h-8 w-8 items-center justify-center border-0 bg-transparent text-[#111]">
              <SlidersHorizontal size={15} strokeWidth={2} />
            </button>
          ) : null}
          <button type="button" onClick={() => setOpen((v) => !v)} className="border-0 bg-transparent p-0" aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? (
              <ChevronUp size={20} strokeWidth={2.2} className="shrink-0 text-[#b0b0b6]" />
            ) : (
              <ChevronDown size={20} strokeWidth={2.2} className="shrink-0 text-[#b0b0b6]" />
            )}
          </button>
          <GrocerySortPopover open={sortOpen} onClose={() => setSortOpen(false)} state={sortState} onChange={setSortState} />
        </div>
      </div>

      {open ? (
        <div>
          {progress.total > 0 && !hideProgress ? (
            <div className="mx-4 mb-3 h-[6px] overflow-hidden rounded-full bg-[#F0EDE7]">
              <div className="h-full rounded-full bg-[#4C6A57] transition-all" style={{ width: `${pct}%` }} />
            </div>
          ) : null}

          <div className="px-4 pb-1">
            {rawItems.length === 0 ? (
              <p className="py-2 font-ui text-[13px] text-[#9a9aa0]">Nothing on this list yet.</p>
            ) : groups ? (
              groups.map((group) => (
                <div key={group.label}>
                  {group.recipeId ? (
                    <button
                      type="button"
                      onClick={() => onOpenRecipe?.(group.recipeId!)}
                      className="flex w-full items-center gap-1 border-0 bg-transparent px-0.5 pb-1 pt-2 text-left"
                    >
                      <span className="font-ui text-[10px] font-bold uppercase tracking-[0.06em] text-[#a0a0a6]">{group.label}</span>
                      <ChevronRight size={12} strokeWidth={2.5} className="shrink-0 text-[#a0a0a6]" />
                    </button>
                  ) : (
                    <div className="px-0.5 pb-1 pt-2 font-ui text-[10px] font-bold uppercase tracking-[0.06em] text-[#a0a0a6]">{group.label}</div>
                  )}
                  {group.items.map((item) => (
                    <GroceryRow
                      key={item.id}
                      item={item}
                      editing={editingId === item.id}
                      onStartEdit={() => setEditingId(item.id)}
                      onStopEdit={() => setEditingId(null)}
                      onChange={(patch) => onEditItem(item, patch)}
                      onToggleItem={onToggleItem}
                      onDeleteItem={onDeleteItem}
                      onQuickStash={onQuickStash}
                      onLongPress={onLongPressItem}
                      stashItems={stashItems}
                    />
                  ))}
                </div>
              ))
            ) : (
              flat!.map((item) => (
                <GroceryRow
                  key={item.id}
                  item={item}
                  editing={editingId === item.id}
                  onStartEdit={() => setEditingId(item.id)}
                  onStopEdit={() => setEditingId(null)}
                  onChange={(patch) => onEditItem(item, patch)}
                  onToggleItem={onToggleItem}
                  onDeleteItem={onDeleteItem}
                  onQuickStash={onQuickStash}
                  onLongPress={onLongPressItem}
                  stashItems={stashItems}
                />
              ))
            )}
          </div>

          <div className="flex flex-col gap-2 px-4 pb-4 pt-1.5">
            <SeamlessAddRow onCommit={onAddItem} />
            {progress.checked > 0 ? (
              <button
                type="button"
                onClick={onAddCompletedToStash}
                className="flex h-10 items-center justify-center gap-2 rounded-[12px] border-0 bg-[#4C6A57] font-ui text-[13px] font-semibold text-white transition-colors"
              >
                Add completed to stash
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
