import { supabase } from '../services/supabase'
import { enrichIngredientFields } from '../utils/recipeMath'
import type { IngredientBlock, RecipeCleanedJson, RecipeIngredient, RecipeRow, StepBlock } from './recipes'

export type ChildRecipeSummary = {
  id: string
  title: string | null
  source_image_url: string | null
  cleaned_json: RecipeCleanedJson | null
}

/** Flat ingredients from blocks (or legacy ingredients array). */
export function flatIngredientsFromJson(json: RecipeCleanedJson | null | undefined): RecipeIngredient[] {
  if (!json) return []
  const raw: RecipeIngredient[] =
    Array.isArray(json.ingredient_blocks) && json.ingredient_blocks.length
      ? json.ingredient_blocks
          .filter((b): b is Extract<IngredientBlock, { type: 'ingredient' }> => b.type === 'ingredient')
          .map(({ type: _t, ...ing }) => ing)
      : (json.ingredients ?? [])
  // Surface notes / alternatives that were left in legacy fields or jammed into `name`.
  return raw.map((ing) => enrichIngredientFields(ing))
}

/** Flat steps from blocks (or legacy steps array). */
export function flatStepsFromJson(json: RecipeCleanedJson | null | undefined): string[] {
  if (!json) return []
  if (Array.isArray(json.step_blocks) && json.step_blocks.length) {
    return json.step_blocks
      .filter((b): b is Extract<StepBlock, { type: 'step' }> => b.type === 'step')
      .map((b) => b.text)
  }
  return json.steps ?? []
}

export function ingredientBlocksFromJson(json: RecipeCleanedJson | null | undefined): IngredientBlock[] {
  if (!json) return []
  if (Array.isArray(json.ingredient_blocks) && json.ingredient_blocks.length) return json.ingredient_blocks
  return (json.ingredients ?? []).map((ing) => ({ type: 'ingredient' as const, ...ing }))
}

export function stepBlocksFromJson(json: RecipeCleanedJson | null | undefined): StepBlock[] {
  if (!json) return []
  if (Array.isArray(json.step_blocks) && json.step_blocks.length) return json.step_blocks
  return (json.steps ?? []).map((text) => ({ type: 'step' as const, text }))
}

/** Mirror flat arrays + collect unique child recipe ids from blocks. */
export function withMirroredBlocks(json: RecipeCleanedJson): RecipeCleanedJson {
  const ingredient_blocks = json.ingredient_blocks ?? ingredientBlocksFromJson(json)
  const step_blocks = json.step_blocks ?? stepBlocksFromJson(json)
  return {
    ...json,
    ingredient_blocks,
    step_blocks,
    ingredients: flatIngredientsFromJson({ ...json, ingredient_blocks }),
    steps: flatStepsFromJson({ ...json, step_blocks }),
  }
}

export function childIdsFromBlocks(json: RecipeCleanedJson | null | undefined): string[] {
  const ids = new Set<string>()
  for (const b of ingredientBlocksFromJson(json)) {
    if (b.type === 'subrecipe') ids.add(b.recipe_id)
  }
  for (const b of stepBlocksFromJson(json)) {
    if (b.type === 'subrecipe') ids.add(b.recipe_id)
  }
  return [...ids]
}

export async function listChildRecipes(parentRecipeId: string): Promise<ChildRecipeSummary[]> {
  if (!supabase) return []
  const { data: rels } = await supabase
    .from('recipe_relationships')
    .select('child_recipe_id')
    .eq('parent_recipe_id', parentRecipeId)
  const ids = (rels ?? []).map((r) => r.child_recipe_id as string)
  if (!ids.length) return []
  const { data } = await supabase
    .from('recipes')
    .select('id, title, source_image_url, cleaned_json')
    .in('id', ids)
  const byId = new Map((data ?? []).map((r) => [r.id as string, r as ChildRecipeSummary]))
  return ids.map((id) => byId.get(id)).filter(Boolean) as ChildRecipeSummary[]
}

export async function loadRecipesByIds(ids: string[]): Promise<Map<string, ChildRecipeSummary>> {
  const map = new Map<string, ChildRecipeSummary>()
  if (!supabase || !ids.length) return map
  const unique = [...new Set(ids)]
  const { data } = await supabase
    .from('recipes')
    .select('id, title, source_image_url, cleaned_json')
    .in('id', unique)
  for (const r of data ?? []) {
    map.set(r.id as string, r as ChildRecipeSummary)
  }
  return map
}

/** Replace parent→child links to match the set of recipe ids referenced in blocks. */
export async function syncParentChildren(parentRecipeId: string, childIds: string[]): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable')
  const unique = [...new Set(childIds.filter((id) => id && id !== parentRecipeId))]
  await supabase.from('recipe_relationships').delete().eq('parent_recipe_id', parentRecipeId)
  if (!unique.length) return
  const { error } = await supabase.from('recipe_relationships').insert(
    unique.map((child_recipe_id) => ({ parent_recipe_id: parentRecipeId, child_recipe_id })),
  )
  if (error && error.code !== '23505') throw new Error(error.message)
}

export function recipeRowToChild(row: Pick<RecipeRow, 'id' | 'title' | 'source_image_url' | 'cleaned_json'>): ChildRecipeSummary {
  return {
    id: row.id,
    title: row.title,
    source_image_url: row.source_image_url,
    cleaned_json: row.cleaned_json,
  }
}
