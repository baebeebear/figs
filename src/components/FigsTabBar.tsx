import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Home, Plus, Search, X, type LucideIcon } from 'lucide-react'
import CreateMenu, { type CreateMenuActionDef } from './CreateMenu'

export type FigsTabId = 'home' | 'me'
export type FigsCompactMode = 'me' | null

const TABS: { id: FigsTabId; label: string; Icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'me', label: 'Me', Icon: BookOpen },
]

const DRAG_THRESHOLD_PX = 6

type FigsTabBarProps = {
  tab: FigsTabId
  onTab: (tab: FigsTabId) => void
  /** Actions shown in the "+" popup — varies by active tab. */
  plusActions: CreateMenuActionDef[]
  onPlusAction: (action: string) => void
  /** Me tab, scrolled past the top — shrinks the bar and swaps the tab track for avatar+Search. */
  compactMode?: FigsCompactMode
  /** 0→1, drives a continuous shrink of the bar/icons in step with scroll (not a hard snap). */
  scrollProgress?: number
  profileAvatarUrl?: string | null
  /** Search box expanded over the whole bar (tap "Search" in compact mode to get here). */
  searchOpen?: boolean
  searchQuery?: string
  onSearchQueryChange?: (q: string) => void
  onSearchFocus?: () => void
  onSearchClose?: () => void
  /** Tap the avatar in compact mode — scrolls Me back to the top, which naturally un-compacts. */
  onExpandRequest?: () => void
}

function triggerHaptic() {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(8)
    } catch {
      // Ignore vibration errors if unsupported
    }
  }
}

function tabIndexFromX(track: HTMLElement, clientX: number) {
  const rect = track.getBoundingClientRect()
  const x = clientX - rect.left
  const ratio = Math.min(1, Math.max(0, x / rect.width))
  return Math.min(TABS.length - 1, Math.max(0, Math.floor(ratio * TABS.length)))
}

