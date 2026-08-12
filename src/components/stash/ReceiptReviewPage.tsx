import { Fragment, useMemo, useRef, useState } from 'react'
import { Camera, Check, ChevronLeft, Trash2, X } from 'lucide-react'
import UnitDropdown from '../UnitDropdown'
import type { ScanKind } from '../../lib/gemini'

/** Minimal scan line â€” name/qty/unit/category only. Category is used for zone assignment on
 * confirm; no brand, attributes, nutrition or price fields â€” those are server-side concerns. */
export type ReviewLine = {
  key: string
  name: string
  quantity: number
  unit: string
  /** figs taxonomy category (e.g. "dairy & eggs", "pantry staples") for deterministic zone routing. */
  category: string
  /** Groups lines from the same capture so multiple scanned receipts render as separate sections. */
  receiptGroupId: string
}

/** One entry per scanned receipt â€” drives the group-divider labels in multi-receipt sessions. */
export type ReceiptGroupMeta = {
  id: string
  merchantName: string | null
  purchasedAt: string | null
}

type Props = {
  lines: ReviewLine[]
  onLinesChange?: (lines: ReviewLine[]) => void
  editable: boolean
  scanKind?: ScanKind
  /** One entry per scanned receipt â€” used to label group dividers in multi-receipt sessions. */
  receiptGroups?: ReceiptGroupMeta[]
  onBack: () => void
  /** When present, shows a small camera button top-right that reopens the live scanner without
   * discarding what's already been reviewed here (as opposed to `onBack`, which resets). */
  onScanMore?: () => void
  onConfirm?: (lines: ReviewLine[]) => Promise<void>
}

const DELETE_WIDTH = 76

