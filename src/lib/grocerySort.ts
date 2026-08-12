import { GROCERY_AISLE_ORDER, inferGroceryCategory, type GroceryItem } from './groceryLists'

export type GrocerySortMode = 'addedFrom' | 'category' | 'alphabetical' | 'recent'
export type GrocerySortDirection = 'asc' | 'desc'

export type GrocerySortState = {
  mode: GrocerySortMode
  direction: GrocerySortDirection
}

export function defaultGrocerySortState(): GrocerySortState {
  return { mode: 'addedFrom', direction: 'asc' }
}

/** "addedFrom" and "category" are grouped views (section headers); the rest are flat sorts. */
export function isGroupedMode(mode: GrocerySortMode): boolean {
  return mode === 'addedFrom' || mode === 'category'
}

export type GroceryGroup = { label: string; items: GroceryItem[]; recipeId?: string | null }

export function groupByOrigin(items: GroceryItem[]): GroceryGroup[] {
  const manual = items.filter((i) => i.origin_type !== 'recipe')
  const byRecipe = new Map<string, { title: string; items: GroceryItem[]; recipeId: string | null }>()
  for (const item of items) {
    if (item.origin_type !== 'recipe') continue
    const key = item.origin_recipe_id ?? item.origin_recipe_title ?? 'recipe'
    const bucket = byRecipe.get(key) ?? { title: item.origin_recipe_title || 'Recipe', items: [], recipeId: item.origin_recipe_id ?? null }
    bucket.items.push(item)
    byRecipe.set(key, bucket)
  }
  const groups: GroceryGroup[] = []
  if (manual.length) groups.push({ label: 'Added by you', items: manual })
  for (const bucket of byRecipe.values()) groups.push({ label: bucket.title, items: bucket.items, recipeId: bucket.recipeId })
  return groups
}

/** "spices & seasoning" -> "Spices & seasoning" for section headers. */
function titleCaseCategory(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1)
}

/** A category-view row that stands in for 2+ identically-named grocery items (e.g. "garlic" added
 * from two different recipes). `mergedIds` carries every underlying row's real id so callers can
 * fan check/delete actions out to all of them — the merged row itself isn't a real DB row. */
export type DisplayGroceryItem = GroceryItem & { mergedIds?: string[] }

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Merges same-name items within a category bucket into one display row: quantities are summed
 * when every merged item shares the same unit, otherwise the first item's qty/unit is kept as the
 * displayed amount. The row shows checked only once every underlying item is checked. */
export function mergeDuplicateItems(items: GroceryItem[]): DisplayGroceryItem[] {
  const buckets = new Map<string, GroceryItem[]>()
  const order: string[] = []
  for (const item of items) {
    const key = normalizeItemName(item.name)
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(item)
  }
  return order.map((key) => {
    const group = buckets.get(key)!
    if (group.length === 1) return group[0]
    const primary = group[0]
    const sameUnit = group.every(
      (i) => (i.unit ?? '').trim().toLowerCase() === (primary.unit ?? '').trim().toLowerCase(),
    )
    const allNumericQty = group.every((i) => i.qty != null)
    const qty = sameUnit && allNumericQty ? group.reduce((sum, i) => sum + (i.qty ?? 0), 0) : primary.qty
    return {
      ...primary,
      qty,
      is_checked: group.every((i) => i.is_checked),
      mergedIds: group.map((i) => i.id),
    }
  })
}

export function groupByCategory(items: GroceryItem[]): GroceryGroup[] {
  const groups: Record<string, GroceryItem[]> = {}
  for (const item of items) {
    // Always recompute from the name rather than trusting a possibly-stale `inferred_category`
    // (older rows may still carry a pre-fix legacy category label) — keeps grouping self-healing.
    const cat = inferGroceryCategory(item.name)
    groups[cat] = groups[cat] ?? []
    groups[cat].push(item)
  }
  return GROCERY_AISLE_ORDER.filter((cat) => groups[cat]?.length).map((cat) => ({
    label: titleCaseCategory(cat),
    items: mergeDuplicateItems(groups[cat]),
  }))
}

export function sortFlat(items: GroceryItem[], mode: GrocerySortMode, direction: GrocerySortDirection): GroceryItem[] {
  const dir = direction === 'asc' ? 1 : -1
  const sorted = [...items]
  if (mode === 'alphabetical') {
    sorted.sort((a, b) => dir * a.name.localeCompare(b.name))
  } else if (mode === 'recent') {
    sorted.sort((a, b) => dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
  }
  return sorted
}
