import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

export type RecipeIngredient = {
  name: string
  amount: string
  unit: string
  canonical_key: string
  notes?: string | null
  /** Other options from the source (“butter or margarine”) — shown as preferred swaps. */
  alternatives?: string[]
  /** AI-inferred real-world scale for a confusing volume/abstract measurement (e.g. "1 tsp grated
   * ginger" -> "≈ 1-inch knob"). Only present for raw produce/spices where it's genuinely useful —
   * shown as a low-profile "Physical Translation" line in the ingredient's swap sheet. */
  physical_equivalent?: string | null
}

export type IngredientBlock =
  | ({ type: 'ingredient' } & RecipeIngredient)
  | { type: 'subrecipe'; recipe_id: string }

export type StepBlock =
  | { type: 'step'; text: string }
  | { type: 'subrecipe'; recipe_id: string }

export type RecipeCleanedJson = {
  description?: string | null
  ingredients?: RecipeIngredient[]
  steps?: string[]
  /** Ordered ingredient section including embedded subrecipes. Falls back to `ingredients`. */
  ingredient_blocks?: IngredientBlock[]
  /** Ordered method section including embedded subrecipes. Falls back to `steps`. */
  step_blocks?: StepBlock[]
  servings?: number | null
  total_cook_minutes?: number | null
  prep_time_mins?: number | null
  cook_time_mins?: number | null
  inactive_time_mins?: number | null
  /** True when `source_image_url` was synthesized (no real cover photo could be scraped) rather
   * than taken from the original source — drives the "AI" badge on the hero image. */
  is_ai_generated_hero?: boolean
  /** Nutrition explicitly published by the source page (schema.org JSON-LD or stated text) —
   * highest-priority tier. When absent, the client falls back to a per-ingredient DB-cache/AI
   * estimate (see `RecipeNutritionSummary`). */
  nutrition?: {
    calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    fiber_g?: number | null
    sodium_mg?: number | null
    sugar_g?: number | null
    saturated_fat_g?: number | null
    cholesterol_mg?: number | null
  } | null
}

export type RecipeShelfOrigin = 'created' | 'imported' | 'ai' | 'library'
export type RecipeProcessingStatus = 'pending' | 'processing' | 'ready' | 'error'

export type RecipeRow = {
  id: string
  user_id: string
  title: string | null
  author_name: string | null
  source_image_url: string | null
  source_url: string | null
  cleaned_json: RecipeCleanedJson | null
  created_at: string
  shelf_origin: RecipeShelfOrigin
  processing_status: RecipeProcessingStatus
  processing_error: string | null
  is_placeholder: boolean
}

const RECIPE_SELECT_CORE =
  'id, user_id, title, author_name, source_image_url, source_url, cleaned_json, created_at'

const RECIPE_SELECT_FULL =
  'id, user_id, title, author_name, source_image_url, source_url, cleaned_json, created_at, shelf_origin, processing_status, processing_error, is_placeholder'

/** Own hand-created recipes mutate the canonical row on Edit; everything else uses overlays. */
export function isCanonicalEditable(recipe: Pick<RecipeRow, 'shelf_origin'>): boolean {
  return recipe.shelf_origin === 'created'
}

function isMissingColumnError(message: string | undefined | null): boolean {
  if (!message) return false
  return (
    /Could not find the '.*' column/i.test(message) ||
    /schema cache/i.test(message) ||
    /column .* does not exist/i.test(message)
  )
}

function inferShelfOrigin(row: {
  shelf_origin?: unknown
  source_url?: string | null
  author_name?: string | null
}): RecipeShelfOrigin {
  const shelf = row.shelf_origin as RecipeShelfOrigin | undefined
  if (shelf === 'imported' || shelf === 'ai' || shelf === 'library' || shelf === 'created') return shelf
  if (row.source_url?.trim()) return 'imported'
  if ((row.author_name ?? '').trim().toLowerCase() === 'figs ai') return 'ai'
  return 'created'
}

