import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { BookOpen, ChevronDown, ChevronRight, ChevronUp, Clock, SlidersHorizontal } from 'lucide-react'
import MeAccountMenu from '../components/MeAccountMenu'
import FigsUnderlineTabs from '../components/FigsUnderlineTabs'
import MeSortPopover from '../components/MeSortPopover'
import { useUserAvatar } from '../hooks/useUserAvatar'
import type { useMyRecipes } from '../lib/recipes'
import type { useMyCookbooks, CookbookRow } from '../lib/cookbooks'
import { COOKBOOK_SORT_OPTIONS, RECIPE_SORT_OPTIONS, defaultMeSortState, sortCookbooks, sortRecipes, type MeLayoutMode, type MeOriginFilter, type MeSortState } from '../lib/meSort'

type MeCategory = 'recipes' | 'cookbooks'

const ME_TABS: { value: MeCategory; label: string }[] = [
  { value: 'recipes', label: 'Recipes' },
  { value: 'cookbooks', label: 'Cookbooks' },
]

type Props = {
  userId: string
  username?: string | null
  recipes: ReturnType<typeof useMyRecipes>
  cookbooks: ReturnType<typeof useMyCookbooks>
  /** Scroll container ref — shared with the bottom tab bar's compact-mode scroll tracking. */
  scrollRef: RefObject<HTMLDivElement | null>
  /** Driven by the tab bar's search box (search now lives there, not in this page's header). */
  searchQuery: string
  /** 0→1 scroll progress from the same tracker driving the tab bar shrink — fades the shelf title. */
  headerProgress: number
  onOpenRecipe: (id: string) => void
  onOpenCookbook: (cookbook: CookbookRow) => void
  onSignOut: () => void
}

