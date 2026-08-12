import { useEffect, useRef, useState } from 'react'
import { ArchiveX, Flame, Inbox, Loader2, Receipt } from 'lucide-react'
import MinimalBack from '../MinimalBack'
import { useRowInteractionLock, useRowSwipeOpenLock } from '../../context/RowInteractionContext'
import { isExpired, type ReceiptLog, type StashItem } from '../../lib/stash'
import { NutritionPerServingGrid } from '../NutritionPerServingGrid'
import { AttributeBadges } from './AttributeBadges'
import ReceiptReviewPage, { type ReviewLine } from './ReceiptReviewPage'

function stashItemToReviewLine(item: StashItem): ReviewLine {
  return {
    key: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    receiptGroupId: item.receipt_id ?? 'history',
  }
}

type Panel = 'food' | 'scans'
const PANELS: { id: Panel; label: string }[] = [
  { id: 'food', label: 'Food' },
  { id: 'scans', label: 'Scans' },
]

type Props = {
  history: StashItem[]
  historyLoading: boolean
  receipts: ReceiptLog[]
  receiptsLoading: boolean
  loadReceiptItems: (receiptId: string) => Promise<StashItem[]>
  onRestore: (id: string) => void | Promise<void>
  onBack: () => void
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })
}

const TAP_TOLERANCE = 6

const REVEAL_WIDTH = 96