function normalizeRecipeRow(row: Record<string, unknown>): RecipeRow {
  const processing = row.processing_status as RecipeProcessingStatus | undefined
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: (row.title as string | null) ?? null,
    author_name: (row.author_name as string | null) ?? null,
    source_image_url: (row.source_image_url as string | null) ?? null,
    source_url: (row.source_url as string | null) ?? null,
    cleaned_json: (row.cleaned_json as RecipeCleanedJson | null) ?? null,
    created_at: String(row.created_at ?? ''),
    shelf_origin: inferShelfOrigin({
      shelf_origin: row.shelf_origin,
      source_url: row.source_url as string | null,
      author_name: row.author_name as string | null,
    }),
    processing_status:
      processing === 'pending' || processing === 'processing' || processing === 'ready' || processing === 'error'
        ? processing
        : 'ready',
    processing_error: (row.processing_error as string | null) ?? null,
    is_placeholder: Boolean(row.is_placeholder),
  }
}

function stripIntakeFields<T extends Record<string, unknown>>(payload: T): Omit<T, 'shelf_origin' | 'processing_status' | 'processing_error' | 'is_placeholder'> {
  const {
    shelf_origin: _a,
    processing_status: _b,
    processing_error: _c,
    is_placeholder: _d,
    ...rest
  } = payload
  return rest
}

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'igshid',
  'igsh',
  'si',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'feature',
])

/** Canonical form used for insert + replace-by-link matching (and for comparing against DB rows). */
export function normalizeSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed)
    u.hash = ''
    let host = u.hostname.toLowerCase().replace(/^www\./, '')

    // RedNote / Xiaohongshu: collapse short links + /m/ mobile paths onto one host/path shape.
    const isXhs =
      host === 'xhslink.com' ||
      host.endsWith('.xhslink.com') ||
      host === 'xiaohongshu.com' ||
      host.endsWith('.xiaohongshu.com') ||
      host === 'rednote.com' ||
      host.endsWith('.rednote.com')
    if (isXhs) {
      host = 'xiaohongshu.com'
      u.hostname = host
      let path = u.pathname.replace(/\/{2,}/g, '/')
      path = path.replace(/^\/m(?=\/|$)/i, '')
      const idMatch = path.match(/\/(?:discovery\/item|explore|item)\/([a-zA-Z0-9]+)/i)
      if (idMatch) {
        u.pathname = `/discovery/item/${idMatch[1].toLowerCase()}`
        u.search = ''
      } else {
        u.pathname = path.replace(/\/+$/, '') || '/'
        const kept = new URLSearchParams()
        u.searchParams.forEach((value, key) => {
          if (!TRACKING_PARAMS.has(key.toLowerCase())) kept.append(key, value)
        })
        u.search = kept.toString() ? `?${kept.toString()}` : ''
      }
    } else {
      u.hostname = host
      const kept = new URLSearchParams()
      u.searchParams.forEach((value, key) => {
        if (!TRACKING_PARAMS.has(key.toLowerCase())) kept.append(key, value)
      })
      u.search = kept.toString() ? `?${kept.toString()}` : ''
    }

    let out = u.toString().toLowerCase()
    if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1)
    return out
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '') || null
  }
}

