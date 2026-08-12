import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { expiryDateFor, shelfLifeDays, suggestZoneForCategory } from './stashCategories'
import { FIGS_CATEGORIES, inferFigsCategoryFromName, type FigsCategory } from './stashTaxonomy'
import { enrichStashItemNutrition } from './nutrition'
import { mergeComputedAttributes } from './attributeFormulas'

export type GroceryList = {
  id: string
  user_id: string
  name: string
  created_at: string
  archived_at: string | null
  icon_key: string | null
  icon_color: string | null
  image_url: string | null
  is_recurring: boolean
  /** When set, this list is a shopping list linked to a specific recipe. */
  linked_recipe_id: string | null
  /** User-chosen display order (drag-to-reorder) — nullable for rows created before this column
   * existed; falls back to `created_at` order when null. */
  position: number | null
}

export type GroceryItem = {
  id: string
  user_id: string
  list_id: string
  name: string
  qty: number | null
  unit: string | null
  is_checked: boolean
  inferred_category: string | null
  created_at: string
  origin_type: 'manual' | 'recipe'
  origin_recipe_id: string | null
  origin_recipe_title: string | null
  /** Index of the source ingredient within that recipe's ingredient list — lets a later ingredient
   * swap in the recipe find and update this item instead of leaving a stale copy behind. */
  origin_ingredient_index: number | null
  utility_tags: string[]
  attributes: string[]
  notes: string | null
}

/** Grocery category grouping order — mirrors the same 16-category `FIGS_CATEGORIES` taxonomy
 * Stash items are tagged with (via the AI intake scan), so a "Spices & seasoning" section shows
 * up here too instead of everything non-obvious being dumped into a generic "Other" bucket. */
export const GROCERY_AISLE_ORDER: FigsCategory[] = [...FIGS_CATEGORIES]

export function inferGroceryCategory(name: string): FigsCategory {
  return inferFigsCategoryFromName(name)
}

/** The two permanent, non-deletable pinned lists: "Staples" is the first recurring list ever
 * created, "Added by you" is the first non-recurring list ever created (both by creation-order
 * convention, not a dedicated flag). Every other real list — extra recurring lists, or extra
 * dated "Jul 22 - List" lists a user creates — is a regular, deletable/recurring-togglable list.
 * Shared by `Home.tsx` and `GroceryLists.tsx` so both pages agree on ordering. */
export function resolvePinnedLists(lists: GroceryList[]): {
  staplesList: GroceryList | null
  defaultList: GroceryList | null
  extraLists: GroceryList[]
} {
  const recurring = lists.filter((l) => l.is_recurring)
  const nonRecurring = lists.filter((l) => !l.is_recurring)
  const staplesList = recurring[0] ?? null
  const defaultList = nonRecurring[0] ?? null
  const extraLists = lists.filter((l) => l.id !== staplesList?.id && l.id !== defaultList?.id)
  return { staplesList, defaultList, extraLists }
}

