import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import type { RecipeCleanedJson } from './recipes'

export type RecipeCustomization = {
  user_id: string
  recipe_id: string
  servings: number | null
  ingredient_swaps: Record<string, string>
  unit_system: string | null
  cleaned_json_override: RecipeCleanedJson | null
  updated_at: string
}

export type CustomizationPatch = {
  servings?: number | null
  ingredient_swaps?: Record<string, string>
  unit_system?: string | null
  cleaned_json_override?: RecipeCleanedJson | null
}

function parseSwaps(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v
  }
  return out
}

export async function loadCustomization(
  userId: string,
  recipeId: string,
): Promise<RecipeCustomization | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('recipe_user_customizations')
    .select('user_id, recipe_id, servings, ingredient_swaps, unit_system, cleaned_json_override, updated_at')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .maybeSingle()
  if (error || !data) return null
  return {
    user_id: data.user_id,
    recipe_id: data.recipe_id,
    servings: data.servings ?? null,
    ingredient_swaps: parseSwaps(data.ingredient_swaps),
    unit_system: data.unit_system ?? null,
    cleaned_json_override: (data.cleaned_json_override as RecipeCleanedJson | null) ?? null,
    updated_at: data.updated_at,
  }
}

export async function upsertCustomization(
  userId: string,
  recipeId: string,
  patch: CustomizationPatch,
): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  const row: Record<string, unknown> = {
    user_id: userId,
    recipe_id: recipeId,
    updated_at: new Date().toISOString(),
  }
  if (patch.servings !== undefined) row.servings = patch.servings
  if (patch.ingredient_swaps !== undefined) row.ingredient_swaps = patch.ingredient_swaps
  if (patch.unit_system !== undefined) row.unit_system = patch.unit_system
  if (patch.cleaned_json_override !== undefined) row.cleaned_json_override = patch.cleaned_json_override

  const { error } = await supabase.from('recipe_user_customizations').upsert(row, {
    onConflict: 'user_id,recipe_id',
  })
  if (error) throw new Error(error.message)
}

export async function clearCustomization(userId: string, recipeId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  const { error } = await supabase
    .from('recipe_user_customizations')
    .delete()
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
  if (error) throw new Error(error.message)
}

export function customizationHasChanges(c: RecipeCustomization | null | undefined): boolean {
  if (!c) return false
  if (c.servings != null) return true
  if (c.unit_system) return true
  if (c.cleaned_json_override) return true
  return Object.keys(c.ingredient_swaps).length > 0
}

export function swapsToRecord(swappedNames: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(swappedNames)) {
    if (v?.trim()) out[k] = v
  }
  return out
}

export function swapsFromRecord(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!v?.trim()) continue
    // Migrate legacy numeric keys → parent slot keys.
    if (/^\d+$/.test(k)) out[`p:${k}`] = v
    else out[k] = v
  }
  return out
}

export function useRecipeCustomization(userId: string | null | undefined, recipeId: string | null) {
  const [customization, setCustomization] = useState<RecipeCustomization | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!userId || !recipeId) {
      setCustomization(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const row = await loadCustomization(userId, recipeId)
    setCustomization(row)
    setLoading(false)
  }, [userId, recipeId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { customization, loading, reload, setCustomization }
}
