import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Pencil, X } from 'lucide-react'
import { FIGS_ATTRIBUTES, FIGS_CATEGORIES, FIGS_UTILITY_TAGS } from '../../lib/stashTaxonomy'
import { STASH_ZONES, type StorageZone } from '../../lib/stashCategories'
import { daysUntilExpiry, zoneKey, type NewStashItemInput, type StashItem } from '../../lib/stash'
import { sortAttributesByProminence } from '../../lib/attributeIcons'
import { NutritionFactsPanel } from '../NutritionFactsPanel'
import { AttributeBadges } from './AttributeBadges'

type Props = {
  item: StashItem
  onClose: () => void
  onSave: (patch: Partial<NewStashItemInput>) => Promise<void>
}

const fieldClass =
  'h-10 w-full rounded-lg border border-[#E8E8ED] bg-white px-3 font-ui text-[13.5px] text-[#111] outline-none transition-[border-color] duration-150 focus:border-[#708a7c]'
const labelClass = 'mb-1 block font-ui text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#111]'

function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function formatDateDisplay(value: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ChipMultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[]
  selected: string[]
  onToggle: (opt: string) => void
}) {
  const ordered = sortAttributesByProminence(options as string[])
  return (
    <div className="flex flex-wrap gap-1.5">
      {ordered.map((opt) => {
        const on = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-ui text-[11px] font-semibold capitalize transition-colors"
            style={{ background: on ? '#1A0D40' : '#F5F5F7', color: on ? '#fff' : '#111' }}
          >
            {on ? <Check size={10} strokeWidth={3} /> : null}
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function ChipDisplay({ values }: { values: string[] }) {
  const ordered = sortAttributesByProminence(values)
  if (!ordered.length) return <p className="mt-0.5 font-ui text-sm text-[#111]">—</p>
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {ordered.map((v) => (
        <span key={v} className="rounded-full bg-[#F5F5F7] px-2.5 py-1 font-ui text-[11px] font-semibold capitalize text-[#1A0D40]">
          {v}
        </span>
      ))}
    </div>
  )
}

/** View/edit toggle sheet — compressed field spacing, Additional Information notes, light-themed
 * nutrition panel. Save Changes (edit mode) or Done (view mode) is the single full-width action. */
export default function StashItemDetailsSheet({ item, onClose, onSave }: Props) {
  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState(item.name)
  const [brand, setBrand] = useState(item.brand ?? '')
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unit, setUnit] = useState(item.unit)
  const [unitPrice, setUnitPrice] = useState(item.unit_price != null ? String(item.unit_price) : '')
  const [expiryDate, setExpiryDate] = useState(toDateInputValue(item.expiry_date))
  const [category, setCategory] = useState(item.category)
  const [zone, setZone] = useState<StorageZone>(zoneKey(item))
  const [utilityTags, setUtilityTags] = useState<string[]>(item.utility_tags ?? [])
  const [attributes, setAttributes] = useState<string[]>(item.attributes ?? [])
  const [notes, setNotes] = useState(item.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const days = daysUntilExpiry(item)

  const toggleUtility = (opt: string) =>
    setUtilityTags((prev) => (prev.includes(opt) ? prev.filter((t) => t !== opt) : [...prev, opt]))
  const toggleAttribute = (opt: string) =>
    setAttributes((prev) => (prev.includes(opt) ? prev.filter((t) => t !== opt) : [...prev, opt]))

  const primaryAction = async () => {
    if (!editMode) {
      onClose()
      return
    }
    setBusy(true)
    setSaveError(null)
    try {
      await onSave({
        name: name.trim() || item.name,
        quantity: Number(quantity) || 1,
        unit: unit.trim() || 'each',
        category,
        zone,
        brand: brand.trim() || null,
        unitPrice: unitPrice.trim() ? Number(unitPrice) : null,
        notes: notes.trim() || null,
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined,
        utilityTags,
        attributes,
      })
      setEditMode(false)
      onClose()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save changes. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-[#1A0D40]/28 backdrop-blur-[3px] sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        className="relative flex max-h-[88dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-[24px] bg-white px-5 pb-5 pt-2 shadow-[0_24px_70px_rgba(26,13,64,0.32)] sm:rounded-[22px] sm:pt-5"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2.5 flex h-1 w-full shrink-0 items-center justify-center sm:hidden">
          <div className="h-1.5 w-11 rounded-full bg-[#ECE9E3]" />
        </div>

        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-editorial text-[19px] font-semibold text-[#1A0D40]">Item details</h2>
          <div className="flex items-center gap-1.5">
            {days != null ? (
              <span className="mr-0.5 font-ui text-[11.5px] font-semibold text-[#c0503a]">
                {days > 0 ? `${days}d left` : days === 0 ? 'Today' : 'Expired'}
              </span>
            ) : null}
            <button
              type="button"
              aria-label={editMode ? 'Exit edit mode' : 'Edit item'}
              onClick={() => setEditMode((v) => !v)}
              className="flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-[#111] transition active:scale-95"
            >
              <Pencil size={16} strokeWidth={2.1} />
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-[#111] transition active:scale-95"
            >
              <X size={17} strokeWidth={2.1} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overflow-x-hidden" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {editMode ? (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelClass}>Name</label>
                  <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" />
                </div>
                <div className="w-24 shrink-0">
                  <label className={labelClass}>Brand</label>
                  <input className={fieldClass} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="—" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-16 shrink-0">
                  <label className={labelClass}>Qty</label>
                  <input className={fieldClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Unit</label>
                  <input className={fieldClass} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" />
                </div>
                <div className="w-20 shrink-0">
                  <label className={labelClass}>Price</label>
                  <input className={fieldClass} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} inputMode="decimal" placeholder="$" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={labelClass}>Category</label>
                  <select className={`${fieldClass} capitalize`} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {!FIGS_CATEGORIES.includes(category as (typeof FIGS_CATEGORIES)[number]) ? (
                      <option value={category}>{category}</option>
                    ) : null}
                    {FIGS_CATEGORIES.map((c) => (
                      <option key={c} value={c} className="capitalize">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28 shrink-0">
                  <label className={labelClass}>Expires</label>
                  <input type="date" className={fieldClass} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Storage</label>
                <div className="flex gap-1.5">
                  {STASH_ZONES.map((z) => {
                    const active = zone === z.value
                    return (
                      <button
                        key={z.value}
                        type="button"
                        onClick={() => setZone(z.value)}
                        className="h-8 flex-1 rounded-lg border font-ui text-[11.5px] font-semibold transition-colors"
                        style={{ background: active ? '#1A0D40' : '#fff', color: active ? '#fff' : '#111', borderColor: active ? 'transparent' : '#E8E8ED' }}
                      >
                        {z.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className={labelClass}>Utility</label>
                <ChipMultiSelect options={FIGS_UTILITY_TAGS} selected={utilityTags} onToggle={toggleUtility} />
              </div>
              <div>
                <label className={labelClass}>Attributes</label>
                <ChipMultiSelect options={FIGS_ATTRIBUTES} selected={attributes} onToggle={toggleAttribute} />
              </div>
              <div>
                <label className={labelClass}>Additional information</label>
                <textarea
                  className="min-h-[64px] w-full rounded-lg bg-[#FAFAFA] px-3 py-2 font-ui text-[13px] text-[#1A0D40] outline-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Claims, notes, packing details…"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <p className={labelClass}>Name</p>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 truncate font-editorial text-[16px] font-bold leading-tight text-[#1A0D40]">{item.name}</p>
                    <AttributeBadges attributes={item.attributes} ingredientName={item.name} />
                  </div>
                </div>
                {item.brand?.trim() ? (
                  <div className="w-24 shrink-0">
                    <p className={labelClass}>Brand</p>
                    <p className="truncate font-ui text-[13px] text-[#111]">{item.brand.trim()}</p>
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <div className="w-16 shrink-0">
                  <p className={labelClass}>Qty</p>
                  <p className="font-ui text-[13px] text-[#1A0D40]">{item.quantity}</p>
                </div>
                <div className="flex-1">
                  <p className={labelClass}>Unit</p>
                  <p className="font-ui text-[13px] text-[#1A0D40]">{item.unit || 'each'}</p>
                </div>
                {item.unit_price != null ? (
                  <div className="w-20 shrink-0">
                    <p className={labelClass}>Price</p>
                    <p className="font-ui text-[13px] text-[#1A0D40]">${item.unit_price.toFixed(2)}</p>
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className={labelClass}>Category</p>
                  <p className="font-ui text-[13px] capitalize text-[#1A0D40]">{item.category || '—'}</p>
                </div>
                <div className="w-28 shrink-0">
                  <p className={labelClass}>Expires</p>
                  <p className="font-ui text-[13px] text-[#1A0D40]">{formatDateDisplay(expiryDate)}</p>
                </div>
              </div>
              <div>
                <p className={labelClass}>Storage</p>
                <p className="font-ui text-[13px] text-[#1A0D40]">{STASH_ZONES.find((z) => z.value === zone)?.label}</p>
              </div>
              {item.utility_tags?.length ? (
                <div>
                  <p className={labelClass}>Utility</p>
                  <ChipDisplay values={item.utility_tags} />
                </div>
              ) : null}
              {item.notes?.trim() ? (
                <div>
                  <p className={labelClass}>Additional information</p>
                  <p className="mt-0.5 rounded-lg bg-[#FAFAFA] px-3 py-2 font-ui text-[12.5px] leading-relaxed text-[#1A0D40]">
                    {item.notes.trim()}
                  </p>
                </div>
              ) : null}
            </>
          )}

          <div>
            <p className={labelClass}>Nutrition</p>
            <div className="mt-1">
              <NutritionFactsPanel
                totals={{
                  calories: item.calories,
                  fat_g: item.fat_g,
                  saturated_fat_g: item.saturated_fat_g,
                  cholesterol_mg: item.cholesterol_mg,
                  sodium_mg: item.sodium_mg,
                  carbs_g: item.carbs_g,
                  fiber_g: item.fiber_g,
                  sugar_g: item.sugar_g,
                  protein_g: item.protein_g,
                  calcium_mg: item.calcium_mg,
                  iron_mg: item.iron_mg,
                  potassium_mg: item.potassium_mg,
                }}
              />
            </div>
          </div>

          {saveError ? <p className="font-ui text-[12.5px] font-medium text-[#c0503a]">{saveError}</p> : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void primaryAction()}
            className="mt-1 h-[62px] w-full rounded-full bg-[#1A0D40] font-ui text-[16px] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {busy ? 'Saving…' : editMode ? 'Save changes' : 'Done'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
