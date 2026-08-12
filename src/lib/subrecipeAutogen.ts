import { supabase } from '../services/supabase'
import { generateWithModels, parseStrictJson } from './gemini'
import { insertRecipe, type RecipeIngredient } from './recipes'
import {
  childIdsFromBlocks,
  ingredientBlocksFromJson,
  stepBlocksFromJson,
  syncParentChildren,
  withMirroredBlocks,
} from './recipeRelationships'

type GapCheckResult = {
  needed: boolean
  dishName?: string
  ingredients?: { name: string; amount: string; unit: string }[]
  steps?: string[]
}

const PROMPT = `You are figsAI, reviewing an imported recipe for a gap: the method mentions a common
side, starch, or accompaniment by name only (e.g. "serve over rice", "with a side salad",
"alongside garlic bread") that never appears in the ingredient list, the rest of the method, or
anywhere in the original source. This is NOT about vague technique references ("season to
taste") — only concrete servable foods that a cook would need a recipe for.

Rules:
- If nothing qualifies, return { "needed": false }.
- If something qualifies, pick the single most prominent gap (usually only one exists) and name a
  standard, boring, default preparation for it — e.g. bare "rice" -> "Steamed Rice", bare "salad"
  -> "Side Salad", "mashed potatoes" stays "Mashed Potatoes". Do not invent an elaborate variant.
- Generate a short, minimal ingredients + steps list for that standard preparation only (not the
  main dish). 2-6 ingredients, 2-5 steps.
- Never flag something already covered by an existing ingredient or step, even under a different
  name.

Return STRICT JSON only:
{ "needed": boolean, "dishName": string, "ingredients": [ { "name": string, "amount": string, "unit": string } ], "steps": string[] }`

async function checkForMissingStaple(
  steps: string[],
  ingredientNames: string[],
): Promise<GapCheckResult | null> {
  if (!steps.length) return null
  const prompt = `${PROMPT}

Ingredients already in this recipe:
${ingredientNames.map((n) => `- ${n}`).join('\n') || '(none)'}

Method:
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`

  try {
    const result = await generateWithModels(
      [{ text: prompt }],
      undefined,
      undefined,
      undefined,
      { responseMimeType: 'application/json', temperature: 0.1 },
    )
    const parsed = parseStrictJson<GapCheckResult | null>(result.response.text(), null)
    if (!parsed?.needed || !parsed.dishName?.trim()) return null
    return parsed
  } catch (e) {
    console.warn('[subrecipeAutogen] gap check failed:', e)
    return null
  }
}

/**
 * Best-effort, additive pass — run once after a recipe finishes importing. Detects a method step
 * that references a common staple/side by name only (bare "rice", "salad", …) with no matching
 * ingredient or existing subrecipe, and has figsAI create + link a minimal subrecipe for it
 * (e.g. "Steamed Rice"). Never throws — a failure here should never affect the main import.
 */
export async function autoGenerateMissingSubrecipes(userId: string, parentRecipeId: string): Promise<void> {
  if (!supabase) return
  try {
    const { data } = await supabase
      .from('recipes')
      .select('id, cleaned_json')
      .eq('id', parentRecipeId)
      .maybeSingle()
    if (!data?.cleaned_json) return
    const cj = data.cleaned_json as import('./recipes').RecipeCleanedJson
    const steps = cj.steps ?? []
    const ingredients = cj.ingredients ?? []
    if (!steps.length) return
    // Already has subrecipes linked — most likely already handled (manually or by a prior pass).
    if (childIdsFromBlocks(cj).length > 0) return

    const gap = await checkForMissingStaple(steps, ingredients.map((i) => i.name))
    if (!gap?.dishName) return

    const childIngredients: RecipeIngredient[] = (gap.ingredients ?? [])
      .filter((i) => i.name?.trim())
      .map((i) => ({ name: i.name.trim(), amount: i.amount ?? '', unit: i.unit ?? '', canonical_key: '' }))
    const childSteps = (gap.steps ?? []).map((s) => String(s).trim()).filter(Boolean)
    if (!childIngredients.length || !childSteps.length) return

    const childId = crypto.randomUUID()
    await insertRecipe(childId, userId, {
      title: gap.dishName.trim(),
      source_image_url: null,
      author_name: 'figs AI',
      shelf_origin: 'ai',
      cleaned_json: withMirroredBlocks({
        description: null,
        ingredients: childIngredients,
        steps: childSteps,
        servings: null,
        total_cook_minutes: null,
        prep_time_mins: null,
        cook_time_mins: null,
        inactive_time_mins: null,
      }),
    })

    await syncParentChildren(parentRecipeId, [childId])

    const nextCleanedJson = withMirroredBlocks({
      ...cj,
      ingredient_blocks: [...ingredientBlocksFromJson(cj), { type: 'subrecipe' as const, recipe_id: childId }],
      step_blocks: [...stepBlocksFromJson(cj), { type: 'subrecipe' as const, recipe_id: childId }],
    })
    await supabase.from('recipes').update({ cleaned_json: nextCleanedJson }).eq('id', parentRecipeId)
  } catch (e) {
    console.warn('[subrecipeAutogen] failed:', e)
  }
}
