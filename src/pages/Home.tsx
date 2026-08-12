import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { useStash } from '../lib/stash'
import { resolvePinnedLists, type GroceryItem, type GroceryList, type useGroceryLists } from '../lib/groceryLists'
import GrocerySection from '../components/GrocerySection'
import GroceryListEditSheet from '../components/GroceryListEditSheet'
import IngredientSwapSheet from '../components/IngredientSwapSheet'
import { groceryIconFor } from '../lib/groceryIcons'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function useLiveDateGreeting() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return useMemo(() => {
    const dateLabel = `${DAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()}`
    const hour = now.getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    return { dateLabel, greeting }
  }, [now])
}

type Props = {
  userId: string
  username?: string | null
  stash: ReturnType<typeof useStash>
  groceries: ReturnType<typeof useGroceryLists>
  recipes?: { id: string; source_image_url: string | null }[]
  focusListId: string | null
  onOpenStash: () => void
  onOpenRecipe?: (recipeId: string) => void
  onOpenGroceryLists: () => void
  onEditSheetToggle?: (open: boolean) => void
}

export default function HomePage({
  userId,
  username,
  stash,
  groceries,
  recipes = [],
  onOpenStash,
  onOpenRecipe,
  onOpenGroceryLists,
  onEditSheetToggle,
}: Props) {
  const { dateLabel, greeting } = useLiveDateGreeting()
  const displayName = username ? username.charAt(0).toUpperCase() + username.slice(1) : 'there'
  const { summary } = stash
  const [editingList, setEditingList] = useState<GroceryList | null>(null)
  const [swapItem, setSwapItem] = useState<GroceryItem | null>(null)
  const stashItemNames = useMemo(() => stash.items.map((i) => i.name), [stash.items])
  const recipeImageById = useMemo(() => new Map(recipes.map((r) => [r.id, r.source_image_url])), [recipes])

  const { staplesList, defaultList, extraLists } = useMemo(() => resolvePinnedLists(groceries.lists), [groceries.lists])

  useEffect(() => {
    onEditSheetToggle?.(editingList != null)
  }, [editingList, onEditSheetToggle])

  const freshness = useMemo(() => {
    const fresh = Math.max(0, summary.total - summary.expiring - summary.low)
    return { fresh, low: summary.low, expiring: summary.expiring }
  }, [summary.total, summary.expiring, summary.low])

  const commonRowProps = {
    onToggleItem: (item: GroceryItem) => void groceries.toggleChecked(item),
    onEditItem: (item: GroceryItem, patch: { name?: string; qty?: number | null; unit?: string | null }) =>
      void groceries.updateItem(item, patch),
    onDeleteItem: (item: GroceryItem) => void groceries.deleteItem(item),
    onQuickStash: (item: GroceryItem) => void groceries.quickStashItem(item),
    onLongPressItem: setSwapItem,
    stashItems: stash.items,
  }

  const addToDefaultList = async (input: { name: string; qty?: number | null; unit?: string | null }) => {
    if (!defaultList?.id) return
    await groceries.addItem(defaultList.id, input)
  }

  return (
    <div className="home-page" data-figs-scroll>

      {/* ══ Header ══ */}
      <header className="me-top-chrome">
        <div className="explore-chrome-row">
          <div className="explore-chrome-side explore-chrome-side--left" />
          <div className="explore-chrome-center">
            <span className="font-editorial text-[22px] font-medium leading-7 tracking-[-0.02em] text-[#111111]">
              figs
            </span>
          </div>
          <div className="explore-chrome-side explore-chrome-side--right" />
        </div>
      </header>

      <main className="home-body">
        {/* Greeting */}
        <div className="home-greeting">
          <div className="home-greeting-date">{dateLabel}</div>
          <h1 className="home-greeting-headline">
            {greeting}, {displayName}
          </h1>
        </div>

        {/* ═══ STASH — Aurora hero ═══ */}
        <section className="home-section" style={{ paddingTop: 26 }}>
          <div
            className="home-aurora-stash"
            onClick={onOpenStash}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpenStash()
              }
            }}
          >
            <div className="home-aurora-stash-glow" aria-hidden />
            {summary.total === 0 ? (
              <div className="home-aurora-stash-empty">
                <span className="home-aurora-stash-empty-title">Add to your stash</span>
                <span className="home-aurora-stash-chevron">
                  <ChevronRight size={20} strokeWidth={2.2} />
                </span>
              </div>
            ) : (
              <div className="home-aurora-stash-inner">
                <div className="home-aurora-stash-top">
                  <span className="home-aurora-stash-eyebrow">Your kitchen</span>
                  <span className="home-aurora-stash-chevron">
                    <ChevronRight size={15} strokeWidth={2.2} />
                  </span>
                </div>
                <div className="home-aurora-stash-count-row">
                  <span className="home-aurora-stash-count">{summary.total}</span>
                  <span className="home-aurora-stash-count-label">
                    {summary.total === 1 ? 'item in your stash' : 'items in your stash'}
                  </span>
                </div>
                <div className="home-aurora-stash-meter" aria-hidden>
                  {freshness.fresh > 0 ? (
                    <div className="home-aurora-stash-meter-seg home-aurora-stash-meter-seg--fresh" style={{ flex: freshness.fresh }} />
                  ) : null}
                  {freshness.low > 0 ? (
                    <div className="home-aurora-stash-meter-seg home-aurora-stash-meter-seg--low" style={{ flex: freshness.low }} />
                  ) : null}
                  {freshness.expiring > 0 ? (
                    <div className="home-aurora-stash-meter-seg home-aurora-stash-meter-seg--expiring" style={{ flex: freshness.expiring }} />
                  ) : null}
                </div>
                <div className="home-aurora-stash-legend">
                  <span>
                    <i className="home-aurora-stash-dot home-aurora-stash-dot--fresh" />
                    {freshness.fresh} fresh
                  </span>
                  <span>
                    <i className="home-aurora-stash-dot home-aurora-stash-dot--low" />
                    {freshness.low} low
                  </span>
                  <span>
                    <i className="home-aurora-stash-dot home-aurora-stash-dot--expiring" />
                    {freshness.expiring} expiring
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ═══ GROCERIES ═══ */}
        <section className="home-section" style={{ paddingTop: 30, paddingBottom: 32 }}>
          <div className="home-section-header home-section-header--aurora" style={{ alignItems: 'baseline' }}>
            <h2 className="home-section-title home-section-title--aurora">Groceries</h2>
            <button type="button" className="home-see-all home-see-all--aurora" onClick={onOpenGroceryLists} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}>
              See all
            </button>
          </div>

          <div className="home-grocery-shell">
            {groceries.lists.length === 0 && !groceries.loading ? (
              <p style={{ padding: '16px 18px', fontFamily: 'var(--font-ui)', fontSize: 13, color: '#9a9aa0' }}>
                No grocery lists yet.
              </p>
            ) : null}

            {staplesList ? (
              <GrocerySection
                key={staplesList.id}
                icon={groceryIconFor(staplesList.icon_key)}
                iconColor={staplesList.icon_color}
                label="Staples"
                items={groceries.itemsByList[staplesList.id] ?? []}
                showRecurringIcon
                onHeaderClick={onOpenGroceryLists}
                onAddItem={(input) => groceries.addItem(staplesList.id, input)}
                {...commonRowProps}
              />
            ) : null}

            {defaultList ? (
              <GrocerySection
                icon={groceryIconFor(defaultList.icon_key)}
                iconColor={defaultList.icon_color}
                label="Added by you"
                items={groceries.itemsByList[defaultList.id] ?? []}
                onHeaderClick={onOpenGroceryLists}
                onAddItem={addToDefaultList}
                {...commonRowProps}
              />
            ) : null}

            {extraLists.map((list) => {
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
                <GrocerySection
                  key={list.id}
                  icon={groceryIconFor(list.icon_key)}
                  iconColor={recipeDerivedId ? undefined : list.icon_color}
                  imageUrl={recipeDerivedId ? recipeImageById.get(recipeDerivedId) ?? null : null}
                  recipeTitleStyle={Boolean(recipeDerivedId)}
                  label={list.name}
                  items={listItems}
                  showRecurringIcon={list.is_recurring}
                  onHeaderClick={recipeDerivedId ? () => onOpenRecipe?.(recipeDerivedId) : onOpenGroceryLists}
                  onAddItem={(input) => groceries.addItem(list.id, input)}
                  {...commonRowProps}
                />
              )
            })}
          </div>
        </section>
      </main>

      {editingList ? (
        <GroceryListEditSheet
          list={editingList}
          onClose={() => setEditingList(null)}
          onRename={(name) => groceries.renameList(editingList.id, name)}
          onChangeAppearance={(patch) => groceries.updateListAppearance(editingList.id, patch)}
          onToggleRecurring={
            editingList.id === staplesList?.id || editingList.id === defaultList?.id
              ? undefined
              : () => void groceries.toggleRecurring(editingList.id)
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
