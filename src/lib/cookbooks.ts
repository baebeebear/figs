import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { isPlatformLogoUrl } from './gemini'

export type CookbookRow = {
  id: string
  user_id: string
  name: string
  description: string | null
  cover_image_url: string | null
  theme_color_hex: string | null
  recipe_count: number
  created_at: string
  created_by_string: string | null
}

const COOKBOOK_SELECT = 'id, user_id, name, description, cover_image_url, theme_color_hex, recipe_count, created_at, created_by_string'

type AssignmentRow = {
  cookbook_id?: string
  recipe_id: string
  created_at?: string
  assigned_at?: string
  position?: number
}

/** Cached working select — avoids re-hitting 400s for missing/renamed columns every load. */
let assignmentSelect: string | null = null

/** A recipe photo only works as a book cover if it's a real image, not a scraped platform logo. */
export function usableCoverImage(url: string | null | undefined): string | null {
  if (!url || isPlatformLogoUrl(url)) return null
  return url
}

function assignmentTimestamp(row: AssignmentRow): string {
  return row.assigned_at ?? row.created_at ?? ''
}

/**
 * Assignment rows for one or more cookbooks, ordered by `position` then assign time.
 *
 * Remote schema uses `assigned_at` (not `created_at`). Probe safe column sets and cache the
 * working select so we don't spam 400s every Me/cookbook load.
 */
async function fetchAssignments(cookbookIds: string[]): Promise<AssignmentRow[]> {
  if (!supabase || !cookbookIds.length) return []
  const candidates = [
    'cookbook_id, recipe_id, assigned_at, position',
    'cookbook_id, recipe_id, created_at, position',
    'cookbook_id, recipe_id, assigned_at',
    'cookbook_id, recipe_id, created_at',
    'cookbook_id, recipe_id, position',
    'cookbook_id, recipe_id',
  ] as const
  const order = assignmentSelect
    ? [assignmentSelect, ...candidates.filter((c) => c !== assignmentSelect)]
    : candidates

  let rows: AssignmentRow[] = []
  for (const sel of order) {
    const res = await supabase.from('recipe_cookbook_assignments').select(sel).in('cookbook_id', cookbookIds)
    if (!res.error) {
      assignmentSelect = sel
      rows = (res.data ?? []) as unknown as AssignmentRow[]
      break
    }
  }
  return [...rows].sort((a, b) => {
    const posA = a.position ?? Number.MAX_SAFE_INTEGER
    const posB = b.position ?? Number.MAX_SAFE_INTEGER
    if (posA !== posB) return posA - posB
    return assignmentTimestamp(a).localeCompare(assignmentTimestamp(b))
  })
}

/** When a cookbook has no cover, use the first assigned recipe that has a hero image. */
async function fillMissingCookbookCovers(rows: CookbookRow[]): Promise<CookbookRow[]> {
  if (!supabase) return rows
  const missing = rows.filter((c) => !c.cover_image_url)
  if (!missing.length) return rows

  const assignments = await fetchAssignments(missing.map((c) => c.id))
  if (!assignments.length) return rows

  const recipeIds = [...new Set(assignments.map((a) => a.recipe_id))]
  const { data: recipes } = await supabase.from('recipes').select('id, source_image_url').in('id', recipeIds)
  const imageByRecipe = new Map<string, string>()
  for (const r of recipes ?? []) {
    const img = usableCoverImage(r.source_image_url as string | null)
    if (img) imageByRecipe.set(r.id as string, img)
  }

  const fallbackByCookbook = new Map<string, string>()
  for (const a of assignments) {
    const cookbookId = a.cookbook_id
    if (!cookbookId || fallbackByCookbook.has(cookbookId)) continue
    const img = imageByRecipe.get(a.recipe_id)
    if (img) fallbackByCookbook.set(cookbookId, img)
  }

  if (!fallbackByCookbook.size) return rows
  return rows.map((c) =>
    c.cover_image_url ? c : { ...c, cover_image_url: fallbackByCookbook.get(c.id) ?? null },
  )
}

/** The user's own cookbooks (figsRv0.0 has no discover/save-from-others flow yet — every row here
 * is one this user created). Shares the `cookbooks` table with figs_1.0/figs_1.2.9. */
export function useMyCookbooks(userId: string | null | undefined, refreshKey = 0) {
  const [cookbooks, setCookbooks] = useState<CookbookRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setCookbooks([])
      setLoading(false)
      return
    }
    setLoading(true)
    const base = () =>
      supabase!
        .from('cookbooks')
        .select(COOKBOOK_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    let { data, error } = await base().is('archived_at', null)
    if (error) {
      // archived_at may not exist until the migration is applied
      ;({ data } = await base())
    }
    const rows = await fillMissingCookbookCovers((data ?? []) as CookbookRow[])
    setCookbooks(rows)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  return { cookbooks, loading, load }
}

/** Recipes assigned to one cookbook, via the recipe_cookbook_assignments join table shared with
 * figs_1.0/figs_1.2.9. */