const SCAN_KIND_LABEL: Record<ScanKind, string> = {
  receipt: 'RECEIPT',
  stash: 'PANTRY',
  ingredient: 'INGREDIENTS',
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ReviewRow({
  line,
  editable,
  editing,
  onStartEdit,
  onStopEdit,
  onChange,
  onDelete,
}: {
  line: ReviewLine
  editable: boolean
  editing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onChange: (patch: Partial<ReviewLine>) => void
  onDelete: () => void
}) {
  const [dx, setDx] = useState(0)
  const startX = useRef(0)
  const dragging = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable) return
    startX.current = e.clientX
    dragging.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    setDx(Math.max(-DELETE_WIDTH, Math.min(0, delta)))
  }
  const endDrag = () => {
    dragging.current = false
    setDx((d) => (d < -DELETE_WIDTH / 2 ? -DELETE_WIDTH : 0))
  }

  return (
    <div className="relative overflow-hidden">
      {editable ? (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: DELETE_WIDTH }}>
          <button
            type="button"
            onClick={() => {
              setDx(0)
              onDelete()
            }}
            className="flex flex-1 flex-col items-center justify-center gap-1 border-0 bg-[#c0503a] text-white"
          >
            <Trash2 size={16} strokeWidth={2.2} />
            <span className="font-ui text-[10px] font-semibold">Delete</span>
          </button>
        </div>
      ) : null}

      <div
        className="flex items-center gap-3 border-b border-[#F4F3F6] bg-white py-2.5 px-4"
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? 'none' : 'transform 0.2s ease' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (editable && dx === 0 && !editing) onStartEdit()
        }}
      >
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              autoFocus
              value={line.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-[#E8E8ED] bg-white px-2.5 py-1.5 font-ui text-[13px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
              placeholder="Item name"
            />
            <input
              value={String(line.quantity)}
              onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
              inputMode="decimal"
              className="w-14 shrink-0 rounded-lg border border-[#E8E8ED] bg-white px-2 py-1.5 font-ui text-[13px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
            />
            <UnitDropdown
              value={line.unit}
              onChange={(v) => onChange({ unit: v })}
              className="w-20 shrink-0 rounded-lg border border-[#E8E8ED] bg-white px-2 py-1.5 font-ui text-[13px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onStopEdit()
              }}
              aria-label="Done editing"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-[#1A0D40] text-white"
            >
              <Check size={13} strokeWidth={3} />
            </button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <span className="min-w-0 truncate font-ui text-[14px] font-semibold text-[#111]">{line.name}</span>
            </div>
            <span className="shrink-0 font-ui text-[13px] text-[#9a9aa0]">
              {line.quantity} {line.unit}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/** Thick double-rule separator between multiple receipts scanned in the same session.
 * The next receipt's merchant name / date are shown just below the rules as a section label. */
function ReceiptGroupDivider({ merchantName, purchasedAt }: { merchantName?: string | null; purchasedAt?: string | null }) {
  const dateLabel = formatDate(purchasedAt)
  return (
    <div className="mt-2 mb-0">
      <div className="h-[2.5px] bg-[#111]" />
      <div className="h-[3px] bg-white" />
      <div className="h-[2.5px] bg-[#111]" />
      {merchantName || dateLabel ? (
        <div className="flex items-baseline gap-1.5 px-4 pt-2 pb-0.5">
          {merchantName ? <span className="font-ui text-[12px] font-semibold text-[#111]">{merchantName}</span> : null}
          {dateLabel ? <span className="font-ui text-[11px] text-[#9a9aa0]">{dateLabel}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

function NewLineRow({ onCommit }: { onCommit: (line: { name: string; quantity: number; unit: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('each')

  const reset = () => {
    setOpen(false)
    setName('')
    setQuantity('1')
    setUnit('each')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 border-b border-dashed border-[#E8E8ED] bg-white px-4 py-2.5 text-left"
      >
        <span className="font-ui text-[13px] font-semibold text-[#708a7c]">+ Add ingredient</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 border-b border-dashed border-[#E8E8ED] bg-white px-4 py-2.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add ingredient"
        className="min-w-0 flex-1 rounded-lg border border-[#E8E8ED] bg-white px-2.5 py-1.5 font-ui text-[13px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
      />
      <input
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        inputMode="decimal"
        className="w-14 shrink-0 rounded-lg border border-[#E8E8ED] bg-white px-2 py-1.5 font-ui text-[13px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
      />
      <UnitDropdown
        value={unit}
        onChange={setUnit}
        className="w-20 shrink-0 rounded-lg border border-[#E8E8ED] bg-white px-2 py-1.5 font-ui text-[13px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
      />
      <button
        type="button"
        onClick={() => {
          if (!name.trim()) {
            reset()
            return
          }
          onCommit({ name: name.trim(), quantity: Number(quantity) || 1, unit: unit.trim() || 'each' })
          reset()
        }}
        aria-label="Confirm new line"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-[#4C6A57] text-white"
      >
        <Check size={13} strokeWidth={3} />
      </button>
      <button
        type="button"
        onClick={reset}
        aria-label="Cancel new line"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-[#F5F5F7] text-[#6E6E73]"
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  )
}

/** Full-screen receipt/scan review â€” editable ledger for post-scan confirm, or read-only
 * for receipt-history detail (same look, no edit/move/delete/new-line/confirm).
 *
 * Multi-receipt: lines from different captures are grouped by `receiptGroupId` and separated
 * by a thick double-rule divider with the receipt's merchant/date as a section label. */
export default function ReceiptReviewPage({
  lines,
  onLinesChange,
  editable,
  scanKind,
  receiptGroups = [],
  onBack,
  onScanMore,
  onConfirm,
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const setLines = (updater: (prev: ReviewLine[]) => ReviewLine[]) => onLinesChange?.(updater(lines))

  const patchLine = (key: string, patch: Partial<ReviewLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const deleteLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key))

  /** Group lines by receiptGroupId, preserving insertion order (Map maintains it). */
  const groups = useMemo(() => {
    const map = new Map<string, ReviewLine[]>()
    for (const line of lines) {
      const g = map.get(line.receiptGroupId) ?? []
      g.push(line)
      map.set(line.receiptGroupId, g)
    }
    return [...map.entries()]
  }, [lines])

  const lastGroupId = groups.length > 0 ? groups[groups.length - 1][0] : 'manual'

  const addNewLine = (input: { name: string; quantity: number; unit: string }) => {
    setLines((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}`,
        name: input.name,
        brand: null,
        quantity: input.quantity,
        unit: input.unit,
        category: 'pantry staples',
        utilityTags: ['ingredient'],
        attributes: [],
        receiptGroupId: lastGroupId,
      },
    ])
  }

  const confirm = async () => {
    if (!onConfirm) return
    setBusy(true)
    try {
      await onConfirm(lines)
    } finally {
      setBusy(false)
    }
  }

  // Header shows the first group's merchant/date only for single-receipt sessions.
  const firstMeta = receiptGroups[0]
  const headerDateLabel = formatDate(firstMeta?.purchasedAt)

  return (
    <div className="fixed inset-0 z-[230] flex flex-col bg-white">
      <header
        className="flex-none border-b border-[#F0EDE7] px-4 pb-4"
        style={{ paddingTop: 'max(0.9rem, env(safe-area-inset-top, 0px))' }}
      >
        <div className="grid grid-cols-[30px_1fr_30px] items-center gap-2.5">
          <button type="button" onClick={onBack} aria-label="Back" className="flex h-[30px] w-[30px] items-center justify-center border-0 bg-transparent text-[#1A0D40]">
            <ChevronLeft size={22} strokeWidth={2.2} />
          </button>
          <span />
          {editable && onScanMore ? (
            <button
              type="button"
              onClick={onScanMore}
              aria-label="Scan more"
              className="flex h-[30px] w-[30px] items-center justify-center border-0 bg-transparent text-[#1A0D40]"
            >
              <Camera size={19} strokeWidth={2.1} />
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="mt-1 text-center">
          <p className="font-editorial text-[22px] font-bold tracking-[-0.02em] text-[#1A0D40]">figs</p>
          {scanKind ? (
            <p className="mt-1 font-ui text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#9a9aa0]">
              {SCAN_KIND_LABEL[scanKind]}
            </p>
          ) : null}
          {/* Only show merchant/date in the header for single-receipt sessions â€” for multi-receipt
              sessions the merchant/date lives in each group's divider label instead. */}
          {groups.length <= 1 && firstMeta?.merchantName ? (
            <p className="mt-1.5 font-ui text-[13px] font-medium text-[#111]">{firstMeta.merchantName}</p>
          ) : null}
          {groups.length <= 1 && headerDateLabel ? (
            <p className="mt-0.5 font-ui text-[11px] text-[#9a9aa0]">{headerDateLabel}</p>
          ) : null}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-8">
        {lines.length === 0 ? (
          <p className="px-4 pt-10 text-center font-ui text-[13px] text-[#9a9aa0]">No items found.</p>
        ) : (
          groups.map(([groupId, groupLines], gi) => {
            const meta = receiptGroups.find((m) => m.id === groupId)
            return (
              <Fragment key={groupId}>
                {gi > 0 ? (
                  <ReceiptGroupDivider merchantName={meta?.merchantName} purchasedAt={meta?.purchasedAt} />
                ) : null}
                {groupLines.map((line) => (
                  <ReviewRow
                    key={line.key}
                    line={line}
                    editable={editable}
                    editing={editingKey === line.key}
                    onStartEdit={() => setEditingKey(line.key)}
                    onStopEdit={() => setEditingKey(null)}
                    onChange={(patch) => patchLine(line.key, patch)}
                    onDelete={() => deleteLine(line.key)}
                  />
                ))}
              </Fragment>
            )
          })
        )}
        {editable ? <NewLineRow onCommit={addNewLine} /> : null}

        {editable ? (
          <div className="flex flex-col items-center gap-2 px-6 pt-6 pb-4">
            <p className="text-center font-ui text-[11.5px] font-medium text-[#7a7a82]">
              figs will automatically sort, rename, and organize your receipt items when added to stash.
            </p>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
              className="h-[50px] w-full max-w-sm rounded-full font-ui text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-opacity disabled:opacity-70"
              style={{ background: 'linear-gradient(165deg, #1A0D40 0%, #12082E 100%)' }}
            >
              {busy ? 'Adding...' : `Add ${lines.length} to Stash`}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  )
}