function defaultListName(): string {
  const d = new Date()
  const dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${dateLabel} - List`
}

const GROCERY_ITEM_COLUMNS =
  'id, user_id, list_id, name, qty, unit, is_checked, inferred_category, created_at, origin_type, origin_recipe_id, origin_recipe_title, origin_ingredient_index, utility_tags, attributes, notes'
const GROCERY_LIST_COLUMNS =
  'id, user_id, name, created_at, archived_at, icon_key, icon_color, image_url, is_recurring, linked_recipe_id, position'

/** Loads all of a user's active grocery lists + their items. Simple, no debounced patch queue for v0. */
export function useGroceryLists(userId: string | null | undefined) {
  const [lists, setLists] = useState<GroceryList[]>([])
  const [itemsByList, setItemsByList] = useState<Record<string, GroceryItem[]>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setLists([])
      setItemsByList({})
      setLoading(false)
      return
    }
    setLoading(true)
    let listRows: Record<string, unknown>[] | null = null
    {
      const full = await supabase
        .from('grocery_lists')
        .select(GROCERY_LIST_COLUMNS)
        .eq('user_id', userId)
        .is('archived_at', null)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (full.error && /(linked_recipe_id|position)/i.test(full.error.message)) {
        const fallback = await supabase
          .from('grocery_lists')
          .select('id, user_id, name, created_at, archived_at, icon_key, icon_color, image_url, is_recurring')
          .eq('user_id', userId)
          .is('archived_at', null)
          .order('created_at', { ascending: true })
        listRows = (fallback.data as Record<string, unknown>[] | null) ?? null
      } else {
        listRows = (full.data as Record<string, unknown>[] | null) ?? null
      }
    }

    const { data: itemRows } = await supabase
      .from('grocery_items')
      .select(GROCERY_ITEM_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    const grouped: Record<string, GroceryItem[]> = {}
    for (const item of (itemRows ?? []) as GroceryItem[]) {
      if (!item.list_id) continue
      grouped[item.list_id] = grouped[item.list_id] ?? []
      grouped[item.list_id].push(item)
    }

    setLists(
      ((listRows ?? []) as GroceryList[]).map((l) => ({
        ...l,
        linked_recipe_id: l.linked_recipe_id ?? null,
        position: l.position ?? null,
      })),
    )
    setItemsByList(grouped)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const createList = useCallback(
    async (
      name?: string,
      opts?: { recurring?: boolean; linkedRecipeId?: string | null; imageUrl?: string | null; iconKey?: string | null; iconColor?: string | null },
    ) => {
      if (!supabase || !userId) return null
      const nextPosition = lists.reduce((max, l) => Math.max(max, l.position ?? 0), 0) + 1
      const payload: Record<string, unknown> = {
        user_id: userId,
        name: name?.trim() || defaultListName(),
        is_recurring: opts?.recurring ?? false,
        position: nextPosition,
      }
      if (opts?.linkedRecipeId) payload.linked_recipe_id = opts.linkedRecipeId
      if (opts?.imageUrl) payload.image_url = opts.imageUrl
      if (opts?.iconKey) payload.icon_key = opts.iconKey
      if (opts?.iconColor) payload.icon_color = opts.iconColor
      const { data, error } = await supabase
        .from('grocery_lists')
        .insert(payload)
        .select(GROCERY_LIST_COLUMNS)
        .single()
      if (error || !data) {
        // Column may be missing before migration — retry without linked_recipe_id/position.
        if (error && /(linked_recipe_id|position)/i.test(error.message)) {
          const { data: fallback, error: err2 } = await supabase
            .from('grocery_lists')
            .insert({
              user_id: userId,
              name: name?.trim() || defaultListName(),
              is_recurring: opts?.recurring ?? false,
              image_url: opts?.imageUrl ?? null,
              icon_key: opts?.iconKey ?? null,
              icon_color: opts?.iconColor ?? null,
            })
            .select('id, user_id, name, created_at, archived_at, icon_key, icon_color, image_url, is_recurring')
            .single()
          if (err2 || !fallback) return null
          const row = { ...(fallback as GroceryList), linked_recipe_id: opts?.linkedRecipeId ?? null, position: null }
          setLists((prev) => [...prev, row])
          return fallback.id as string
        }
        return null
      }
      setLists((prev) => [...prev, data as GroceryList])
      return data.id as string
    },
    [userId, lists],
  )

  // Guarantee the two pinned lists (a recurring "Staples" list, a non-recurring default list for
  // "Added by you") exist for every user — lives at the hook level, not scoped to any one page, so
  // a user who's only ever opened Home (and never the full Grocery Lists page) still gets both.
  // Re-checked reactively (not just on first mount) so deleting/un-recurring the last one always
  // leaves a fresh one behind.
  const creatingStaplesRef = useRef(false)
  const creatingDefaultRef = useRef(false)
  useEffect(() => {
    if (loading || creatingStaplesRef.current) return
    if (lists.some((l) => l.is_recurring)) return
    creatingStaplesRef.current = true
    void createList('Staples', { recurring: true }).finally(() => {
      creatingStaplesRef.current = false
    })
  }, [loading, lists, createList])
  useEffect(() => {
    if (loading || creatingDefaultRef.current) return
    if (lists.some((l) => !l.is_recurring)) return
    creatingDefaultRef.current = true
    void createList('Grocery').finally(() => {
      creatingDefaultRef.current = false
    })
  }, [loading, lists, createList])

  const renameList = useCallback(async (listId: string, name: string) => {
    if (!supabase) return
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name } : l)))
    await supabase.from('grocery_lists').update({ name }).eq('id', listId)
  }, [])

  const updateListAppearance = useCallback(
    async (listId: string, patch: { iconKey?: string | null; iconColor?: string | null; imageUrl?: string | null }) => {
      if (!supabase) return
      const dbPatch: Record<string, unknown> = {}
      if (patch.iconKey !== undefined) dbPatch.icon_key = patch.iconKey
      if (patch.iconColor !== undefined) dbPatch.icon_color = patch.iconColor
      if (patch.imageUrl !== undefined) dbPatch.image_url = patch.imageUrl
      setLists((prev) =>
        prev.map((l) =>
          l.id === listId
            ? {
                ...l,
                icon_key: patch.iconKey !== undefined ? patch.iconKey : l.icon_key,
                icon_color: patch.iconColor !== undefined ? patch.iconColor : l.icon_color,
                image_url: patch.imageUrl !== undefined ? patch.imageUrl : l.image_url,
              }
            : l,
        ),
      )
      await supabase.from('grocery_lists').update(dbPatch).eq('id', listId)
    },
    [],
  )

  const toggleRecurring = useCallback(
    async (listId: string) => {
      const current = lists.find((l) => l.id === listId)
      if (!current || !supabase) return
      const next = !current.is_recurring
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, is_recurring: next } : l)))
      await supabase.from('grocery_lists').update({ is_recurring: next }).eq('id', listId)
    },
    [lists],
  )

  const deleteList = useCallback(async (listId: string) => {
    if (!supabase) return
    setLists((prev) => prev.filter((l) => l.id !== listId))
    setItemsByList((prev) => {
      const next = { ...prev }
      delete next[listId]
      return next
    })
    await supabase.from('grocery_lists').update({ archived_at: new Date().toISOString() }).eq('id', listId)
  }, [])

  /** Persists a drag-to-reorder result for a subset of lists (e.g. just the reorderable "extra"
   * lists) — assigns fresh sequential `position` values in the given order and updates every
   * other list's relative ordering by leaving it untouched (positions outside `orderedIds` are
   * left alone; callers only pass the ids of lists that participate in reordering). */
  const reorderLists = useCallback(async (orderedIds: string[]) => {
    if (!supabase) return
    const basePosition = lists.reduce((max, l) => Math.max(max, l.position ?? 0), 0) + 1
    const positionById = new Map(orderedIds.map((id, i) => [id, basePosition + i]))
    setLists((prev) =>
      prev
        .map((l) => (positionById.has(l.id) ? { ...l, position: positionById.get(l.id)! } : l))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    )
    await Promise.all(
      orderedIds.map((id, i) =>
        supabase!.from('grocery_lists').update({ position: basePosition + i }).eq('id', id),
      ),
    )
  }, [lists])

  const addItem = useCallback(
    async (
      listId: string,
      input: {
        name: string
        qty?: number | null
        unit?: string | null
        originType?: 'manual' | 'recipe'
        originRecipeId?: string | null
        originRecipeTitle?: string | null
        originIngredientIndex?: number | null
        notes?: string | null
      },
    ) => {
      if (!supabase || !userId) return
      const payload = {
        user_id: userId,
        list_id: listId,
        name: input.name.trim(),
        qty: input.qty ?? null,
        unit: input.unit != null && String(input.unit).trim() !== '' ? String(input.unit).trim() : null,
        inferred_category: inferGroceryCategory(input.name),
        is_checked: false,
        origin_type: input.originType ?? 'manual',
        origin_recipe_id: input.originRecipeId ?? null,
        origin_recipe_title: input.originRecipeTitle ?? null,
        origin_ingredient_index: input.originIngredientIndex ?? null,
        notes: input.notes ?? null,
      }
      const { data, error } = await supabase.from('grocery_items').insert(payload).select().single()
      if (error || !data) return
      setItemsByList((prev) => ({ ...prev, [listId]: [...(prev[listId] ?? []), data as GroceryItem] }))
    },
    [userId],
  )

  /** Recipe ingredient swap sync — when a user swaps ingredient N in a recipe, every grocery item
   * that was added from that exact recipe+ingredient-index gets updated in place (name/qty/unit)
   * instead of going stale, across every list it might be on. */
  const syncItemsFromIngredientSwap = useCallback(
    async (recipeId: string, ingredientIndex: number, patch: { name: string; qty?: number; unit?: string }) => {
      if (!supabase || !userId) return
      const dbPatch: Record<string, unknown> = { name: patch.name, inferred_category: inferGroceryCategory(patch.name) }
      if (patch.qty != null) dbPatch.qty = patch.qty
      if (patch.unit != null) dbPatch.unit = patch.unit
      const { data, error } = await supabase
        .from('grocery_items')
        .update(dbPatch)
        .eq('user_id', userId)
        .eq('origin_recipe_id', recipeId)
        .eq('origin_ingredient_index', ingredientIndex)
        .select()
      if (error || !data?.length) return
      setItemsByList((prev) => {
        const next = { ...prev }
        for (const row of data as GroceryItem[]) {
          next[row.list_id] = (next[row.list_id] ?? []).map((i) => (i.id === row.id ? row : i))
        }
        return next
      })
    },
    [userId],
  )

  const toggleChecked = useCallback(
    async (item: GroceryItem) => {
      if (!supabase) return
      const next = !item.is_checked
      setItemsByList((prev) => ({
        ...prev,
        [item.list_id]: (prev[item.list_id] ?? []).map((i) => (i.id === item.id ? { ...i, is_checked: next } : i)),
      }))
      await supabase.from('grocery_items').update({ is_checked: next }).eq('id', item.id)
    },
    [],
  )

  const updateItem = useCallback(async (item: GroceryItem, patch: { name?: string; qty?: number | null; unit?: string | null }) => {
    if (!supabase) return
    const dbPatch: Record<string, unknown> = {}
    if (patch.name != null) dbPatch.name = patch.name
    if (patch.qty !== undefined) dbPatch.qty = patch.qty
    if (patch.unit !== undefined) dbPatch.unit = patch.unit
    if (patch.name != null) dbPatch.inferred_category = inferGroceryCategory(patch.name)
    setItemsByList((prev) => ({
      ...prev,
      [item.list_id]: (prev[item.list_id] ?? []).map((i) => (i.id === item.id ? { ...i, ...patch } : i)),
    }))
    await supabase.from('grocery_items').update(dbPatch).eq('id', item.id)
  }, [])

  const deleteItem = useCallback(async (item: GroceryItem) => {
    if (!supabase) return
    setItemsByList((prev) => ({
      ...prev,
      [item.list_id]: (prev[item.list_id] ?? []).filter((i) => i.id !== item.id),
    }))
    await supabase.from('grocery_items').delete().eq('id', item.id)
  }, [])

  /** "Bought" — copy a checked item into stash_items and remove it from the list. */
  const quickStashItem = useCallback(
    async (item: GroceryItem) => {
      if (!supabase || !userId) return
      const category = inferGroceryCategory(item.name)
      const zone = suggestZoneForCategory(category, item.name)
      const zoneLabel = zone === 'fridge' ? 'Fridge' : zone === 'freezer' ? 'Freezer' : 'Pantry'
      const { data, error } = await supabase
        .from('stash_items')
        .insert({
          user_id: userId,
          name: item.name,
          quantity: item.qty ?? 1,
          unit: item.unit ?? 'each',
          category,
          storage_zone: zoneLabel,
          suggested_location: zoneLabel,
          storage_location: zoneLabel,
          shelf_life_days: shelfLifeDays(category, zone, item.name, item.utility_tags ?? [], item.attributes ?? []),
          expiry_date: expiryDateFor(category, zone, item.name, item.utility_tags ?? [], item.attributes ?? []),
          status: 'available',
          utility_tags: item.utility_tags ?? [],
          attributes: mergeComputedAttributes(item.attributes, item.name, category),
          notes: item.notes ?? null,
          origin_recipe_id: item.origin_recipe_id ?? null,
          origin_recipe_title: item.origin_recipe_title ?? null,
          is_enriching: true,
        })
        .select('id, name')
        .single()
      if (!error && data?.id) {
        void enrichStashItemNutrition(supabase, userId, { id: data.id, name: data.name })
      }
      await deleteItem(item)
    },
    [userId, deleteItem],
  )

  /** Bulk "Add completed to stash" — quick-stashes every checked item on a list. */
  const quickStashCheckedItems = useCallback(
    async (listId: string) => {
      const checked = (itemsByList[listId] ?? []).filter((i) => i.is_checked)
      for (const item of checked) {
        await quickStashItem(item)
      }
    },
    [itemsByList, quickStashItem],
  )

  const progressFor = useCallback(
    (listId: string) => {
      const items = itemsByList[listId] ?? []
      const checked = items.filter((i) => i.is_checked).length
      return { checked, total: items.length }
    },
    [itemsByList],
  )

  const totalOpenItems = useMemo(
    () => Object.values(itemsByList).reduce((sum, items) => sum + items.filter((i) => !i.is_checked).length, 0),
    [itemsByList],
  )

  return {
    lists,
    itemsByList,
    loading,
    load,
    createList,
    renameList,
    updateListAppearance,
    toggleRecurring,
    deleteList,
    reorderLists,
    addItem,
    toggleChecked,
    updateItem,
    deleteItem,
    quickStashItem,
    quickStashCheckedItems,
    syncItemsFromIngredientSwap,
    progressFor,
    totalOpenItems,
  }
}