export function useCookbookRecipes(cookbookId: string | null) {
  const [recipes, setRecipes] = useState<
    {
      id: string
      title: string | null
      source_image_url: string | null
      created_at: string
      cleaned_json: {
        total_cook_minutes?: number | null
        prep_time_mins?: number | null
        cook_time_mins?: number | null
        inactive_time_mins?: number | null
      } | null
    }[]
  >([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase || !cookbookId) {
      setRecipes([])
      setLoading(false)
      return
    }
    setLoading(true)
    const ids = (await fetchAssignments([cookbookId])).map((a) => a.recipe_id)
    if (!ids.length) {
      setRecipes([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('recipes')
      .select('id, title, source_image_url, created_at, cleaned_json')
      .in('id', ids)
    type Row = {
      id: string
      title: string | null
      source_image_url: string | null
      created_at: string
      cleaned_json: {
        total_cook_minutes?: number | null
        prep_time_mins?: number | null
        cook_time_mins?: number | null
        inactive_time_mins?: number | null
      } | null
    }
    const byId = new Map((data ?? []).map((r) => [r.id as string, r as Row]))
    setRecipes(ids.map((id) => byId.get(id)).filter(Boolean) as Row[])
    setLoading(false)
  }, [cookbookId])

  useEffect(() => {
    void load()
  }, [load])

  return { recipes, loading, load }
}

export async function createCookbook(
  userId: string,
  input: {
    name: string
    description?: string | null
    createdByString?: string | null
    coverImageUrl?: string | null
    themeColorHex?: string | null
  },
): Promise<string> {
  if (!supabase) throw new Error('Supabase unavailable')
  const { data, error } = await supabase
    .from('cookbooks')
    .insert({
      user_id: userId,
      name: input.name.trim() || 'Untitled book',
      description: input.description?.trim() || null,
      created_by_string: input.createdByString ?? null,
      cover_image_url: input.coverImageUrl ?? null,
      theme_color_hex: input.themeColorHex ?? null,
      recipe_count: 0,
      is_public: false,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create cookbook')
  return data.id as string
}

export async function updateCookbook(
  cookbookId: string,
  patch: {
    name?: string
    description?: string | null
    cover_image_url?: string | null
    theme_color_hex?: string | null
  },
): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  const dbPatch: Record<string, unknown> = {}
  if (patch.name != null) dbPatch.name = patch.name.trim() || 'Untitled book'
  if (patch.description !== undefined) dbPatch.description = patch.description?.trim() || null
  if (patch.cover_image_url !== undefined) dbPatch.cover_image_url = patch.cover_image_url
  if (patch.theme_color_hex !== undefined) dbPatch.theme_color_hex = patch.theme_color_hex
  if (!Object.keys(dbPatch).length) return
  const { error } = await supabase.from('cookbooks').update(dbPatch).eq('id', cookbookId)
  if (error) throw new Error(error.message)
}

export async function deleteCookbook(cookbookId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  // Soft-delete: keep the row + assignments in the system, hide from the owner's shelf.
  const { error } = await supabase
    .from('cookbooks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', cookbookId)
  if (error) {
    // Fallback if archived_at migration isn't applied yet — still avoid hard-deleting assignments.
    throw new Error(error.message)
  }
}

async function refreshRecipeCount(cookbookId: string): Promise<void> {
  if (!supabase) return
  const { count } = await supabase
    .from('recipe_cookbook_assignments')
    .select('recipe_id', { count: 'exact', head: true })
    .eq('cookbook_id', cookbookId)
  await supabase.from('cookbooks').update({ recipe_count: count ?? 0 }).eq('id', cookbookId)
}

/**
 * Plain insert rather than an upsert: an `on_conflict` upsert also needs the row to pass the
 * table's UPDATE policy, so a straight insert (treating a duplicate key as already-assigned)
 * is what actually persists reliably here. When already assigned, update `position` so reorder
 * survives Save.
 */
export async function assignRecipeToCookbook(
  cookbookId: string,
  recipeId: string,
  position = 0,
): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  const { error } = await supabase
    .from('recipe_cookbook_assignments')
    .insert({ cookbook_id: cookbookId, recipe_id: recipeId, position })
  const alreadyAssigned = error?.code === '23505'
  if (error && !alreadyAssigned) {
    // Pre-migration: retry without position.
    if (/position|schema cache/i.test(error.message)) {
      const retry = await supabase.from('recipe_cookbook_assignments').insert({ cookbook_id: cookbookId, recipe_id: recipeId })
      if (retry.error && retry.error.code !== '23505') throw new Error(retry.error.message)
      await refreshRecipeCount(cookbookId)
      return
    }
    throw new Error(error.message)
  }
  if (alreadyAssigned) {
    const { error: upErr } = await supabase
      .from('recipe_cookbook_assignments')
      .update({ position })
      .eq('cookbook_id', cookbookId)
      .eq('recipe_id', recipeId)
    if (upErr && !/position|schema cache/i.test(upErr.message)) throw new Error(upErr.message)
  }
  await refreshRecipeCount(cookbookId)
}

export async function unassignRecipeFromCookbook(cookbookId: string, recipeId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  const { error } = await supabase
    .from('recipe_cookbook_assignments')
    .delete()
    .eq('cookbook_id', cookbookId)
    .eq('recipe_id', recipeId)
  if (error) throw new Error(error.message)
  await refreshRecipeCount(cookbookId)
}
