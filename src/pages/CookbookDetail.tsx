import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Clock, MoreHorizontal, SlidersHorizontal } from 'lucide-react'
import { deleteCookbook, useCookbookRecipes, usableCoverImage, type CookbookRow } from '../lib/cookbooks'
import { cookbookHeroGradient, DEFAULT_COOKBOOK_THEME, extractDominantColorFromImage } from '../lib/coverTheme'
import AnchoredPopup, { type PopupAnchor } from '../components/AnchoredPopup'
import CenteredPopup from '../components/CenteredPopup'
import MeSortPopover from '../components/MeSortPopover'
import {
  RECIPE_SORT_OPTIONS,
  defaultMeSortState,
  sortCookbookAssignmentRecipes,
  type MeLayoutMode,
  type MeSortState,
} from '../lib/meSort'

type Props = {
  cookbook: CookbookRow
  onBack: () => void
  onOpenRecipe: (id: string) => void
  onEdit: () => void
  onDeleted: () => void
}

function formatCookTime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function recipeCookMinutes(recipe: {
  cleaned_json: {
    total_cook_minutes?: number | null
    prep_time_mins?: number | null
    cook_time_mins?: number | null
    inactive_time_mins?: number | null
  } | null
}): number | null {
  const cj = recipe.cleaned_json
  if (!cj) return null
  const split = (cj.prep_time_mins ?? 0) + (cj.cook_time_mins ?? 0) + (cj.inactive_time_mins ?? 0)
  if (split > 0) return split
  return cj.total_cook_minutes ?? null
}

/** Dark-gradient hero + centered book cover. Theme comes from `theme_color_hex`, or is sampled
 * from the cover when the field is missing. */
