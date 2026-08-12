import { useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, Clock, Plus, Search, ShoppingBag, SlidersHorizontal, X, Zap } from 'lucide-react'
import GrocerySortPopover from '../components/GrocerySortPopover'
import GrocerySection from '../components/GrocerySection'
import GroceryListEditSheet from '../components/GroceryListEditSheet'
import IngredientSwapSheet from '../components/IngredientSwapSheet'
import FigsUnderlineTabs from '../components/FigsUnderlineTabs'
import FigsGlassOverlay from '../components/FigsGlassOverlay'
import MeSortPopover from '../components/MeSortPopover'
import { groceryIconFor } from '../lib/groceryIcons'
import { defaultGrocerySortState, groupByCategory, groupByOrigin, isGroupedMode, sortFlat, type DisplayGroceryItem, type GrocerySortMode, type GrocerySortState } from '../lib/grocerySort'
import { resolvePinnedLists, type GroceryItem, type GroceryList, type useGroceryLists } from '../lib/groceryLists'
import { useDragReorder } from '../hooks/useDragReorder'
import { RECIPE_SORT_OPTIONS, defaultMeSortState, sortRecipes, type MeLayoutMode, type MeOriginFilter, type MeSortState } from '../lib/meSort'
import type { useStash } from '../lib/stash'
import type { RecipeRow } from '../lib/recipes'

const GROUP_TABS: { value: GrocerySortMode; label: string }[] = [
  { value: 'addedFrom', label: 'Recipe' },
  { value: 'category', label: 'Category' },
]

type Props = {
  userId: string
  groceries: ReturnType<typeof useGroceryLists>
  stash: ReturnType<typeof useStash>
  recipes: RecipeRow[]
  onBack: () => void
  onOpenRecipe: (recipeId: string) => void
}