/** Display host for a recipe source URL (e.g. `seriouseats.com`). */
export function sourceSiteLabel(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** Creator line: author name → source site → "You". */
export function recipeCreatorLabel(input: {
  author_name?: string | null
  source_url?: string | null
}): string {
  const author = input.author_name?.trim()
  if (author) return author
  const site = sourceSiteLabel(input.source_url)
  if (site) return site
  return 'You'
}

/** Recipe Editor's single write — nothing is persisted until the user taps "Create Recipe", so
 * this is a one-shot insert rather than a create+patch pair. `recipeId` is generated client-side
 * (before this call) so hero/step images can be uploaded to their final storage path while the
 * user is still editing, without a DB row existing yet.
 *
 * A DB-level unique index (`recipes_user_norm_source_url_uniq`, on `user_id` + normalized
 * `source_url`) blocks a user from saving the same recipe link twice. Re-uploading a link they
 * already saved is treated as "this is a newer version of that recipe" rather than an error — the
 * fresh scrape replaces every detail on the existing row in place (keeping its original id, so
 * anything already referencing it — grocery items, cookbook assignments, recipe locks — stays
 * valid), instead of inserting a duplicate. */
export type InsertRecipeInput = {
  title: string
  source_image_url: string | null
  source_url?: string | null
  author_name?: string | null
  cleaned_json: RecipeCleanedJson
  shelf_origin?: RecipeShelfOrigin
  processing_status?: RecipeProcessingStatus
  processing_error?: string | null
  is_placeholder?: boolean
}

export async function insertRecipe(recipeId: string, userId: string, input: InsertRecipeInput): Promise<string> {
  if (!supabase) throw new Error('Supabase unavailable')
  const normalizedSourceUrl = normalizeSourceUrl(input.source_url) ?? input.source_url ?? null
  const fullPayload = {
    user_id: userId,
    saved_by_id: userId,
    author_user_id: userId,
    title: input.title,
    source_image_url: input.source_image_url,
    source_url: normalizedSourceUrl,
    author_name: input.author_name ?? null,
    is_saved: true,
    is_component: false,
    cleaned_json: input.cleaned_json,
    shelf_origin: input.shelf_origin ?? 'created',
    processing_status: input.processing_status ?? 'ready',
    processing_error: input.processing_error ?? null,
    is_placeholder: input.is_placeholder ?? false,
  }

  const write = async (payload: Record<string, unknown>, existingId?: string): Promise<string> => {
    if (existingId) {
      // Same-link replace: bump freshness so the recipe sorts as newest on Me / shelf.
      const now = new Date().toISOString()
      const replacePayload: Record<string, unknown> = {
        ...payload,
        created_at: now,
        modified_at: now,
      }
      const { error } = await supabase!.from('recipes').update(replacePayload).eq('id', existingId)
      if (!error) return existingId
      if (isMissingColumnError(error.message)) {
        // Retry without intake / optional timestamp columns the remote may not have yet.
        const stripped = stripIntakeFields(replacePayload)
        delete stripped.created_at
        delete stripped.modified_at
        const { error: retryError } = await supabase!
          .from('recipes')
          .update(stripped)
          .eq('id', existingId)
        if (retryError) throw new Error(retryError.message)
        // Best-effort freshness bump when base update succeeded without those columns.
        void supabase!
          .from('recipes')
          .update({ created_at: now, modified_at: now })
          .eq('id', existingId)
        return existingId
      }
      // created_at / modified_at may be rejected while other columns are fine — retry without them then bump.
      if (/created_at|modified_at/i.test(error.message)) {
        const withoutTs = { ...payload }
        const { error: retryError } = await supabase!
          .from('recipes')
          .update(withoutTs)
          .eq('id', existingId)
        if (retryError) throw new Error(retryError.message)
        void supabase!.from('recipes').update({ created_at: now, modified_at: now }).eq('id', existingId)
        return existingId
      }
      throw new Error(error.message)
    }

    const { error } = await supabase!.from('recipes').insert({ id: recipeId, ...payload })
    if (!error) return recipeId

    let continueAsDuplicate = false
    if (isMissingColumnError(error.message)) {
      const { error: retryError } = await supabase!
        .from('recipes')
        .insert({ id: recipeId, ...stripIntakeFields(payload) })
      if (!retryError) return recipeId
      continueAsDuplicate =
        retryError.code === '23505' && retryError.message.includes('recipes_user_norm_source_url_uniq')
      if (!continueAsDuplicate || !normalizedSourceUrl) throw new Error(retryError.message)
    } else {
      continueAsDuplicate =
        error.code === '23505' && error.message.includes('recipes_user_norm_source_url_uniq')
      if (!continueAsDuplicate || !normalizedSourceUrl) throw new Error(error.message)
    }

    const { data: candidates } = await supabase!
      .from('recipes')
      .select('id, source_url')
      .eq('user_id', userId)
      .eq('is_component', false)
      .is('source_recipe_id', null)
    const existing = (candidates ?? []).find((r) => normalizeSourceUrl(r.source_url) === normalizedSourceUrl) as
      | { id: string }
      | undefined
    if (!existing) throw new Error(error.message)
    return write(payload, existing.id)
  }

  // Proactive same-link replace using the app's richer normalizeSourceUrl (not just DB
  // lower(btrim)), so legacy/raw URLs with www/utm still match and update in place.
  if (normalizedSourceUrl) {
    const { data: candidates } = await supabase
      .from('recipes')
      .select('id, source_url')
      .eq('user_id', userId)
      .eq('is_component', false)
      .is('source_recipe_id', null)
    const existing = (candidates ?? []).find((r) => normalizeSourceUrl(r.source_url) === normalizedSourceUrl) as
      | { id: string }
      | undefined
    if (existing) return write(fullPayload, existing.id)
  }

  return write(fullPayload)
}

export type UpdateRecipeInput = {
  title?: string
  source_image_url?: string | null
  source_url?: string | null
  author_name?: string | null
  cleaned_json?: RecipeCleanedJson
  shelf_origin?: RecipeShelfOrigin
  processing_status?: RecipeProcessingStatus
  processing_error?: string | null
  is_placeholder?: boolean
}

export async function updateRecipe(recipeId: string, userId: string, input: UpdateRecipeInput): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.source_image_url !== undefined) patch.source_image_url = input.source_image_url
  if (input.source_url !== undefined) {
    patch.source_url = normalizeSourceUrl(input.source_url) ?? input.source_url ?? null
  }
  if (input.author_name !== undefined) patch.author_name = input.author_name
  if (input.cleaned_json !== undefined) patch.cleaned_json = input.cleaned_json
  if (input.shelf_origin !== undefined) patch.shelf_origin = input.shelf_origin
  if (input.processing_status !== undefined) patch.processing_status = input.processing_status
  if (input.processing_error !== undefined) patch.processing_error = input.processing_error
  if (input.is_placeholder !== undefined) patch.is_placeholder = input.is_placeholder
  if (!Object.keys(patch).length) return
  const { error } = await supabase.from('recipes').update(patch).eq('id', recipeId).eq('user_id', userId)
  if (!error) return
  if (isMissingColumnError(error.message)) {
    const { error: retryError } = await supabase
      .from('recipes')
      .update(stripIntakeFields(patch))
      .eq('id', recipeId)
      .eq('user_id', userId)
    if (retryError) throw new Error(retryError.message)
    return
  }
  throw new Error(error.message)
}

