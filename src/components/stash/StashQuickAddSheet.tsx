import { useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { parseGroceryLine } from '../../lib/parseGroceryLine'
import { STASH_ZONES, inferStashCategory, suggestStorageZone, type StorageZone } from '../../lib/stashCategories'
import type { NewStashItemInput } from '../../lib/stash'

type Props = {
  onClose: () => void
  onAdd: (input: NewStashItemInput) => Promise<void>
}

const fieldClass =
  'h-11 w-full rounded-lg border border-[#E8E8ED] bg-white px-3.5 font-ui text-[14px] text-[#1A0D40] outline-none transition-[border-color] duration-150 placeholder:text-[#9ca3af] focus:border-[#708a7c]'

/** Minimal quick-add sheet — single notepad line + storage zone / Done. */
export default function StashQuickAddSheet({ onClose, onAdd }: Props) {
  const [line, setLine] = useState('')
  const [zone, setZone] = useState<StorageZone | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const previewName = line.trim()
  const effectiveCategory = previewName ? inferStashCategory(previewName) : undefined
  const effectiveZone = zone || (effectiveCategory ? suggestStorageZone(effectiveCategory) : '')

  const submit = async () => {
    const parsed = parseGroceryLine(line)
    if (!parsed) {
      setError('Add an item (e.g. 2 cups milk).')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onAdd({
        name: parsed.name,
        quantity: parsed.qty != null && parsed.qty > 0 ? parsed.qty : 1,
        unit: parsed.unit?.trim() || 'each',
        category: inferStashCategory(parsed.name),
        zone: (zone || undefined) as StorageZone | undefined,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add item.')
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
        className="relative flex max-h-[88dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-[24px] bg-white px-6 pb-6 pt-4 shadow-[0_24px_70px_rgba(26,13,64,0.32)] sm:rounded-[22px]"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-editorial text-[20px] font-semibold leading-tight text-[#1A0D40]">Quick add</h2>
            <p className="mt-1 font-ui text-[12.5px] leading-snug text-[#6E6E73]">Drop something into your stash.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-[#F5F5F7] text-[#6e6e73] transition hover:bg-[#ECE9E3] active:scale-95"
          >
            <X size={15} strokeWidth={2.25} />
          </button>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            className={fieldClass}
            placeholder="Qty Unit Ingredient"
            autoFocus
            value={line}
            onChange={(e) => setLine(e.target.value)}
          />

          <div className="relative mt-0.5 grid h-11 grid-cols-3 items-center rounded-xl bg-[#F2F0F4] p-[3px]">
            <div
              className="absolute bottom-[3px] left-[3px] top-[3px] rounded-[9px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.10)] transition-transform duration-200 ease-out"
              style={{ width: 'calc((100% - 6px) / 3)', transform: `translateX(${Math.max(0, STASH_ZONES.findIndex((z) => z.value === (zone || effectiveZone))) * 100}%)` }}
            />
            {STASH_ZONES.map((z) => {
              const active = (zone || effectiveZone) === z.value
              return (
                <button
                  key={z.value}
                  type="button"
                  onClick={() => setZone(z.value)}
                  className="relative z-[1] h-full border-0 bg-transparent font-ui text-[13px] font-semibold transition-colors"
                  style={{ color: active ? '#111' : 'rgba(17,17,17,0.4)' }}
                >
                  {z.label}
                </button>
              )
            })}
          </div>

          {error ? <p className="font-ui text-[12px] font-medium text-[#c0503a]">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 h-[50px] w-full rounded-2xl border-0 bg-[#1A0D40] font-ui text-[15px] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {busy ? 'Adding…' : 'Add to stash'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}
