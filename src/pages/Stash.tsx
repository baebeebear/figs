import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ChevronDown, Clock, History, PenLine, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import MinimalBack from '../components/MinimalBack'
import FigsUnderlineTabs from '../components/FigsUnderlineTabs'
import SwipeStashInventoryRow from '../components/stash/SwipeStashInventoryRow'
import StashItemDetailsSheet from '../components/stash/StashItemDetailsSheet'
import StashSortPopover from '../components/stash/StashSortPopover'
import StashHistoryView from '../components/stash/StashHistoryView'
import StashSelectToolbar from '../components/stash/StashSelectToolbar'
import StashRowActionsPopup from '../components/stash/StashRowActionsPopup'
import type { useStash } from '../lib/stash'
import { daysUntilExpiry, urgencyColorForDays, zoneKey } from '../lib/stash'
import type { StorageZone } from '../lib/stashCategories'
import { applyStashSort, defaultStashSortState, type StashSortState } from '../lib/stashSort'
import { groupStashItems, STASH_GROUP_MODES, type StashGroupMode } from '../lib/stashGrouping'

type Props = {
  stash: ReturnType<typeof useStash>
  onBack: () => void
  onQuickAdd: () => void
  onScan: () => void
}

const USE_SOON_DISMISS_KEY = 'figs-rv0-stash-usesoon-dismissed-for'