export default function CookbookDetailPage({ cookbook, onBack, onOpenRecipe, onEdit, onDeleted }: Props) {
  const { recipes, loading } = useCookbookRecipes(cookbook.id)
  const coverUrl =
    cookbook.cover_image_url ?? recipes.map((r) => usableCoverImage(r.source_image_url)).find(Boolean) ?? null
  const [themeHex, setThemeHex] = useState<string | null>(cookbook.theme_color_hex)
  const [menuAnchor, setMenuAnchor] = useState<PopupAnchor | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortState, setSortState] = useState<MeSortState>(defaultMeSortState())
  const [layoutMode, setLayoutMode] = useState<MeLayoutMode>('list')
  const sortAnchorRef = useRef<HTMLDivElement>(null)

  const sortedRecipes = useMemo(
    () => sortCookbookAssignmentRecipes(recipes, sortState),
    [recipes, sortState],
  )

  useEffect(() => {
    setThemeHex(cookbook.theme_color_hex)
    if (cookbook.theme_color_hex || !coverUrl) return
    let cancelled = false
    void extractDominantColorFromImage(coverUrl).then((hex) => {
      if (!cancelled && hex) setThemeHex(hex)
    })
    return () => {
      cancelled = true
    }
  }, [cookbook.theme_color_hex, coverUrl])

  const mid = themeHex || DEFAULT_COOKBOOK_THEME

  return (
    <div className="fixed inset-0 z-[155] flex flex-col overflow-y-auto bg-white">
      <div
        className="relative flex-none overflow-hidden pb-7 pt-[max(52px,env(safe-area-inset-top,0px))]"
        style={{ background: cookbookHeroGradient(themeHex) }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 9px, rgba(0,0,0,0) 9px 19px)' }}
        />

        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="absolute left-4 top-[max(14px,env(safe-area-inset-top,0px))] z-10 flex h-9 w-9 items-center justify-center border-0 bg-transparent text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition active:opacity-70"
        >
          <ChevronLeft size={20} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          aria-label="More options"
          onClick={(e) => setMenuAnchor({ clientX: e.clientX, clientY: e.clientY })}
          className="absolute right-4 top-[max(14px,env(safe-area-inset-top,0px))] z-10 flex h-9 w-9 items-center justify-center border-0 bg-transparent text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition active:opacity-70"
        >
          <MoreHorizontal size={20} strokeWidth={2.4} />
        </button>

        <div className="relative flex flex-col items-center px-6 pt-2 text-center">
          <span
            className="relative flex w-[148px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] text-white shadow-[0_22px_44px_-14px_rgba(0,0,0,0.6)]"
            style={{ aspectRatio: '3 / 4.4', background: mid }}
          >
            {coverUrl ? (
              <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <BookOpen size={34} strokeWidth={1.5} />
            )}
          </span>

          <h1 className="mt-4 font-editorial text-[30px] font-bold leading-tight text-white">{cookbook.name}</h1>

          <div className="mt-3 font-ui text-[12px] font-medium text-white/80">
            {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
          </div>
        </div>
      </div>

      <main className="flex-1 pb-10 pt-5">
        <div className="px-5">
          {cookbook.description ? <p className="font-ui text-[13.5px] leading-relaxed text-[#332e3d]">{cookbook.description}</p> : null}

          <div className={`flex items-center justify-between gap-3${cookbook.description ? ' mt-6' : ''}`}>
            <h2 className="font-editorial text-[19px] font-semibold text-[#1a0d40]">Inside this book</h2>
            <div ref={sortAnchorRef} className="relative">
              <button
                type="button"
                aria-label="Sort and view options"
                onClick={() => setSortOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center border-0 bg-transparent text-[#111] transition active:opacity-70"
              >
                <SlidersHorizontal size={17} strokeWidth={2} />
              </button>
              <MeSortPopover
                open={sortOpen}
                onClose={() => setSortOpen(false)}
                anchorRef={sortAnchorRef}
                origin="all"
                onOriginChange={() => undefined}
                layoutMode={layoutMode}
                onLayoutModeChange={setLayoutMode}
                state={sortState}
                onChange={setSortState}
                options={RECIPE_SORT_OPTIONS}
                hideOrigin
              />
            </div>
          </div>
        </div>

        <div className="mt-2">
          {loading ? (
            <p className="px-5 pt-6 text-center font-ui text-[13px] text-[#9a9aa0]">Loading…</p>
          ) : sortedRecipes.length === 0 ? (
            <p className="px-5 pt-6 text-center font-ui text-[13px] text-[#9a9aa0]">No recipes in this cookbook yet.</p>
          ) : layoutMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-[6px] px-[6px]">
              {sortedRecipes.map((recipe) => {
                const timeLabel = formatCookTime(recipeCookMinutes(recipe))
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => onOpenRecipe(recipe.id)}
                    className="me-tile-card"
                  >
                    {recipe.source_image_url ? (
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
                    {timeLabel ? (
                      <span className="me-tile-card-time-badge">
                        <Clock size={11} strokeWidth={2.2} />
                        {timeLabel}
                      </span>
                    ) : null}
                    <h3 className="me-tile-card-title">{recipe.title || 'Untitled recipe'}</h3>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col px-5">
              {sortedRecipes.map((recipe) => {
                const timeLabel = formatCookTime(recipeCookMinutes(recipe))
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => onOpenRecipe(recipe.id)}
                    className="flex items-center gap-2.5 border-0 border-b border-[#F4F3F6] bg-transparent py-3 text-left last:border-b-0"
                  >
                    <div className="h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[10px] bg-[#E2DED4]">
                      {recipe.source_image_url ? (
                        <img src={recipe.source_image_url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-editorial text-[16px] font-semibold leading-tight text-[#1A0D40]">
                        {recipe.title || 'Untitled recipe'}
                      </h3>
                      {timeLabel ? (
                        <div className="mt-0.5 flex items-center gap-1 font-ui text-[11px] text-[#9a9aa0]">
                          <Clock size={11} strokeWidth={2.2} />
                          {timeLabel}
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight size={17} strokeWidth={2.2} className="shrink-0 text-[#c4c2c8]" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {menuAnchor ? (
        <AnchoredPopup anchor={menuAnchor} onClose={() => setMenuAnchor(null)} ariaLabel="Cookbook options" widthPx={168}>
          <div className="flex flex-col p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuAnchor(null)
                onEdit()
              }}
              className="rounded-xl border-0 bg-transparent px-3 py-2.5 text-left font-ui text-[14px] font-semibold text-[#1A0D40] transition hover:bg-[#1A0D40]/[0.05]"
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuAnchor(null)
                setConfirmDelete(true)
              }}
              className="rounded-xl border-0 bg-transparent px-3 py-2.5 text-left font-ui text-[14px] font-semibold text-[#c0503a] transition hover:bg-[#c0503a]/[0.06]"
            >
              Delete
            </button>
          </div>
        </AnchoredPopup>
      ) : null}

      {confirmDelete ? (
        <CenteredPopup
          title="Remove cookbook?"
          subtitle="Removes it from your shelf. Recipes stay saved."
          onClose={() => setConfirmDelete(false)}
          widthClassName="max-w-xs"
        >
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={deleting}
              onClick={() => void (async () => {
                setDeleting(true)
                try {
                  await deleteCookbook(cookbook.id)
                  onDeleted()
                } catch {
                  setDeleting(false)
                }
              })()}
              className="flex h-11 w-full items-center justify-center rounded-xl border-0 bg-[#c0503a] font-ui text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {deleting ? 'Removing…' : 'Remove from shelf'}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className="flex h-11 w-full items-center justify-center rounded-xl border-0 bg-[#F5F5F7] font-ui text-[14px] font-semibold text-[#1A0D40]"
            >
              Cancel
            </button>
          </div>
        </CenteredPopup>
      ) : null}
    </div>
  )
}
