import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, ChevronLeft, Clock, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import MeSortPopover from './MeSortPopover'
import { RECIPE_SORT_OPTIONS, defaultMeSortState, sortRecipes, type MeLayoutMode, type MeOriginFilter, type MeSortState } from '../lib/meSort'
import type { RecipeRow } from '../lib/recipes'

type Props = {
  title?: string
  recipes: RecipeRow[]
  userId: string
  /** Multi-select (cookbook) or single-select (subrecipe embed). */
  mode?: 'multi' | 'single'
  selectedIds?: string[]
  onChangeSelectedIds?: (ids: string[]) => void
  onPickSingle?: (recipeId: string) => void
  onClose: () => void
  /** Figs + opens create-recipe overlay above the picker. */
  onCreateNew?: () => void
  /** Highlight / auto-include after returning from create. */
  preferSelectId?: string | null
}

function formatCookTime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Full-screen recipe search/select — shared by Create Book and Add Subrecipe. */
export default function RecipePickerSheet({
  title = 'Add recipes',
  recipes,
  userId,
  mode = 'multi',
  selectedIds = [],
  onChangeSelectedIds,
  onPickSingle,
  onClose,
  onCreateNew,
  preferSelectId,
}: Props) {
  const [query, setQuery] = useState('')
  const [sortOpen, setSortOpen] = useState(false)
  const [sortState, setSortState] = useState<MeSortState>(defaultMeSortState())
  const [layoutMode, setLayoutMode] = useState<MeLayoutMode>('grid')
  const [originFilter, setOriginFilter] = useState<MeOriginFilter>('all')

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const searched = !q ? recipes : recipes.filter((r) => (r.title || '').toLowerCase().includes(q))
    return sortRecipes(searched, sortState, originFilter, userId)
  }, [recipes, query, sortState, originFilter, userId])

  const toggle = (id: string) => {
    if (mode === 'single') {
      onPickSingle?.(id)
      return
    }
    if (!onChangeSelectedIds) return
    if (selectedIdSet.has(id)) onChangeSelectedIds(selectedIds.filter((x) => x !== id))
    else onChangeSelectedIds([...selectedIds, id])
  }

  // Auto-select newly created recipe when returning from editor.
  useEffect(() => {
    if (!preferSelectId) return
    if (mode === 'multi') {
      if (!onChangeSelectedIds) return
      if (selectedIdSet.has(preferSelectId)) return
      if (!recipes.some((r) => r.id === preferSelectId)) return
      onChangeSelectedIds([...selectedIds, preferSelectId])
      return
    }
    if (mode === 'single' && recipes.some((r) => r.id === preferSelectId)) {
      onPickSingle?.(preferSelectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferSelectId, recipes])

  return (
    <div className="fixed inset-0 z-[225] flex flex-col bg-white animate-in slide-in-from-bottom duration-200">
      <header className="me-top-chrome flex-none" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="explore-chrome-row">
          <div className="explore-chrome-side explore-chrome-side--left">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="flex h-8 w-8 items-center justify-center border-0 bg-transparent text-[#111] transition active:opacity-70"
            >
              <ChevronLeft size={20} strokeWidth={2.25} />
            </button>
          </div>
          <div className="explore-chrome-center">
            <span className="font-editorial text-[19px] font-semibold tracking-[-0.01em] text-[#111]">{title}</span>
          </div>
          <div className="explore-chrome-side explore-chrome-side--right">
            <div className="relative flex items-center">
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
                origin={originFilter}
                onOriginChange={setOriginFilter}
                layoutMode={layoutMode}
                onLayoutModeChange={setLayoutMode}
                state={sortState}
                onChange={setSortState}
                options={RECIPE_SORT_OPTIONS}
              />
            </div>
          </div>
        </div>
      </header>

      <main className={`flex-1 overflow-y-auto pb-28 ${layoutMode === 'list' ? 'px-4 pt-2' : 'pt-2'}`}>
        {filtered.length === 0 ? (
          <p className="py-16 text-center font-ui text-[13.5px] text-[#9a9aa0]">
            {recipes.length === 0 ? 'No saved recipes found.' : 'Nothing matches your search.'}
          </p>
        ) : layoutMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-[6px] px-[6px]">
            {filtered.map((r) => {
              const selected = selectedIdSet.has(r.id)
              const timeLabel = formatCookTime(r.cleaned_json?.total_cook_minutes)
              return (
                <button key={r.id} type="button" onClick={() => toggle(r.id)} className="me-tile-card relative">
                  {r.source_image_url ? (
                    <img
                      src={r.source_image_url}
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
                  {timeLabel ? (
                    <span className="absolute left-2 top-2 z-[2] rounded-full bg-black/45 px-1.5 py-0.5 font-ui text-[10px] font-semibold text-white backdrop-blur-sm">
                      <Clock size={10} className="mr-0.5 inline" strokeWidth={2.2} />
                      {timeLabel}
                    </span>
                  ) : null}
                  {mode === 'multi' ? (
                    <span
                      className={`absolute right-2 top-2 z-[2] flex h-6 w-6 items-center justify-center rounded-full ${
                        selected ? 'bg-[#1A0D40] text-white' : 'bg-white/85 text-[#1A0D40]'
                      }`}
                    >
                      {selected ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
                    </span>
                  ) : null}
                  <h3 className="me-tile-card-title">{r.title || 'Untitled recipe'}</h3>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((r) => {
              const selected = selectedIdSet.has(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id)}
                  className="flex items-center gap-3 border-0 bg-transparent px-0 py-2.5 text-left"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#F0EDE7]">
                    {r.source_image_url ? (
                      <img src={r.source_image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#9a9aa0]">
                        <BookOpen size={20} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-ui text-[14.5px] font-semibold text-[#111]">{r.title || 'Untitled recipe'}</p>
                  </div>
                  {mode === 'multi' ? (
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${
                        selected ? 'bg-[#1A0D40] text-white' : 'bg-[#F0EDE7] text-[#1A0D40]'
                      }`}
                    >
                      {selected ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
                    </span>
                  ) : (
                    <Plus size={16} className="text-[#4C6A57]" strokeWidth={2.4} />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </main>

      <nav
        className="pointer-events-none absolute inset-x-0 z-[60] flex items-center gap-2.5 px-[18px]"
        style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="pointer-events-auto flex h-[46px] flex-1 items-center gap-2 rounded-full border border-[#ECE9E3] bg-white/90 px-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-[20px]">
          <Search size={16} strokeWidth={2} className="shrink-0 text-[#9a9aa0]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your recipes"
            className="min-w-0 flex-1 border-0 bg-transparent font-ui text-[13.5px] text-[#111] outline-none placeholder:text-[#9a9aa0]"
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
        </div>
        {onCreateNew ? (
          <button
            type="button"
            aria-label="Create new recipe"
            onClick={onCreateNew}
            className="pointer-events-auto flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-0 bg-[#1A0D40] text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
          >
            <span className="font-editorial text-[22px] font-bold leading-none">+</span>
          </button>
        ) : null}
      </nav>
    </div>
  )
}