export default function StashPage({ stash, onBack, onQuickAdd, onScan }: Props) {
  const { items, summary, setStatus, updateItem, deleteItems, history, historyLoading, loadHistory, receipts, receiptsLoading, loadReceipts, loadReceiptItems, restoreItem } = stash
  const [groupMode, setGroupMode] = useState<StashGroupMode>('storage')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortState, setSortState] = useState<StashSortState>(defaultStashSortState())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [useSoonCollapsed, setUseSoonCollapsed] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [rowActionsForId, setRowActionsForId] = useState<string | null>(null)
  const [rowActionsAnchor, setRowActionsAnchor] = useState<{ clientX: number; clientY: number } | null>(null)
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[] | null>(null)
  const [dragItemId, setDragItemId] = useState<string | null>(null)
  const [dragOverZone, setDragOverZone] = useState<StorageZone | null>(null)
  const zoneSectionRefs = useRef(new Map<string, HTMLDivElement>())

  const editingItem = items.find((i) => i.id === editingId) ?? null
  const rowActionsItem = items.find((i) => i.id === rowActionsForId) ?? null
  const useSoonKey = summary.useSoon.map((i) => i.id).join(',')

  useEffect(() => {
    try {
      setUseSoonCollapsed(localStorage.getItem(USE_SOON_DISMISS_KEY) === useSoonKey && useSoonKey.length > 0)
    } catch {
      /* ignore */
    }
  }, [useSoonKey])

  const toggleUseSoon = () => {
    setUseSoonCollapsed((v) => {
      const next = !v
      try {
        if (next) localStorage.setItem(USE_SOON_DISMISS_KEY, useSoonKey)
        else localStorage.removeItem(USE_SOON_DISMISS_KEY)
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const filteredByQuery = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => i.name.toLowerCase().includes(q))
  }, [items, query])

  const groupSections = useMemo(() => {
    return groupStashItems(filteredByQuery, groupMode).map((section) => ({ ...section, items: applyStashSort(section.items, sortState) }))
  }, [filteredByQuery, sortState, groupMode])

  const allVisibleIds = useMemo(() => {
    const set = new Set<string>()
    for (const section of groupSections) for (const item of section.items) set.add(item.id)
    return set
  }, [groupSections])

  const enterSelectMode = (seedId?: string) => {
    setSelectMode(true)
    setSelectedIds(seedId ? new Set([seedId]) : new Set())
    setRowActionsForId(null)
  }
  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.size === allVisibleIds.size ? new Set() : new Set(allVisibleIds)))
  }

  const runBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    setDeleteConfirmIds(ids)
  }
  const confirmBulkDelete = async () => {
    if (!deleteConfirmIds) return
    await deleteItems(deleteConfirmIds)
    setDeleteConfirmIds(null)
    exitSelectMode()
  }
  const runBulkEaten = async () => {
    await Promise.all(Array.from(selectedIds).map((id) => setStatus(id, 'consumed')))
    exitSelectMode()
  }
  const runBulkWaste = async () => {
    await Promise.all(Array.from(selectedIds).map((id) => setStatus(id, 'wasted')))
    exitSelectMode()
  }

  /** Drag a row's handle across Storage zone sections to reassign it (Fridge/Freezer/Pantry) —
   * only meaningful in select mode's Storage grouping, since other tabs don't represent zones. */
  const startZoneDrag = (itemId: string) => (e: React.PointerEvent) => {
    setDragItemId(itemId)
    try {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    } catch {}
  }
  const onZoneDragMove = (e: React.PointerEvent) => {
    if (!dragItemId) return
    let hovered: StorageZone | null = null
    for (const [key, el] of zoneSectionRefs.current) {
      const r = el.getBoundingClientRect()
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        hovered = key as StorageZone
        break
      }
    }
    setDragOverZone(hovered)
  }
  const endZoneDrag = () => {
    if (dragItemId && dragOverZone) {
      const item = items.find((i) => i.id === dragItemId)
      if (item && zoneKey(item) !== dragOverZone) void updateItem(dragItemId, { zone: dragOverZone })
    }
    setDragItemId(null)
    setDragOverZone(null)
  }

  if (historyOpen) {
    return (
      <StashHistoryView
        history={history}
        historyLoading={historyLoading}
        receipts={receipts}
        receiptsLoading={receiptsLoading}
        loadReceiptItems={loadReceiptItems}
        onRestore={restoreItem}
        onBack={() => setHistoryOpen(false)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-white">
      {selectMode ? (
        <StashSelectToolbar
          selectedCount={selectedIds.size}
          allSelected={selectedIds.size > 0 && selectedIds.size === allVisibleIds.size}
          onExit={exitSelectMode}
          onToggleSelectAll={toggleSelectAll}
          onDelete={() => void runBulkDelete()}
          onEaten={() => void runBulkEaten()}
          onWaste={() => void runBulkWaste()}
        />
      ) : (
        <header className="me-top-chrome flex-none" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="explore-chrome-row">
            <div className="explore-chrome-side explore-chrome-side--left">
              <MinimalBack onClick={onBack} />
            </div>
            <div className="explore-chrome-center">
              <span className="font-editorial text-[20px] font-semibold tracking-[-0.01em] text-[#111]">Stash</span>
            </div>
            <div className="explore-chrome-side explore-chrome-side--right">
              <button
                type="button"
                aria-label="History"
                onClick={() => {
                  setHistoryOpen(true)
                  void loadHistory()
                  void loadReceipts()
                }}
                className="flex h-[30px] w-[30px] items-center justify-center border-0 bg-transparent text-[#1A0D40]"
              >
                <History size={19} strokeWidth={2.1} />
              </button>
            </div>
          </div>

          <div className="relative mt-3 flex items-center gap-2">
            <div className="flex h-8 min-w-0 flex-1 items-center overflow-x-auto">
              <FigsUnderlineTabs
                ariaLabel="Group by"
                scrollable
                gapClass="gap-5"
                value={groupMode}
                onChange={setGroupMode}
                options={STASH_GROUP_MODES}
              />
            </div>
            <button
              type="button"
              aria-label="Sort"
              onClick={() => setSortOpen((v) => !v)}
              className="relative flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent text-[#111]"
            >
              <SlidersHorizontal size={17} strokeWidth={2} />
            </button>
            <StashSortPopover open={sortOpen} onClose={() => setSortOpen(false)} state={sortState} onChange={setSortState} />
          </div>
        </header>
      )}

      <main
        className="flex-1 overflow-y-auto pb-28"
        onPointerMove={dragItemId ? onZoneDragMove : undefined}
        onPointerUp={dragItemId ? endZoneDrag : undefined}
        onPointerCancel={dragItemId ? endZoneDrag : undefined}
      >
        {!selectMode && !useSoonCollapsed && summary.useSoon.length > 0 ? (
          <div className="px-0.5 pt-0.5">
            <div className="overflow-hidden rounded-[14px] border border-[#E8E8ED] bg-[#F5F5F7]">
              <button type="button" onClick={toggleUseSoon} className="flex w-full items-center gap-2.5 px-3 py-2">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#F7ECE8] text-[#c0503a]">
                  <Clock size={14} strokeWidth={2.2} />
                </span>
                <span className="font-ui text-[13px] font-semibold text-[#111]">Use soon</span>
                <span className="font-ui text-[12px] text-[#9a9aa0]">{summary.useSoon.length}</span>
                <span className="flex-1" />
                <ChevronDown
                  size={15}
                  strokeWidth={2.2}
                  className="shrink-0 text-[#9a9aa0] transition-transform"
                  style={{ transform: useSoonCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {!useSoonCollapsed
                ? summary.useSoon.map((item) => {
                    const days = daysUntilExpiry(item)
                    const color = urgencyColorForDays(days)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEditingId(item.id)}
                        className="flex w-full items-center gap-3 border-t border-[#E8E8ED] px-3 py-2.5 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-ui text-[14px] font-semibold text-[#111]">{item.name}</div>
                          <div className="font-ui text-[11.5px] text-[#9a9aa0]">
                            {item.quantity} {item.unit}
                          </div>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1.5 font-ui text-[11.5px] font-semibold" style={{ color }}>
                          <span className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
                          {days == null ? '' : days <= 0 ? 'Today' : `${days} days`}
                        </span>
                      </button>
                    )
                  })
                : null}
            </div>
          </div>
        ) : null}

        {groupSections.map((section, sectionIndex) => {
          const collapsed = collapsedSections.has(section.key)
          const SectionIcon = section.icon
          const isZoneDropTarget = groupMode === 'storage' && selectMode
          return (
            <div
              key={section.key}
              ref={
                isZoneDropTarget
                  ? (el) => {
                      if (el) zoneSectionRefs.current.set(section.key, el)
                      else zoneSectionRefs.current.delete(section.key)
                    }
                  : undefined
              }
              className={`px-4 ${sectionIndex === 0 ? 'pt-2.5' : 'pt-4'} ${dragOverZone === section.key ? 'rounded-2xl bg-[#EEF2ED] transition-colors' : 'transition-colors'}`}
            >
              <button type="button" onClick={() => toggleSection(section.key)} className="flex w-full items-center gap-2 border-0 bg-transparent p-0 pb-2 text-left">
                <SectionIcon size={16} strokeWidth={2} className="text-[#111]" aria-hidden />
                <h2 className="font-ui text-[14px] font-bold text-[#111]">{section.label}</h2>
                <span className="font-ui text-[12px] text-[#9a9aa0]">{section.items.length}</span>
                <span className="flex-1" />
                <ChevronDown
                  size={15}
                  strokeWidth={2.2}
                  className="shrink-0 text-[#9a9aa0] transition-transform"
                  style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {!collapsed ? (
                <div className="flex flex-col divide-y divide-[#F4F3F6]">
                  {section.items.map((item) => (
                    <SwipeStashInventoryRow
                      key={item.id}
                      item={item}
                      onOpen={() => setEditingId(item.id)}
                      onEatenAll={() => void setStatus(item.id, 'consumed')}
                      onReduceQuantity={(quantity) => void updateItem(item.id, { quantity })}
                      onWasted={() => void setStatus(item.id, 'wasted')}
                      selectMode={selectMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelected(item.id)}
                      onDragHandlePointerDown={selectMode ? startZoneDrag(item.id) : undefined}
                      onLongPress={(anchor) => {
                        setRowActionsForId(item.id)
                        setRowActionsAnchor(anchor)
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}

        {!items.length ? (
          <p className="px-4 pt-10 text-center font-ui text-[13px] text-[#9a9aa0]">Your stash is empty — add something below.</p>
        ) : !groupSections.length ? (
          <p className="px-4 pt-10 text-center font-ui text-[13px] text-[#9a9aa0]">Nothing matches your filters.</p>
        ) : null}
      </main>

      {/* Floating footer — home-size figs + search filling the rest */}
      {selectMode ? null : (
        <nav className="figs-tab-bar figs-tab-bar--stash" aria-label="Stash search">
          <div
            className="figs-tab-bar-shell figs-tab-bar-shell--stash"
            style={{
              ['--figs-tab-btn-size' as string]: '2.75rem',
              ['--figs-tab-icon-size' as string]: '1.36rem',
              ['--figs-plus-size' as string]: '3.7rem',
            }}
          >
            <label className="figs-tab-bar-search-expanded">
              <Search className="figs-tab-bar-search-icon" strokeWidth={2} aria-hidden />
              <input
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your stash"
                aria-label="Search your stash"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-0 bg-[#F0EDE7] text-[#6e6e73]"
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              ) : null}
            </label>
            <div className="figs-tab-bar-plus-wrap">
              {addOpen ? (
                <div className="absolute bottom-[calc(100%+0.65rem)] right-0 flex w-[214px] flex-col gap-1 overflow-hidden rounded-[18px] border border-[#ECE9E3] bg-white p-2 shadow-[0_20px_50px_-14px_rgba(20,10,40,0.34)]">
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen(false)
                      onScan()
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 py-3 text-left"
                  >
                    <Camera size={17} strokeWidth={2} className="shrink-0 text-black" />
                    <span className="font-ui text-[13px] font-semibold text-black">Scan / Capture</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen(false)
                      onQuickAdd()
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 py-3 text-left"
                  >
                    <PenLine size={17} strokeWidth={2} className="shrink-0 text-black" />
                    <span className="font-ui text-[13px] font-semibold text-black">Quick add</span>
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                aria-label={addOpen ? 'Close' : 'Add to stash'}
                onClick={() => setAddOpen((v) => !v)}
                className={`figs-tab-bar-plus${addOpen ? ' figs-tab-bar-plus--open' : ''}`}
              >
                <img src="/figs_logo_fig.png" alt="" className="figs-tab-bar-plus-shape" draggable={false} />
                {addOpen ? (
                  <X className="figs-tab-bar-icon" strokeWidth={2.35} aria-hidden />
                ) : (
                  <Plus className="figs-tab-bar-icon" strokeWidth={2.35} aria-hidden />
                )}
              </button>
            </div>
          </div>
        </nav>
      )}

      {editingItem ? (
        <StashItemDetailsSheet item={editingItem} onClose={() => setEditingId(null)} onSave={(patch) => updateItem(editingItem.id, patch)} />
      ) : null}

      {rowActionsItem && rowActionsAnchor ? (
        <StashRowActionsPopup
          itemName={rowActionsItem.name}
          anchor={rowActionsAnchor}
          onClose={() => setRowActionsForId(null)}
          onSelect={() => enterSelectMode(rowActionsItem.id)}
          onDelete={() => {
            setRowActionsForId(null)
            setDeleteConfirmIds([rowActionsItem.id])
          }}
        />
      ) : null}

      {deleteConfirmIds ? (
        <div
          className="fixed inset-0 z-[330] flex items-end justify-center bg-[#1A0D40]/28 p-4 backdrop-blur-[3px] sm:items-center"
          role="dialog"
          aria-modal
          onClick={() => setDeleteConfirmIds(null)}
        >
          <div className="mx-auto w-full max-w-sm rounded-[20px] bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 px-1 font-ui text-[13.5px] text-[#332e3d]">
              {deleteConfirmIds.length > 1
                ? `Delete ${deleteConfirmIds.length} items from your stash permanently?`
                : 'Delete this item from your stash permanently?'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmIds(null)}
                className="h-10 flex-1 rounded-full border border-[#E8E8ED] bg-white font-ui text-[13px] font-semibold text-[#111]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmBulkDelete()}
                className="h-10 flex-1 rounded-full border-0 bg-[#c0503a] font-ui text-[13px] font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
