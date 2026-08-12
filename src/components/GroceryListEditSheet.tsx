import { useState } from 'react'
import { Check, Pencil, Repeat, Trash2 } from 'lucide-react'
import { GROCERY_ICON_COLORS, GROCERY_ICON_REGISTRY, groceryIconFor } from '../lib/groceryIcons'
import type { GroceryList } from '../lib/groceryLists'

type Props = {
  list: GroceryList
  onClose: () => void
  onRename: (name: string) => void | Promise<void>
  onChangeAppearance: (patch: {
    iconKey?: string | null
    iconColor?: string | null
    imageUrl?: string | null
  }) => void | Promise<void>
  onToggleRecurring?: () => void
  onDelete?: () => void
  /** True while creating a brand-new list — swaps the title/CTA copy to "Create Grocery List" and
   * routes the confirm action through `onCreate` instead of persisting via onRename/onChangeAppearance,
   * so nothing is written to the DB until the user actually confirms. */
  createMode?: boolean
  onCreate?: (input: {
    name: string
    iconKey: string | null
    iconColor: string | null
    recurring: boolean
  }) => void | Promise<void>
}

export default function GroceryListEditSheet({ list, onClose, onRename, onChangeAppearance, onToggleRecurring, onDelete, createMode = false, onCreate }: Props) {
  const [name, setName] = useState(list.name)
  const [iconKey, setIconKey] = useState(list.icon_key ?? 'shopping-cart')
  const [iconColor, setIconColor] = useState(list.icon_color ?? GROCERY_ICON_COLORS[0])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [createRecurring, setCreateRecurring] = useState(Boolean(list.is_recurring))
  const [saving, setSaving] = useState(false)

  const Icon = groceryIconFor(iconKey)
  const recurringActive = createMode ? createRecurring : Boolean(list.is_recurring)
  const canToggleRecurring = createMode || Boolean(onToggleRecurring)

  const commitAndClose = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (createMode) {
        await onCreate?.({ name: name.trim() || list.name, iconKey, iconColor, recurring: createRecurring })
        onClose()
        return
      }
      if (name.trim() && name.trim() !== list.name) await onRename(name.trim())
      await onChangeAppearance({ iconKey, iconColor, imageUrl: null })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[240] flex touch-none items-end justify-center bg-[#1A0D40]/28 backdrop-blur-[3px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[88dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] bg-white px-6 pb-6 pt-5 shadow-[0_24px_70px_rgba(26,13,64,0.32)] sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-editorial text-[19px] font-semibold text-[#1A0D40]">{createMode ? 'Create Grocery List' : 'Edit Grocery List'}</h2>
          <div className="flex items-center gap-2.5">
            {onDelete ? (
              <button
                type="button"
                aria-label="Delete list"
                onClick={() => setConfirmDelete(true)}
                className="flex h-7 w-7 items-center justify-center border-0 bg-transparent text-[#c0503a] transition active:scale-95"
              >
                <Trash2 size={16} strokeWidth={2.1} />
              </button>
            ) : null}
            {canToggleRecurring ? (
              <button
                type="button"
                aria-label={recurringActive ? 'Remove from recurring' : 'Mark as recurring'}
                onClick={() => {
                  if (createMode) setCreateRecurring((v) => !v)
                  else onToggleRecurring?.()
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full border-0 transition active:scale-95"
                style={{ background: recurringActive ? '#1A0D40' : '#F0EDE7', color: recurringActive ? '#fff' : '#9a9aa0' }}
              >
                <Repeat size={15} strokeWidth={2.3} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void commitAndClose()}
              disabled={saving}
              className="rounded-full bg-[#1A0D40] px-4 py-1.5 font-ui text-[13px] font-semibold text-white transition active:scale-95 disabled:opacity-70"
            >
              {saving ? 'Saving…' : createMode ? 'Create' : 'Done'}
            </button>
          </div>
        </div>

        {confirmDelete ? (
          <div className="mb-4 rounded-2xl border border-[#F3DCD4] bg-[#FBF1EE] p-3.5">
            <p className="mb-3 font-ui text-[12.5px] leading-snug text-[#1A0D40]">Delete "{list.name}" and all its items? This can't be undone.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="h-9 flex-1 rounded-xl border-0 bg-[#1A0D40]/[0.06] font-ui text-[12.5px] font-semibold text-[#1A0D40]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onDelete?.()}
                className="h-9 flex-1 rounded-xl border-0 bg-[#c0503a] font-ui text-[12.5px] font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}

        <div className={confirmDelete ? 'hidden' : 'flex touch-pan-y flex-col overflow-y-auto overscroll-contain pt-1.5'}>
          <div className="mb-5 flex items-center gap-3.5">
            <div className="relative mr-1 mt-1 shrink-0">
              <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-[#1A0D40]" style={{ background: iconColor }}>
                <Icon size={28} strokeWidth={1.8} />
              </span>
              <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#1A0D40] text-white shadow-sm">
                <Pencil size={11} strokeWidth={2.4} />
              </span>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="List name"
              className="min-w-0 flex-1 rounded-lg border border-[#E8E8ED] bg-white px-3 py-2 font-ui text-[15px] font-semibold text-[#111] outline-none focus:border-[#708a7c]"
            />
          </div>

          <p className="mb-2 font-ui text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9a9aa0]">Background color</p>
          <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-[#ECE9E3] bg-[#FAFAFA] p-3">
            {GROCERY_ICON_COLORS.map((c) => {
              const active = iconColor === c
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setIconColor(c)}
                  aria-label={`Color ${c}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2"
                  style={{ background: c, borderColor: active ? '#1A0D40' : 'transparent' }}
                >
                  {active ? <Check size={14} strokeWidth={3} className="text-[#1A0D40]" /> : null}
                </button>
              )
            })}
          </div>

          <p className="mb-2 font-ui text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9a9aa0]">Icon</p>
          <div className="grid max-h-[280px] touch-pan-y grid-cols-5 gap-3 overflow-y-auto overscroll-contain pb-1">
            {GROCERY_ICON_REGISTRY.map(({ key, Icon: OptIcon }) => {
              const active = iconKey === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIconKey(key)}
                  aria-label={key}
                  className="flex aspect-square items-center justify-center rounded-2xl border-2 transition"
                  style={{ background: active ? iconColor : '#F5F5F7', borderColor: active ? '#1A0D40' : 'transparent' }}
                >
                  <OptIcon size={20} strokeWidth={1.8} className="text-[#1A0D40]" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