function formatCookTime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export default function GroceryListsPage({ userId, groceries, stash, recipes, onBack, onOpenRecipe }: Props) {
  const recipeImageById = useMemo(() => new Map(recipes.map((r) => [r.id, r.source_image_url])), [recipes])
  const [sortOpen, setSortOpen] = useState(false)
  const [sortState, setSortState] = useState<GrocerySortState>(defaultGrocerySortState())
  const [editingList, setEditingList] = useState<GroceryList | null>(null)
  const [creatingList, setCreatingList] = useState(false)
  const [swapItem, setSwapItem] = useState<GroceryItem | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [recipePickerOpen, setRecipePickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerSortOpen, setPickerSortOpen] = useState(false)
  const [pickerSortState, setPickerSortState] = useState<MeSortState>(defaultMeSortState())
  const [pickerLayoutMode, setPickerLayoutMode] = useState<MeLayoutMode>('grid')
  const [pickerOriginFilter, setPickerOriginFilter] = useState<MeOriginFilter>('all')
  const [addedToast, setAddedToast] = useState<string | null>(null)

  const stashItemNames = useMemo(() => stash.items.map((i) => i.name), [stash.items])
  const figsBtnRef = useRef<HTMLButtonElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)

  const { staplesList, defaultList, extraLists } = useMemo(() => resolvePinnedLists(groceries.lists), [groceries.lists])
  const [reordering, setReordering] = useState(false)
  const listDrag = useDragReorder(extraLists, (next) => {
    void groceries.reorderLists(next.map((l) => l.id))
  })
  const defaultListId = defaultList?.id ?? null
  const defaultListItems = useMemo(() => (defaultList ? groceries.itemsByList[defaultList.id] ?? [] : []), [defaultList, groceries.itemsByList])
  const defaultManualItems = useMemo(() => defaultListItems.filter((i) => i.origin_type !== 'recipe'), [defaultListItems])
  const defaultRecipeItems = useMemo(() => defaultListItems.filter((i) => i.origin_type === 'recipe'), [defaultListItems])

  const allActiveItems = useMemo(
    () => groceries.lists.flatMap((list) => groceries.itemsByList[list.id] ?? []),
    [groceries.lists, groceries.itemsByList],
  )

  const categoryMode = sortState.mode === 'category'
  const grouped = isGroupedMode(sortState.mode)
  const categoryGroups = categoryMode ? groupByCategory(allActiveItems) : null
  const addedByYouGroups =
    grouped && !categoryMode
      ? sortState.mode === 'addedFrom'
        ? [{ label: 'Added by you', items: defaultManualItems }]
        : null
      : null
  const addedByYouFlat = grouped ? null : sortFlat(defaultListItems, sortState.mode, sortState.direction)
  const recipeGroups = grouped && sortState.mode === 'addedFrom' ? groupByOrigin(defaultRecipeItems).filter((g) => g.recipeId != null) : []

  const filteredRecipes = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    const searched = !q ? recipes : recipes.filter((r) => (r.title || '').toLowerCase().includes(q))
    return sortRecipes(searched, pickerSortState, pickerOriginFilter, userId)
  }, [recipes, pickerQuery, pickerSortState, pickerOriginFilter, userId])

  const addToDefaultList = async (input: { name: string; qty?: number | null; unit?: string | null }) => {
    if (!defaultListId) return
    await groceries.addItem(defaultListId, input)
  }

  const handleQuickList = () => {
    setMenuOpen(false)
    setCreatingList(true)
  }

  const handleAddFromRecipesClick = () => {
    setMenuOpen(false)
    setPickerQuery('')
    setRecipePickerOpen(true)
  }

  const handleSelectRecipeToImport = async (recipe: (typeof recipes)[0]) => {
    setRecipePickerOpen(false)
    const listName = recipe.title?.trim() || 'Recipe list'
    const listId = await groceries.createList(listName, { recurring: false })
    if (!listId) return

    const ingredients = recipe.cleaned_json?.ingredients ?? []
    if (ingredients.length === 0) {
      await groceries.addItem(listId, {
        name: recipe.title || 'Recipe ingredient',
        qty: null,
        unit: null,
        originType: 'recipe',
        originRecipeId: recipe.id,
        originRecipeTitle: recipe.title || undefined,
      })
    } else {
      for (let i = 0; i < ingredients.length; i++) {
        const ing = ingredients[i]
        const qtyNum = parseFloat(ing.amount)
        await groceries.addItem(listId, {
          name: ing.name,
          qty: Number.isFinite(qtyNum) ? qtyNum : null,
          unit: ing.unit?.trim() || null,
          notes: ing.notes ?? null,
          originType: 'recipe',
          originRecipeId: recipe.id,
          originRecipeTitle: recipe.title || undefined,
          originIngredientIndex: i,
        })
      }
    }

    setAddedToast(`Created list from "${listName}"`)
    setTimeout(() => setAddedToast(null), 3000)
  }

  const draftList: GroceryList = {
    id: 'draft',
    user_id: '',
    name: '',
    created_at: '',
    archived_at: null,
    icon_key: null,
    icon_color: null,
    image_url: null,
    is_recurring: false,
    linked_recipe_id: null,
    position: null,
  }

  /** A category-view row can stand in for several same-name items merged together
   * (`mergeDuplicateItems`) — resolve back to the real underlying rows across every list so a
   * single check/delete tap on the stacked row applies to all of them. */
  const findItemById = (id: string): GroceryItem | undefined => {
    for (const list of groceries.lists) {
      const found = (groceries.itemsByList[list.id] ?? []).find((i) => i.id === id)
      if (found) return found
    }
    return undefined
  }

  const commonRowProps = {
    onToggleItem: (item: GroceryItem) => {
      const mergedIds = (item as DisplayGroceryItem).mergedIds
      if (!mergedIds?.length) {
        void groceries.toggleChecked(item)
        return
      }
      const targetChecked = !item.is_checked
      for (const id of mergedIds) {
        const real = findItemById(id)
        if (real && real.is_checked !== targetChecked) void groceries.toggleChecked(real)
      }
    },
    onEditItem: (item: GroceryItem, patch: { name?: string; qty?: number | null; unit?: string | null }) => void groceries.updateItem(item, patch),
    onDeleteItem: (item: GroceryItem) => {
      const mergedIds = (item as DisplayGroceryItem).mergedIds
      if (!mergedIds?.length) {
        void groceries.deleteItem(item)
        return
      }
      for (const id of mergedIds) {
        const real = findItemById(id)
        if (real) void groceries.deleteItem(real)
      }
    },
    onQuickStash: (item: GroceryItem) => void groceries.quickStashItem(item),
    onLongPressItem: setSwapItem,
    stashItems: stash.items,
  }

  const isPinnedList = (list: GroceryList) => list.id === staplesList?.id || list.id === defaultList?.id

  return (
    <div className="fixed inset-0 z-[155] flex flex-col bg-white">
      <header className="me-top-chrome flex-none" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="explore-chrome-row">
          <div className="explore-chrome-side explore-chrome-side--left">
            <button type="button" onClick={onBack} aria-label="Back" className="flex h-8 w-8 items-center justify-center border-0 bg-transparent text-[#111] transition active:opacity-70">
              <ChevronLeft size={20} strokeWidth={2.25} />
            </button>
          </div>
          <div className="explore-chrome-center">
            <span className="font-editorial text-[20px] font-semibold tracking-[-0.01em] text-[#111]">Groceries</span>
          </div>
          <div className="explore-chrome-side explore-chrome-side--right">
            {reordering ? (
              <button
                type="button"
                onClick={() => setReordering(false)}
                className="rounded-full bg-[#1A0D40] px-3 py-1 font-ui text-[13px] font-semibold text-white"
              >
                Done
              </button>
            ) : null}
          </div>
        </div>

        <div className="relative mt-2.5 flex items-center justify-between mx-[-0.85rem] px-[0.85rem]">
          <div className="flex h-8 min-w-0 flex-1 items-center overflow-x-auto">
            <FigsUnderlineTabs
              ariaLabel="Group by"
              gapClass="gap-5"
              value={sortState.mode}
              onChange={(mode) => setSortState({ mode, direction: 'asc' })}
              options={GROUP_TABS}
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
          <GrocerySortPopover open={sortOpen} onClose={() => setSortOpen(false)} state={sortState} onChange={setSortState} hideGroupRows />
        </div>
      </header>

      {addedToast ? (
        <div className="fixed top-16 left-1/2 z-[220] -translate-x-1/2 rounded-full bg-[#1A0D40] px-4 py-2 text-xs font-semibold text-white shadow-lg transition-all animate-in fade-in slide-in-from-top-2">
          {addedToast}
        </div>
      ) : null}

      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-1">
        {groceries.lists.length === 0 && !groceries.loading ? (
          <p className="pt-10 text-center font-ui text-[13px] text-[#9a9aa0]">No grocery lists yet.</p>
        ) : null}

        {categoryMode ? (
          categoryGroups?.length ? (
            categoryGroups.map((group) => (
              <GrocerySection
                key={group.label}
                icon={ShoppingBag}
                label={group.label}
                items={group.items}
                onAddItem={addToDefaultList}
                {...commonRowProps}
              />
            ))
          ) : !groceries.loading ? (
            <p className="pt-10 text-center font-ui text-[13px] text-[#9a9aa0]">No grocery items yet.</p>
          ) : null
        ) : (
          <>
            {staplesList ? (
              <GrocerySection
                key={staplesList.id}
                icon={groceryIconFor(staplesList.icon_key)}
                iconColor={staplesList.icon_color}
                label="Staples"
                items={groceries.itemsByList[staplesList.id] ?? []}
                showRecurringIcon
                onEditList={() => setEditingList(staplesList)}
                onAddItem={(input) => groceries.addItem(staplesList.id, input)}
                {...commonRowProps}
              />
            ) : null}

            {addedByYouGroups
              ? addedByYouGroups.map((group) => (
                  <GrocerySection
                    key={group.label}
                    icon={groceryIconFor(defaultList?.icon_key)}
                    iconColor={defaultList?.icon_color}
                    label={group.label}
                    items={group.items}
                    onEditList={group.label === 'Added by you' && defaultList ? () => setEditingList(defaultList) : undefined}
                    onAddItem={addToDefaultList}
                    {...commonRowProps}
                  />
                ))
              : defaultList
                ? (
                    <GrocerySection
                      icon={groceryIconFor(defaultList.icon_key)}
                      iconColor={defaultList.icon_color}
                      label="Added by you"
                      items={addedByYouFlat ?? []}
                      onEditList={() => setEditingList(defaultList)}
                      onAddItem={addToDefaultList}
                      {...commonRowProps}
                    />
                  )
                : null}

            {extraLists.map((list, index) => {
              const listItems = groceries.itemsByList[list.id] ?? []
              const recipeIds = [
                ...new Set(
                  listItems
                    .filter((i) => i.origin_type === 'recipe' && i.origin_recipe_id)
                    .map((i) => i.origin_recipe_id as string),
                ),
              ]
              const recipeDerivedId = recipeIds.length === 1 ? recipeIds[0] : null
              return (
                <div key={list.id} ref={listDrag.setRef(index)}>
                  <GrocerySection
                    icon={groceryIconFor(list.icon_key)}
                    iconColor={recipeDerivedId ? undefined : list.icon_color}
                    imageUrl={recipeDerivedId ? recipeImageById.get(recipeDerivedId) ?? null : null}
                    recipeTitleStyle={Boolean(recipeDerivedId)}
                    label={list.name}
                    items={listItems}
                    showRecurringIcon={list.is_recurring}
                    onHeaderClick={recipeDerivedId ? () => onOpenRecipe(recipeDerivedId) : undefined}
                    onEditList={recipeDerivedId ? undefined : () => setEditingList(list)}
                    onDeleteList={() => void groceries.deleteList(list.id)}
                    onAddItem={(input) => groceries.addItem(list.id, input)}
                    reordering={reordering}
                    dragHandleProps={{ onPointerDown: listDrag.startDrag(index) }}
                    onHeaderLongPress={() => setReordering(true)}
                    {...commonRowProps}
                  />
                </div>
              )
            })}

            {recipeGroups.map((group) => (
              <GrocerySection
                key={group.label}
                icon={BookOpen}
                imageUrl={recipeImageById.get(group.recipeId!) ?? null}
                recipeTitleStyle
                label={group.label}
                items={group.items}
                onHeaderClick={() => onOpenRecipe(group.recipeId!)}
                onAddItem={addToDefaultList}
                {...commonRowProps}
              />
            ))}
          </>
        )}
      </main>

      <div
        className="fixed z-[190] pointer-events-auto"
        style={{
          bottom: 'var(--figs-fab-bottom, 0px)',
          right: 'var(--figs-fab-right, 0.2rem)',
          ['--figs-plus-size' as string]: '3.7rem',
          ['--figs-tab-icon-size' as string]: '1.36rem',
        }}
      >
        <button
          ref={figsBtnRef}
          type="button"
          className={`figs-tab-bar-plus${menuOpen ? ' figs-tab-bar-plus--open' : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Create menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <img src="/figs_logo_fig.png" alt="" className="figs-tab-bar-plus-shape" draggable={false} />
          {menuOpen ? (
            <X className="figs-tab-bar-icon" strokeWidth={2.35} aria-hidden />
          ) : (
            <Plus className="figs-tab-bar-icon" strokeWidth={2.35} aria-hidden />
          )}
        </button>
      </div>

      {menuOpen ? (
        <FigsGlassOverlay
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          label="Close menu"
          panelRef={menuPanelRef}
          panelStyle={{
            position: 'fixed',
            bottom: 72,
            right: 20,
            width: 200,
            zIndex: 200,
          }}
        >
          <div className="flex flex-col p-1.5">
            <button
              type="button"
              onClick={handleQuickList}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-ui text-[13.5px] font-semibold text-[#111] hover:bg-black/5 active:bg-black/10"
            >
              <Zap size={17} strokeWidth={2.2} className="text-[#1A0D40]" />
              Quick List
            </button>
            <button
              type="button"
              onClick={handleAddFromRecipesClick}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-ui text-[13.5px] font-semibold text-[#111] hover:bg-black/5 active:bg-black/10"
            >
              <BookOpen size={17} strokeWidth={2} className="text-[#1A0D40]" />
              Add from Recipes
            </button>
          </div>
        </FigsGlassOverlay>
      ) : null}

      {recipePickerOpen ? (
        <div className="fixed inset-0 z-[220] flex flex-col bg-white animate-in slide-in-from-bottom duration-200">
          <header className="me-top-chrome flex-none" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div className="explore-chrome-row">
              <div className="explore-chrome-side explore-chrome-side--left">
                <button
                  type="button"
                  onClick={() => setRecipePickerOpen(false)}
                  aria-label="Back"
                  className="flex h-8 w-8 items-center justify-center border-0 bg-transparent text-[#111] transition active:opacity-70"
                >
                  <ChevronLeft size={20} strokeWidth={2.25} />
                </button>
              </div>
              <div className="explore-chrome-center">
                <span className="font-editorial text-[19px] font-semibold tracking-[-0.01em] text-[#111]">Add from Recipes</span>
              </div>
              <div className="explore-chrome-side explore-chrome-side--right">
                <div className="relative flex items-center">
                  <button
                    type="button"
                    aria-label="Sort and view options"
                    onClick={() => setPickerSortOpen((v) => !v)}
                    className="relative flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent text-[#111] transition active:opacity-70"
                  >
                    <SlidersHorizontal size={17} strokeWidth={2} />
                  </button>
                  <MeSortPopover
                    open={pickerSortOpen}
                    onClose={() => setPickerSortOpen(false)}
                    origin={pickerOriginFilter}
                    onOriginChange={setPickerOriginFilter}
                    layoutMode={pickerLayoutMode}
                    onLayoutModeChange={setPickerLayoutMode}
                    state={pickerSortState}
                    onChange={setPickerSortState}
                    options={RECIPE_SORT_OPTIONS}
                  />
                </div>
              </div>
            </div>
          </header>

          <main className={`flex-1 overflow-y-auto pb-28 ${pickerLayoutMode === 'list' ? 'px-4 pt-2' : 'pt-2'}`}>
            {filteredRecipes.length === 0 ? (
              <p className="py-16 text-center font-ui text-[13.5px] text-[#9a9aa0]">
                {recipes.length === 0 ? 'No saved recipes found.' : 'Nothing matches your search.'}
              </p>
            ) : pickerLayoutMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-[6px] px-[6px]">
                {filteredRecipes.map((r) => {
                  const timeLabel = formatCookTime(r.cleaned_json?.total_cook_minutes)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void handleSelectRecipeToImport(r)}
                      className="me-tile-card relative"
                    >
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
                        <span className="me-tile-card-time-badge">
                          <Clock size={11} strokeWidth={2.2} />
                          {timeLabel}
                        </span>
                      ) : null}
                      <h3 className="me-tile-card-title">{r.title || 'Untitled recipe'}</h3>
                      <span className="absolute top-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-[#1A0D40]/90 text-white shadow-md">
                        <Plus size={16} strokeWidth={2.4} />
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredRecipes.map((r) => {
                  const timeLabel = formatCookTime(r.cleaned_json?.total_cook_minutes)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void handleSelectRecipeToImport(r)}
                      className="flex items-center gap-3.5 border-0 bg-transparent py-2.5 text-left"
                    >
                      <div className="h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[10px] bg-[#E2DED4]">
                        {r.source_image_url ? (
                          <img
                            src={r.source_image_url}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-ui text-[15.5px] font-bold leading-tight text-[#1A0D40]">
                          {r.title || 'Untitled recipe'}
                        </h3>
                        {timeLabel ? (
                          <div className="mt-0.5 font-ui text-[11px] text-[#9a9aa0]">{timeLabel}</div>
                        ) : null}
                      </div>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A0D40] text-white">
                        <Plus size={16} strokeWidth={2.4} />
                      </span>
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
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search your recipes"
                className="min-w-0 flex-1 border-0 bg-transparent font-ui text-[13.5px] text-[#111] outline-none placeholder:text-[#9a9aa0]"
              />
              {pickerQuery ? (
                <button
                  type="button"
                  onClick={() => setPickerQuery('')}
                  aria-label="Clear search"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-0 bg-[#F0EDE7] text-[#6e6e73]"
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              ) : null}
            </div>
          </nav>
        </div>
      ) : null}

      {creatingList ? (
        <GroceryListEditSheet
          list={draftList}
          createMode
          onClose={() => setCreatingList(false)}
          onRename={() => {}}
          onChangeAppearance={() => {}}
          onCreate={async ({ name, iconKey, iconColor, recurring }) => {
            const id = await groceries.createList(name, { recurring })
            if (id) await groceries.updateListAppearance(id, { iconKey, iconColor })
          }}
        />
      ) : editingList ? (
        <GroceryListEditSheet
          list={editingList}
          onClose={() => setEditingList(null)}
          onRename={(name) => groceries.renameList(editingList.id, name)}
          onChangeAppearance={(patch) => groceries.updateListAppearance(editingList.id, patch)}
          onToggleRecurring={isPinnedList(editingList) ? undefined : () => void groceries.toggleRecurring(editingList.id)}
          onDelete={
            isPinnedList(editingList)
              ? undefined
              : () => {
                  void groceries.deleteList(editingList.id)
                  setEditingList(null)
                }
          }
        />
      ) : null}

      {swapItem ? (
        <IngredientSwapSheet
          ingredientName={swapItem.name}
          history={[swapItem.name]}
          amount={swapItem.qty != null ? String(swapItem.qty) : undefined}
          unit={swapItem.unit ?? undefined}
          authorNotes={swapItem.notes}
          userId={userId}
          stashItemNames={stashItemNames}
          recipeId={swapItem.origin_recipe_id ?? undefined}
          inStash={false}
          onClose={() => setSwapItem(null)}
          onSwap={(newName) => {
            void groceries.updateItem(swapItem, { name: newName })
            setSwapItem(null)
          }}
          onSelectHistory={() => {}}
        />
      ) : null}
    </div>
  )
}