function formatCookTime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export default function MePage(props: Props) {
  const { userId, username, recipes, cookbooks, scrollRef, searchQuery, onOpenRecipe, onOpenCookbook, onSignOut } = props



  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [category, setCategory] = useState<MeCategory>('recipes')
  const [originFilter, setOriginFilter] = useState<MeOriginFilter>('all')
  const [layoutMode, setLayoutMode] = useState<MeLayoutMode>('grid')
  const sortAnchorRef = useRef<HTMLDivElement>(null)
  const pinnedSortAnchorRef = useRef<HTMLDivElement>(null)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortState, setSortState] = useState<MeSortState>(defaultMeSortState())
  const usernameTriggerRef = useRef<HTMLButtonElement>(null)
  const avatarUrl = useUserAvatar(userId)
  const displayName = username?.trim() ? username.replace(/^@+/, '') : 'you'
  const { recipes: items, loading } = recipes
  const { cookbooks: cookbookItems, loading: cookbooksLoading } = cookbooks

  /* Directional scroll tracking: show tabs+sort pin on scroll-up mid-page */
  const [scrollingUp, setScrollingUp] = useState(false)
  const [atTop, setAtTop] = useState(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let lastScroll = el.scrollTop

    const onScroll = () => {
      const current = el.scrollTop
      setAtTop(current <= 8)
      if (current > lastScroll + 2) {
        setScrollingUp(false)
      } else if (current < lastScroll - 2) {
        setScrollingUp(true)
      }
      lastScroll = current
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef])

  const visibleRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q ? items.filter((r) => (r.title || '').toLowerCase().includes(q)) : items
    return sortRecipes(filtered, sortState, originFilter, userId)
  }, [items, searchQuery, sortState, originFilter, userId])

  const visibleCookbooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q ? cookbookItems.filter((c) => c.name.toLowerCase().includes(q)) : cookbookItems
    return sortCookbooks(filtered, sortState)
  }, [cookbookItems, searchQuery, sortState])

  const sortOptions = category === 'recipes' ? RECIPE_SORT_OPTIONS : COOKBOOK_SORT_OPTIONS

  const showPinnedSubheaders = !atTop && scrollingUp

  return (
    <div ref={scrollRef} className="me-page relative" data-figs-scroll>
      {/* Top Header Chrome attached to page flow (scrolls away; snaps back at top) */}
      <header className={`me-top-chrome relative${accountMenuOpen ? ' me-top-chrome--menu-open' : ''}`}>
        <div className="explore-chrome-row">
          <div className="explore-chrome-side explore-chrome-side--left" />

          <div className="explore-chrome-center">
            <div className="relative">
              <button
                ref={usernameTriggerRef}
                type="button"
                aria-label="Account menu"
                aria-expanded={accountMenuOpen}
                data-figs-glass-anchor=""
                className="me-username-trigger"
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              >
                <span className="me-top-username">{displayName}</span>
                {accountMenuOpen ? (
                  <ChevronUp size={14} strokeWidth={2.25} className="me-username-chevron" />
                ) : (
                  <ChevronDown size={14} strokeWidth={2.25} className="me-username-chevron" />
                )}
              </button>
              <MeAccountMenu
                open={accountMenuOpen}
                onClose={() => setAccountMenuOpen(false)}
                username={username ?? null}
                avatarUrl={avatarUrl}
                onSignOut={onSignOut}
              />
            </div>
          </div>

          <div className="explore-chrome-side explore-chrome-side--right" aria-hidden />
        </div>
      </header>

      <div className="px-3.5 pt-1.5 pb-2">
        <h1 className="font-editorial italic text-[25px] font-medium tracking-[-0.02em] text-[#111111] m-0">Your shelf</h1>
        <p className="font-ui text-[12.5px] font-medium text-[#8a8a8f] mt-0.5 mb-0">
          {items.length} {items.length === 1 ? 'recipe' : 'recipes'} &middot; {cookbookItems.length}{' '}
          {cookbookItems.length === 1 ? 'cookbook' : 'cookbooks'}
        </p>
      </div>

      {/* In-flow tabs + sort — duplicated as a pin when scrolling up mid-page */}
      <div className="relative flex items-center justify-between py-1 px-3.5">
        <div className="flex h-8 min-w-0 flex-1 items-center overflow-x-auto">
          <FigsUnderlineTabs ariaLabel="Category" gapClass="gap-3.5" tightUnderline value={category} onChange={setCategory} options={ME_TABS} />
        </div>

        <div ref={sortAnchorRef} className="relative flex items-center">
          <button
            type="button"
            aria-label="Sort and view options"
            onClick={() => setSortOpen((v) => !v)}
            className="relative flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent text-[#111] transition active:opacity-70"
          >
            <SlidersHorizontal size={17} strokeWidth={2} />
          </button>
          <MeSortPopover
            open={sortOpen && !showPinnedSubheaders}
            onClose={() => setSortOpen(false)}
            anchorRef={sortAnchorRef}
            origin={originFilter}
            onOriginChange={setOriginFilter}
            layoutMode={layoutMode}
            onLayoutModeChange={setLayoutMode}
            state={sortState}
            onChange={setSortState}
            options={sortOptions}
          />
        </div>
      </div>

      {/* Pinned tabs+sort only — same row as above; drops when you reach the page header */}
      {showPinnedSubheaders ? (
        <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-white/95 backdrop-blur-md py-1 px-3.5 border-b border-black/5">
          <div className="flex h-8 min-w-0 flex-1 items-center overflow-x-auto">
            <FigsUnderlineTabs ariaLabel="Category" gapClass="gap-3.5" tightUnderline value={category} onChange={setCategory} options={ME_TABS} />
          </div>

          <div ref={pinnedSortAnchorRef} className="relative flex items-center">
            <button
              type="button"
              aria-label="Sort and view options"
              onClick={() => setSortOpen((v) => !v)}
              className="relative flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent text-[#111] transition active:opacity-70"
            >
              <SlidersHorizontal size={17} strokeWidth={2} />
            </button>
            <MeSortPopover
              open={sortOpen}
              onClose={() => setSortOpen(false)}
              anchorRef={pinnedSortAnchorRef}
              origin={originFilter}
              onOriginChange={setOriginFilter}
              layoutMode={layoutMode}
              onLayoutModeChange={setLayoutMode}
              state={sortState}
              onChange={setSortState}
              options={sortOptions}
            />
          </div>
        </div>
      ) : null}

      <div className={`me-page-body ${layoutMode === 'list' ? 'me-page-body--list' : ''}`} style={{ paddingTop: 8 }}>
        {category === 'recipes' ? (
          loading ? (
            <p className="me-page-empty">Loading…</p>
          ) : visibleRecipes.length === 0 ? (
            <p className="me-page-empty">{searchQuery.trim() ? 'No matches' : 'No recipes yet — add one with the + button.'}</p>
          ) : layoutMode === 'grid' ? (
            /* 2-column Square Card Grid View (1.2.9 Wild Explore style: minimal gap & near-edge) */
            <div className="grid grid-cols-2 gap-[6px] px-[6px]">
              {visibleRecipes.map((recipe) => {
                const processing =
                  recipe.is_placeholder ||
                  recipe.processing_status === 'processing' ||
                  recipe.processing_status === 'pending'
                const failed = recipe.processing_status === 'error'
                const timeLabel = processing || failed ? null : formatCookTime(recipe.cleaned_json?.total_cook_minutes)
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => {
                      if (processing) return
                      onOpenRecipe(recipe.id)
                    }}
                    className={`me-tile-card${processing ? ' me-tile-card--importing' : ''}`}
                    aria-busy={processing || undefined}
                  >
                    {processing ? (
                      <div className="h-full w-full" style={{ background: 'linear-gradient(165deg, #1A0D40 0%, #12082E 100%)' }} />
                    ) : recipe.source_image_url ? (
                      <img
                        src={recipe.source_image_url}
                        alt=""
                        className="me-tile-card-img"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#251b45] text-[#9a9aa0]">
                        <BookOpen size={28} strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="me-tile-card-gradient" />
                    {failed ? (
                      <span className="me-tile-card-time-badge">Failed</span>
                    ) : timeLabel ? (
                      <span className="me-tile-card-time-badge">
                        <Clock size={11} strokeWidth={2.2} />
                        {timeLabel}
                      </span>
                    ) : null}
                    <h3 className={`me-tile-card-title${processing ? ' me-tile-card-title--importing' : ''}`}>
                      {processing ? 'Importing Recipe...' : recipe.title || 'Untitled recipe'}
                    </h3>
                  </button>
                )
              })}
            </div>
          ) : (
            /* Flat List View */
            <div className="flex flex-col">
              {visibleRecipes.map((recipe) => {
                const processing =
                  recipe.is_placeholder ||
                  recipe.processing_status === 'processing' ||
                  recipe.processing_status === 'pending'
                const timeLabel = processing ? null : formatCookTime(recipe.cleaned_json?.total_cook_minutes)
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => {
                      if (processing) return
                      onOpenRecipe(recipe.id)
                    }}
                    className="flex items-center gap-3.5 border-0 bg-transparent py-2.5 text-left"
                    aria-busy={processing || undefined}
                  >
                    <div
                      className="h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[10px]"
                      style={
                        processing
                          ? { background: 'linear-gradient(165deg, #1A0D40 0%, #12082E 100%)' }
                          : { background: '#E2DED4' }
                      }
                    >
                      {!processing && recipe.source_image_url ? (
                        <img
                          src={recipe.source_image_url}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        className={
                          processing
                            ? 'truncate font-editorial text-[15.5px] font-medium italic leading-tight text-[#1A0D40]'
                            : 'truncate font-ui text-[15.5px] font-bold leading-tight text-[#1A0D40]'
                        }
                      >
                        {processing ? 'Importing Recipe...' : recipe.title || 'Untitled recipe'}
                      </h3>
                      {timeLabel ? (
                        <div className="mt-0.5 font-ui text-[11px] text-[#9a9aa0]">{timeLabel}</div>
                      ) : null}
                    </div>
                    <ChevronRight size={17} strokeWidth={2.2} className="shrink-0 text-[#c4c2c8]" />
                  </button>
                )
              })}
            </div>
          )
        ) : cookbooksLoading ? (
          <p className="me-page-empty">Loading…</p>
        ) : visibleCookbooks.length === 0 ? (
          <p className="me-page-empty">{searchQuery.trim() ? 'No matches' : 'No cookbooks yet — create one with the + button.'}</p>
        ) : layoutMode === 'grid' ? (
          /* Full-size Portrait Hero Image Cookbook Grid View (Aspect 3/4.4) */
          <div className="grid grid-cols-2 gap-[6px] px-[6px]">
            {visibleCookbooks.map((cookbook) => {
              const authorName = (cookbook.created_by_string || displayName).replace(/^@+/, '')
              return (
                <button
                  key={cookbook.id}
                  type="button"
                  onClick={() => onOpenCookbook(cookbook)}
                  className="relative w-full overflow-hidden rounded-[12px] border-0 bg-[#111111] transition active:scale-[0.97]"
                  style={{ aspectRatio: '3 / 4.4' }}
                >
                  {cookbook.cover_image_url ? (
                    <img src={cookbook.cover_image_url} alt="" className="me-tile-card-img" />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-white"
                      style={{ background: cookbook.theme_color_hex || '#1A0D40' }}
                    >
                      <BookOpen size={28} strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="me-tile-card-gradient" />
                  <div className="absolute left-2.5 right-2.5 bottom-2.5 z-10 text-left">
                    <h3 className="line-clamp-2 font-editorial text-[15.5px] font-bold leading-tight text-white shadow-sm">
                      {cookbook.name}
                    </h3>
                    <div className="mt-0.5 truncate font-ui text-[11px] font-normal text-white/80">
                      {authorName}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

        ) : (
          /* Flat List View for Cookbooks */
          <div className="flex flex-col">
            {visibleCookbooks.map((cookbook) => (
              <button
                key={cookbook.id}
                type="button"
                onClick={() => onOpenCookbook(cookbook)}
                className="flex items-center gap-3.5 py-2.5 text-left border-0 bg-transparent"
              >
                <div
                  className="flex h-[46px] w-[36px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] text-white shadow-sm"
                  style={{ background: cookbook.theme_color_hex || '#1A0D40' }}
                >
                  {cookbook.cover_image_url ? (
                    <img src={cookbook.cover_image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <BookOpen size={16} strokeWidth={1.6} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-editorial text-[17px] font-bold leading-tight text-[#1A0D40]">{cookbook.name}</h3>
                  <div className="mt-0.5 truncate font-ui text-[11px] text-[#8a8a8f]">{cookbook.created_by_string || 'you'}</div>
                </div>
                <ChevronRight size={17} strokeWidth={2.2} className="shrink-0 text-[#c4c2c8]" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