export async function deleteRecipe(recipeId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  // Soft-delete: keep the row in the system, hide from the owner's shelf.
  const { error } = await supabase.from('recipes').update({ is_saved: false }).eq('id', recipeId).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/** Hard-delete a failed/placeholder import so it never lingers on the shelf. Falls back to soft-delete. */
export async function removeFailedImportRecipe(recipeId: string, userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  const { error } = await supabase.from('recipes').delete().eq('id', recipeId).eq('user_id', userId)
  if (!error) return
  await deleteRecipe(recipeId, userId)
}

/** "Your shelf" — the current user's recipes (excludes sub-recipe components). */
export function useMyRecipes(userId: string | null | undefined, refreshKey = 0) {
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setRecipes([])
      setLoading(false)
      return
    }
    setLoading(true)
    let data: Record<string, unknown>[] | null = null
    let error: { message: string } | null = null
    const full = await supabase
      .from('recipes')
      .select(RECIPE_SELECT_FULL)
      .eq('user_id', userId)
      .eq('is_saved', true)
      .eq('is_component', false)
      .order('created_at', { ascending: false })
    data = (full.data as Record<string, unknown>[] | null) ?? null
    error = full.error
    if (error && isMissingColumnError(error.message)) {
      const fallback = await supabase
        .from('recipes')
        .select(RECIPE_SELECT_CORE)
        .eq('user_id', userId)
        .eq('is_saved', true)
        .eq('is_component', false)
        .order('created_at', { ascending: false })
      data = (fallback.data as Record<string, unknown>[] | null) ?? null
      error = fallback.error
    }
    if (error) {
      console.warn('[useMyRecipes]', error.message)
      setRecipes([])
    } else {
      setRecipes((data ?? []).map((row) => normalizeRecipeRow(row)))
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  return { recipes, loading, load }
}

export function useRecipe(recipeId: string | null) {
  const [recipe, setRecipe] = useState<RecipeRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!supabase || !recipeId) {
      setRecipe(null)
      setLoading(false)
      return
    }
    setLoading(true)
    void (async () => {
      let data: Record<string, unknown> | null = null
      let error: { message: string } | null = null
      const full = await supabase!
        .from('recipes')
        .select(RECIPE_SELECT_FULL)
        .eq('id', recipeId)
        .maybeSingle()
      data = (full.data as Record<string, unknown> | null) ?? null
      error = full.error
      if (error && isMissingColumnError(error.message)) {
        const fallback = await supabase!
          .from('recipes')
          .select(RECIPE_SELECT_CORE)
          .eq('id', recipeId)
          .maybeSingle()
        data = (fallback.data as Record<string, unknown> | null) ?? null
        error = fallback.error
      }
      if (!alive) return
      if (error) {
        console.warn('[useRecipe]', error.message)
        setRecipe(null)
      } else {
        setRecipe(data ? normalizeRecipeRow(data) : null)
      }
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [recipeId])

  return { recipe, loading }
}