function FoodHistoryRow({ item, onRestore, onOpen }: { item: StashItem; onRestore: () => void; onOpen: () => void }) {
  const [dx, setDx] = useState(0)
  const startX = useRef(0)
  const dragging = useRef(false)
  const { armRowInteraction, disarmRowInteraction } = useRowInteractionLock()
  useRowSwipeOpenLock(dx)
  const wasExpired = isExpired(item)
  const Icon = wasExpired ? undefined : item.status === 'consumed' ? Flame : ArchiveX

  const onPointerDown = (e: React.PointerEvent) => {
    armRowInteraction()
    startX.current = e.clientX
    dragging.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    setDx(Math.max(-REVEAL_WIDTH, Math.min(0, delta)))
  }
  const endDrag = () => {
    dragging.current = false
    disarmRowInteraction()
    setDx((d) => (d < -REVEAL_WIDTH * 0.5 ? -REVEAL_WIDTH : 0))
  }

  return (
    <div className="relative mx-[-16px] overflow-hidden" data-figs-row-swipe="">
      <div className="absolute inset-y-0 right-0 flex items-stretch" style={{ width: REVEAL_WIDTH }}>
        <button
          type="button"
          onClick={() => {
            setDx(0)
            onRestore()
          }}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 border-0 bg-[#708a7c] text-white"
        >
          <Inbox size={16} strokeWidth={2.25} />
          <span className="font-ui text-[9px] font-bold uppercase leading-tight">To stash</span>
        </button>
      </div>

      <div
        className="flex items-center gap-3 bg-white px-4 py-2.5"
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? 'none' : 'transform 0.2s ease' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (Math.abs(dx) <= TAP_TOLERANCE) onOpen()
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-ui text-[14px] font-semibold text-[#111]">{item.name}</span>
            <AttributeBadges attributes={item.attributes} ingredientName={item.name} />
          </div>
          <div className="mt-0.5 font-ui text-[11.5px] text-[#9a9aa0]">
            {item.quantity} {item.unit}
          </div>
        </div>
        {wasExpired ? (
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="rounded-[5px] bg-[#c0503a] px-1.5 py-0.5 font-ui text-[9.5px] font-bold uppercase tracking-wide text-white">Expired</span>
            <span className="font-ui text-[10px] font-semibold text-[#c0503a]">{formatShortDate(item.added_at)}</span>
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 font-ui text-[11px] font-semibold" style={{ color: item.status === 'consumed' ? '#4C6A57' : '#c0503a' }}>
            {Icon ? <Icon size={14} strokeWidth={2.2} /> : null}
            {formatShortDate(item.added_at)}
          </span>
        )}
      </div>
    </div>
  )
}

/** Ported from figs_1.0's hidden History feature — Food (consumed/wasted) + Scans tabs. */
export default function StashHistoryView({ history, historyLoading, receipts, receiptsLoading, loadReceiptItems, onRestore, onBack }: Props) {
  const [panel, setPanel] = useState<Panel>('food')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptLog | null>(null)
  const [detailItems, setDetailItems] = useState<StashItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    if (!selectedReceipt) return
    setDetailLoading(true)
    void loadReceiptItems(selectedReceipt.id).then((items) => {
      setDetailItems(items)
      setDetailLoading(false)
    })
  }, [selectedReceipt, loadReceiptItems])

  const expandedItem = history.find((i) => i.id === expandedId) ?? null
  const hasNutrition = expandedItem
    ? [expandedItem.calories, expandedItem.fat_g, expandedItem.carbs_g, expandedItem.protein_g].some((v) => v != null)
    : false

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-white">
      <header className="me-top-chrome flex-none" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="explore-chrome-row">
          <div className="explore-chrome-side explore-chrome-side--left">
            <MinimalBack onClick={onBack} />
          </div>
          <div className="explore-chrome-center">
            <span className="font-editorial text-[20px] font-semibold tracking-[-0.01em] text-[#111]">History</span>
          </div>
          <div className="explore-chrome-side explore-chrome-side--right" aria-hidden />
        </div>
        <div className="relative mt-3 grid grid-cols-2 rounded-full border border-[#ECE9E3] bg-white/80 p-[3px] backdrop-blur-[20px]">
          <div
            className="absolute inset-y-[3px] rounded-full bg-[#F4F3F0] transition-transform"
            style={{ width: 'calc(50% - 3px)', transform: `translateX(${panel === 'scans' ? 'calc(100% + 3px)' : '3px'})` }}
            aria-hidden
          />
          {PANELS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPanel(p.id)}
              className="relative z-[1] rounded-full py-1.5 font-ui text-[12.5px] font-semibold transition-colors"
              style={{ color: panel === p.id ? '#1A0D40' : '#9a9aa0' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-10 pt-3">
        {panel === 'food' ? (
          historyLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-[#1A0D40]" />
            </div>
          ) : history.length === 0 ? (
            <div className="pt-10 text-center">
              <p className="font-editorial text-lg text-[#1A0D40]">No food history yet</p>
              <p className="mt-1 font-ui text-sm text-[#9a9aa0]">Items you eat or discard will appear here.</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[#F4F3F6]">
              {history.map((item) => (
                <div key={item.id}>
                  <FoodHistoryRow item={item} onRestore={() => void onRestore(item.id)} onOpen={() => setExpandedId((v) => (v === item.id ? null : item.id))} />
                  {expandedId === item.id && hasNutrition ? (
                    <div className="pb-2.5">
                      <NutritionPerServingGrid
                        calories={item.calories}
                        protein={item.protein_g}
                        carbs={item.carbs_g}
                        fat={item.fat_g}
                        toggleLabel={`Per ${item.unit || 'each'}`}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )
        ) : receiptsLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#1A0D40]" />
          </div>
        ) : receipts.length === 0 ? (
          <div className="pt-10 text-center">
            <Receipt className="mx-auto mb-2 h-7 w-7 text-[#9a9aa0]" strokeWidth={1.6} />
            <p className="font-editorial text-lg text-[#1A0D40]">No scans yet</p>
            <p className="mt-1 font-ui text-sm text-[#9a9aa0]">Scan a receipt to build your ledger.</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#F4F3F6]">
            {receipts.map((receipt) => (
              <button key={receipt.id} type="button" onClick={() => setSelectedReceipt(receipt)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <span className="font-ui text-[13.5px] text-[#9a9aa0]">{formatShortDate(receipt.purchased_at ?? receipt.created_at)}</span>
                <span className="font-ui text-[14px] font-semibold text-[#111]">{receipt.merchant_name || 'Receipt'}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      {selectedReceipt && detailLoading ? (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-[#1A0D40]" />
        </div>
      ) : selectedReceipt ? (
        <ReceiptReviewPage
          lines={detailItems.map(stashItemToReviewLine)}
          editable={false}
          scanKind="receipt"
          receiptGroups={[{
            id: selectedReceipt.id,
            merchantName: selectedReceipt.merchant_name,
            purchasedAt: selectedReceipt.purchased_at ?? selectedReceipt.created_at,
          }]}
          onBack={() => {
            setSelectedReceipt(null)
            setDetailItems([])
          }}
        />
      ) : null}
    </div>
  )
}
