import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, GripVertical, Pencil, Repeat, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { GroceryRow, SeamlessAddRow } from './GroceryListCard'
import type { GroceryItem } from '../lib/groceryLists'
import { armLongPress } from '../utils/longPress'

type Props = {
  icon: LucideIcon
  /** Recipe-origin sections — shows the recipe's own cover photo as a small square instead of the
   * icon, when available. */
  imageUrl?: string | null
  /** Real (non-recipe) lists — colored-square background behind the icon, mirroring the Home
   * page's grocery list preview cards (just miniaturized). */
  iconColor?: string | null
  label: string
  items: GroceryItem[]
  /** When set, the leading glyph + title navigate (recipe detail or groceries page). */
  onHeaderClick?: () => void
  /** Real (non-derived) lists — trailing pencil opens the list's edit sheet. */
  onEditList?: () => void
  /** When set, shows a trash icon that deletes the entire list (with an inline confirm) — shown
   * for every deletable list, including recipe-linked ones that have no `onEditList`. */
  onDeleteList?: () => void
  /** Recipe-origin sections get midnight + shine on the title; size matches other list headers. */
  recipeTitleStyle?: boolean
  /** Shows the recurring-list badge next to the label (Staples + any user list marked recurring). */
  showRecurringIcon?: boolean
  defaultCollapsed?: boolean
  /** True while the page is in list-reorder mode — forces this section collapsed and shows a drag
   * handle in place of the header's leading glyph. */
  reordering?: boolean
  /** Drag-handle props (from `useDragReorder`) — spread onto the grip glyph shown in reorder mode. */
  dragHandleProps?: Record<string, unknown>
  /** Hold down the header to enter list-reorder mode (only meaningful on reorderable lists). */
  onHeaderLongPress?: () => void
  onToggleItem: (item: GroceryItem) => void
  onEditItem: (item: GroceryItem, patch: { name?: string; qty?: number | null; unit?: string | null }) => void
  onDeleteItem: (item: GroceryItem) => void
  onQuickStash: (item: GroceryItem) => void
  onAddItem: (input: { name: string; qty?: number | null; unit?: string | null }) => Promise<void>
  /** Holding down any item row opens the ingredient swap/info sheet. */
  onLongPressItem?: (item: GroceryItem) => void
  stashItems?: import('../lib/stash').StashItem[]
}

/** One thin, edge-to-edge section with a light subheader + notepad ghost row for seamless adds. */
export default function GrocerySection({
  icon: Icon,
  imageUrl,
  iconColor,
  label,
  items,
  onHeaderClick,
  onEditList,
  onDeleteList,
  recipeTitleStyle,
  showRecurringIcon,
  defaultCollapsed = false,
  reordering = false,
  dragHandleProps,
  onHeaderLongPress,
  onToggleItem,
  onEditItem,
  onDeleteItem,
  onQuickStash,
  onAddItem,
  onLongPressItem,
  stashItems,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [confirmDeleteList, setConfirmDeleteList] = useState(false)
  const isRecipeHeader = Boolean(recipeTitleStyle || imageUrl)
  const effectiveCollapsed = reordering || collapsed

  const listGlyph = imageUrl ? (
    <img src={imageUrl} alt="" className="h-5 w-5 shrink-0 rounded-[6px] object-cover" />
  ) : (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[#6e6e73]"
      style={{ background: iconColor ?? '#F4F1F9' }}
    >
      <Icon size={11} strokeWidth={2} aria-hidden />
    </span>
  )

  const titleEl = (
    <h2
      className={`min-w-0 truncate font-ui text-[12px] font-normal ${
        isRecipeHeader ? 'grocery-recipe-title-glow' : 'text-[#9a9aa0]'
      }`}
    >
      {label}
    </h2>
  )

  const collapseBtn = (
    <button
      type="button"
      aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
      aria-expanded={!collapsed}
      onClick={() => setCollapsed((v) => !v)}
      className="flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-[#9a9aa0]"
    >
      {effectiveCollapsed ? (
        <ChevronDown size={15} strokeWidth={2.2} />
      ) : (
        <ChevronUp size={15} strokeWidth={2.2} />
      )}
    </button>
  )

  const headerInner = (
    <>
      {reordering ? (
        <span
          {...dragHandleProps}
          aria-label={`Reorder ${label}`}
          className="grocery-drag-handle flex h-7 w-7 shrink-0 cursor-grab items-center justify-center touch-none text-[#B8B8BE] active:cursor-grabbing"
        >
          <GripVertical size={15} strokeWidth={2.2} />
        </span>
      ) : (
        listGlyph
      )}
      {titleEl}
      {showRecurringIcon ? <Repeat size={11} strokeWidth={2.2} className="shrink-0 text-[#b8b8be]" aria-label="Recurring" /> : null}
      <span className="font-ui text-[11px] text-[#b8b8be]">{items.length}</span>
      <span className="flex-1" />
    </>
  )

  return (
    <div className="pt-2">
      <div className="flex w-full items-center gap-2 border-b border-[#ECE9E3] pb-2">
        {onHeaderClick && !reordering ? (
          <button
            type="button"
            onClick={onHeaderClick}
            {...(onHeaderLongPress ? armLongPress(() => onHeaderLongPress()) : {})}
            className="flex min-w-0 flex-1 touch-none items-center gap-2 border-0 bg-transparent p-0 text-left"
          >
            {headerInner}
          </button>
        ) : (
          <div
            {...(onHeaderLongPress && !reordering ? armLongPress(() => onHeaderLongPress()) : {})}
            className="flex min-w-0 flex-1 touch-none items-center gap-2"
          >
            {headerInner}
          </div>
        )}
        {!reordering && onDeleteList ? (
          <button
            type="button"
            aria-label={`Delete ${label}`}
            onClick={() => setConfirmDeleteList(true)}
            className="flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-[#c0503a]"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        ) : null}
        {!reordering && onEditList ? (
          <button type="button" aria-label={`Edit ${label}`} onClick={onEditList} className="flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-[#9a9aa0]">
            <Pencil size={13} strokeWidth={2} />
          </button>
        ) : null}
        {!reordering ? collapseBtn : null}
      </div>

      {confirmDeleteList ? (
        <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-[#F3DCD4] bg-[#FBF1EE] px-3 py-2.5">
          <p className="flex-1 font-ui text-[12px] leading-snug text-[#1A0D40]">Delete "{label}" and all its items?</p>
          <button
            type="button"
            onClick={() => setConfirmDeleteList(false)}
            className="rounded-lg border-0 bg-[#1A0D40]/[0.06] px-2.5 py-1.5 font-ui text-[12px] font-semibold text-[#1A0D40]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmDeleteList(false)
              onDeleteList?.()
            }}
            className="rounded-lg border-0 bg-[#c0503a] px-2.5 py-1.5 font-ui text-[12px] font-semibold text-white"
          >
            Delete
          </button>
        </div>
      ) : null}

      {!effectiveCollapsed ? (
        <div className="flex flex-col">
          {items.map((item) => (
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
          <div className="flex w-full items-center gap-3 py-2.5 opacity-45">
            <span
              aria-hidden
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 border-[#D4D0DD] bg-transparent text-transparent"
            >
              <Check size={10} strokeWidth={3} />
            </span>
            <SeamlessAddRow onCommit={onAddItem} bare />
          </div>
        </div>
      ) : null}
    </div>
  )
}
