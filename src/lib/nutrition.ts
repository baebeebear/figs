import type { SupabaseClient } from '@supabase/supabase-js'
import { generateWithModels, parseStrictJson } from './gemini'

export type NutritionMacros = {
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g?: number | null
  sodium_mg?: number | null
  sugar_g?: number | null
  saturated_fat_g?: number | null
  cholesterol_mg?: number | null
  potassium_mg?: number | null
  iron_mg?: number | null
  calcium_mg?: number | null
  source?: string
}

function cacheKey(productName: string): string {
  return productName.trim().toLowerCase().replace(/\s+/g, ' ')
}

function num(v: unknown): number | null {
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null
}



/** Step 1 — local ingredient_nutrition_cache by bare product name. */
async function lookupLocalCache(supabase: SupabaseClient, productName: string): Promise<NutritionMacros | null> {
  const key = cacheKey(productName)
  const { data, error } = await supabase
    .from('ingredient_nutrition_cache')
    .select('*')
    .eq('ingredient_name', key)
    .maybeSingle()
  if (error || !data) return null
  const calories = num(data.calories_per_100g)
  if (calories == null && num(data.protein_g) == null) return null
  return {
    calories,
    protein_g: num(data.protein_g),
    carbs_g: num(data.carbs_g),
    fat_g: num(data.fat_g),
    fiber_g: num(data.fiber_g),
    sodium_mg: num(data.sodium_mg),
    sugar_g: num(data.sugar_g),
    saturated_fat_g: num(data.saturated_fat_g),
    cholesterol_mg: num(data.cholesterol_mg),
    potassium_mg: num(data.potassium_mg),
    iron_mg: num(data.iron_mg),
    calcium_mg: num(data.calcium_mg),
    source: 'cache',
  }
}



/** Step 3 — Gemini text estimate fallback (used instead of figs_1.0's Qwen/DeepInfra endpoint). */
async function lookupGeminiEstimate(productName: string): Promise<NutritionMacros | null> {
  try {
    const prompt = `Estimate typical nutrition per 100g for the food product "${productName}".
Return STRICT JSON only, no markdown: { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "fiber_g": number|null, "sodium_mg": number|null, "sugar_g": number|null, "saturated_fat_g": number|null, "cholesterol_mg": number|null, "potassium_mg": number|null, "iron_mg": number|null, "calcium_mg": number|null }
If this is not a food item, return all fields as null.`
    const result = await generateWithModels([{ text: prompt }])
    const text = result.response.text()
    const parsed = parseStrictJson<Record<string, unknown>>(text, {})
    const calories = num(parsed.calories)
    const protein_g = num(parsed.protein_g)
    if (calories == null && protein_g == null) return null
    return {
      calories,
      protein_g,
      carbs_g: num(parsed.carbs_g),
      fat_g: num(parsed.fat_g),
      fiber_g: num(parsed.fiber_g),
      sodium_mg: num(parsed.sodium_mg),
      sugar_g: num(parsed.sugar_g),
      saturated_fat_g: num(parsed.saturated_fat_g),
      cholesterol_mg: num(parsed.cholesterol_mg),
      potassium_mg: num(parsed.potassium_mg),
      iron_mg: num(parsed.iron_mg),
      calcium_mg: num(parsed.calcium_mg),
      source: 'gemini',
    }
  } catch {
    return null
  }
}

async function writeNutritionCache(supabase: SupabaseClient, productName: string, macros: NutritionMacros): Promise<void> {
  const { calories, protein_g, carbs_g, fat_g } = macros
  if (calories == null || protein_g == null || carbs_g == null || fat_g == null) return
  const { error } = await supabase.from('ingredient_nutrition_cache').upsert(
    {
      ingredient_name: cacheKey(productName),
      calories_per_100g: calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g: macros.fiber_g ?? null,
      sodium_mg: macros.sodium_mg ?? null,
      sugar_g: macros.sugar_g ?? null,
      saturated_fat_g: macros.saturated_fat_g ?? null,
      cholesterol_mg: macros.cholesterol_mg ?? null,
      potassium_mg: macros.potassium_mg ?? null,
      iron_mg: macros.iron_mg ?? null,
      calcium_mg: macros.calcium_mg ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'ingredient_name' },
  )
  if (error) console.warn('[nutrition] cache writeback failed:', error.message)
}

/** Resolve macros for a product name: cache → Gemini estimate. */
export async function resolveNutritionForProduct(
  supabase: SupabaseClient,
  productName: string,
): Promise<NutritionMacros | null> {
  const clean = productName.trim()
  if (!clean || /(bag charge|bottle deposit|crv|tax|subtotal|total|fee|discount|savings)/i.test(clean)) return null

  const cached = await lookupLocalCache(supabase, clean)
  if (cached) return cached

  const gemini = await lookupGeminiEstimate(clean)
  if (gemini) {
    await writeNutritionCache(supabase, clean, gemini)
    return gemini
  }

  return null
}

/** Fire-and-forget background enrichment, called right after a stash item is inserted.
 * Always clears is_enriching when it finishes (even on failure/no-match) so the shimmer
 * row in Stash never gets stuck loading forever. Persists the full macro + micronutrient set
 * that was resolved, not just the 4 headline macros, so the Nutrition Facts panel's Saturated
 * Fat/Cholesterol/Sodium/Fiber/Sugar/Calcium/Iron/Potassium rows actually populate. */
export async function enrichStashItemNutrition(
  supabase: SupabaseClient,
  userId: string,
  item: { id: string; name: string },
): Promise<void> {
  const patch: Record<string, unknown> = { is_enriching: false }
  try {
    const macros = await resolveNutritionForProduct(supabase, item.name)
    if (macros) {
      if (macros.calories != null) patch.calories = macros.calories
      if (macros.protein_g != null) patch.protein_g = macros.protein_g
      if (macros.carbs_g != null) patch.carbs_g = macros.carbs_g
      if (macros.fat_g != null) patch.fat_g = macros.fat_g
      if (macros.fiber_g != null) patch.fiber_g = macros.fiber_g
      if (macros.sodium_mg != null) patch.sodium_mg = macros.sodium_mg
      if (macros.sugar_g != null) patch.sugar_g = macros.sugar_g
      if (macros.saturated_fat_g != null) patch.saturated_fat_g = macros.saturated_fat_g
      if (macros.cholesterol_mg != null) patch.cholesterol_mg = macros.cholesterol_mg
      if (macros.potassium_mg != null) patch.potassium_mg = macros.potassium_mg
      if (macros.iron_mg != null) patch.iron_mg = macros.iron_mg
      if (macros.calcium_mg != null) patch.calcium_mg = macros.calcium_mg
    }
  } catch (e) {
    console.warn('[nutrition] enrichment failed for', item.name, e)
  }
  await supabase.from('stash_items').update(patch).eq('id', item.id).eq('user_id', userId)
}