export default function FigsTabBar({
  tab,
  onTab,
  plusActions,
  onPlusAction,
  compactMode = null,
  scrollProgress = 0,
  searchOpen = false,
  searchQuery = '',
  onSearchQueryChange,
  onSearchFocus,
  onSearchClose,
  onExpandRequest,
}: FigsTabBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const dragStartX = useRef(0)
  const lastTouchX = useRef(0)
  const draggingRef = useRef(false)
  const suppressClickRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const activeIndex = Math.max(0, TABS.findIndex((t) => t.id === tab))
  const indicatorIndex = dragIndex ?? activeIndex
  const progress = Math.min(1, Math.max(0, scrollProgress))
  const eased = progress * progress * (3 - 2 * progress)
  const isMeCompact = compactMode === 'me' && !searchOpen
  // Soften the compressed end-state a bit so compact + typing search stay readable.
  const shrink = Math.min(1, eased) * 0.82

  useEffect(() => {
    if (isMeCompact || searchOpen) setCreateOpen(false)
  }, [isMeCompact, searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [searchOpen])

  const resetDrag = useCallback(() => {
    draggingRef.current = false
    setDragging(false)
    setDragIndex(null)
  }, [])

  const stopViewportSwipe = useCallback((e: React.TouchEvent) => {
    e.stopPropagation()
  }, [])

  const handleTrackTouchStart = useCallback(
    (e: React.TouchEvent) => {
      stopViewportSwipe(e)
      const t = e.touches[0]
      if (!t) return
      dragStartX.current = t.clientX
      lastTouchX.current = t.clientX
      draggingRef.current = false
      suppressClickRef.current = false
      resetDrag()
      setPressed(true)
      triggerHaptic()
    },
    [resetDrag, stopViewportSwipe],
  )

  const handleTrackTouchMove = useCallback(
    (e: React.TouchEvent) => {
      stopViewportSwipe(e)
      const t = e.touches[0]
      const track = trackRef.current
      if (!t || !track) return
      lastTouchX.current = t.clientX
      if (Math.abs(t.clientX - dragStartX.current) <= DRAG_THRESHOLD_PX) return
      draggingRef.current = true
      suppressClickRef.current = true
      setDragging(true)
      const nextIdx = tabIndexFromX(track, t.clientX)
      if (nextIdx !== dragIndex) {
        triggerHaptic()
        setDragIndex(nextIdx)
      }
    },
    [dragIndex, stopViewportSwipe],
  )

  const handleTrackTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      stopViewportSwipe(e)
      setPressed(false)
      const track = trackRef.current
      if (draggingRef.current && track) {
        const idx = tabIndexFromX(track, lastTouchX.current)
        const next = TABS[idx]?.id
        if (next && next !== tab) {
          triggerHaptic()
          onTab(next)
        }
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 300)
        resetDrag()
        return
      }
      resetDrag()
    },
    [onTab, resetDrag, stopViewportSwipe, tab],
  )

  const handleTrackTouchCancel = useCallback(
    (e: React.TouchEvent) => {
      stopViewportSwipe(e)
      setPressed(false)
      resetDrag()
    },
    [resetDrag, stopViewportSwipe],
  )

  const handleTabClick = (id: FigsTabId) => {
    if (suppressClickRef.current || draggingRef.current) return
    triggerHaptic()
    setCreateOpen(false)
    onTab(id)
  }

  const handlePlusClick = () => {
    triggerHaptic()
    if (searchOpen) {
      onSearchClose?.()
      return
    }
    if (isMeCompact && !createOpen) {
      onExpandRequest?.()
    }
    setCreateOpen((v) => !v)
  }

  const plusButton = (
    <button
      ref={plusRef}
      type="button"
      className={`figs-tab-bar-plus${createOpen ? ' figs-tab-bar-plus--open figs-tab-bar-plus--above-scrim' : ''}${searchOpen ? ' figs-tab-bar-plus--search' : ''}`}
      aria-label={searchOpen || createOpen ? 'Close' : 'Create'}
      aria-expanded={createOpen}
      onClick={handlePlusClick}
    >
      {!searchOpen && <img src="/figs_logo_fig.png" alt="" className="figs-tab-bar-plus-shape" draggable={false} />}
      {searchOpen || createOpen ? (
        <X className="figs-tab-bar-icon" strokeWidth={2.35} aria-hidden />
      ) : (
        <Plus className="figs-tab-bar-icon" strokeWidth={2.35} aria-hidden />
      )}
    </button>
  )

  const shellClass = searchOpen ? 'figs-tab-bar-shell figs-tab-bar-shell--search' : isMeCompact ? 'figs-tab-bar-shell figs-tab-bar-shell--compact' : 'figs-tab-bar-shell figs-tab-bar-shell--rv0'

  return (
    <nav className={`figs-tab-bar${createOpen ? ' figs-tab-bar--menu-open' : ''}`} aria-label="Main navigation">
      <div
        className={shellClass}
        style={{
          ['--figs-scroll-progress' as string]: String(shrink),
          ['--figs-tab-btn-size' as string]: `calc(2.99rem - (${shrink} * 1.06rem))`,
          ['--figs-tab-icon-size' as string]: `calc(1.36rem - (${shrink} * 0.35rem))`,
          ['--figs-tab-track-pad' as string]: '2px',
          // Normal: full FAB. Compact: moderate shrink. Searching: X matches search-bar height.
          ['--figs-plus-size' as string]: searchOpen
            ? `calc(2.99rem - (${shrink} * 1.06rem))`
            : isMeCompact
              ? `calc(3.7rem - (${shrink} * 0.7rem))`
              : '3.7rem',
        }}
      >
        {searchOpen ? (
          <>
            <label className="figs-tab-bar-search-expanded">
              <Search className="figs-tab-bar-search-icon" strokeWidth={2} aria-hidden />
              <input
                ref={searchInputRef}
                type="search"
                enterKeyHint="search"
                placeholder="Search your recipes"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange?.(e.target.value)}
                aria-label="Search your recipes"
              />
            </label>
            <div className="figs-tab-bar-plus-wrap">{plusButton}</div>
          </>
        ) : isMeCompact ? (
          <>
            <button
              type="button"
              className="figs-tab-bar-side figs-tab-bar-side--left figs-tab-bar-btn figs-tab-bar-btn--active"
              aria-label="Expand navigation"
              onClick={() => onExpandRequest?.()}
            >
              <BookOpen className="figs-tab-bar-icon" strokeWidth={2.25} fill="currentColor" aria-hidden />
            </button>

            <button type="button" className="figs-tab-bar-search" aria-label="Search your recipes" onClick={() => onSearchFocus?.()}>
              <Search className="figs-tab-bar-search-icon" strokeWidth={2} aria-hidden />
              <span>Search</span>
            </button>

            <div className="figs-tab-bar-plus-wrap figs-tab-bar-side--right">{plusButton}</div>
          </>
        ) : (
          <>
            <div
              ref={trackRef}
              className={`figs-tab-bar-track${pressed ? ' figs-tab-bar-track--pressed' : ''}${dragging ? ' figs-tab-bar-track--dragging' : ''}`}
              style={{ ['--figs-tab-count' as string]: '2', touchAction: 'none' }}
              onTouchStart={handleTrackTouchStart}
              onTouchMove={handleTrackTouchMove}
              onTouchEnd={handleTrackTouchEnd}
              onTouchCancel={handleTrackTouchCancel}
              onMouseDown={() => setPressed(true)}
              onMouseUp={() => setPressed(false)}
              onMouseLeave={() => setPressed(false)}
            >
              <div
                className={`figs-tab-bar-indicator${pressed || dragging ? ' figs-tab-bar-indicator--press' : ''}`}
                style={{ transform: `translateX(${indicatorIndex * 100}%)` }}
                aria-hidden
              />
              {TABS.map(({ id, label, Icon }, idx) => {
                const active = tab === id
                const preview = dragging && dragIndex === idx
                const visualActive = preview || (!dragging && active)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleTabClick(id)}
                    className={`figs-tab-bar-btn${visualActive ? ' figs-tab-bar-btn--active' : ''}${preview ? ' figs-tab-bar-btn--preview' : ''}`}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon
                      className="figs-tab-bar-icon"
                      strokeWidth={visualActive ? 2.2 : 2}
                      fill={visualActive ? 'currentColor' : 'none'}
                      aria-hidden
                    />
                  </button>
                )
              })}
            </div>

            <div className="figs-tab-bar-plus-wrap">
              {plusButton}
              <CreateMenu
                open={createOpen}
                anchorRef={plusRef}
                actions={plusActions}
                onClose={() => setCreateOpen(false)}
                onSelect={(action) => {
                  setCreateOpen(false)
                  onPlusAction(action)
                }}
              />
            </div>
          </>
        )}
      </div>
    </nav>
  )
}
