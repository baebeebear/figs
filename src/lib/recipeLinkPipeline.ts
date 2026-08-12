import {
  NOT_A_RECIPE_ERROR,
  draftNeedsTranslation,
  normalizeRecipeDraft,
  recipeDraftIsComplete,
  refineRecipeDraftWithGemini,
  translateRecipeDraftToEnglish,
  type RecipeDraft,
} from './gemini'
import { invokeEdgeFunction } from './edgeFunctionInvoke'
import { normalizeSourceUrl } from './recipes'
import { resolveNutritionForProduct } from './nutrition'
import { supabase } from '../services/supabase'

/** Map the scrape-recipe-url edge function payload → app recipe draft. */
export function mapScrapedRecipeToDraft(
  recipe: Record<string, unknown>,
  url: string,
  meta: { authorName?: string; imageUrl?: string } = {},
): RecipeDraft | null {
  if (!recipe || typeof recipe !== 'object') return null

  const tags = Array.isArray(recipe.tags)
    ? (recipe.tags as unknown[]).map((t) => String(t).trim()).filter(Boolean).slice(0, 3)
    : []
  if (recipe.cooking_level && !tags.includes(String(recipe.cooking_level))) {
    tags.unshift(String(recipe.cooking_level))
  }

  const draft = normalizeRecipeDraft(
    {
      name: recipe.title,
      description: recipe.blurb,
      author_name: recipe.author_name ?? meta.authorName ?? null,
      author_handle: recipe.author_handle ?? null,
      source_url: recipe.source_url ?? url,
      source_image_url: recipe.source_image_url ?? meta.imageUrl ?? null,
      ingredients: recipe.ingredients ?? [],
      recommended_tools: recipe.recommended_tools ?? [],
      steps: recipe.instructions ?? [],
      tags: tags.slice(0, 3),
      servings: recipe.estimated_servings,
      total_cook_minutes: recipe.total_minutes,
      prep_time_mins: recipe.prep_minutes,
      cook_time_mins: recipe.cook_minutes,
    },
    url,
  )

  if (recipe.nutrition && typeof recipe.nutrition === 'object') {
    const n = recipe.nutrition as Record<string, unknown>
    draft.nutrition = {
      calories: n.calories != null ? Number(n.calories) : null,
      protein_g: n.protein_g != null ? Number(n.protein_g) : null,
      carbs_g: n.carbs_g != null ? Number(n.carbs_g) : null,
      fat_g: n.fat_g != null ? Number(n.fat_g) : null,
      fiber_g: n.fiber_g != null ? Number(n.fiber_g) : null,
      sodium_mg: n.sodium_mg != null ? Number(n.sodium_mg) : null,
      sugar_g: n.sugar_g != null ? Number(n.sugar_g) : null,
      saturated_fat_g: n.saturated_fat_g != null ? Number(n.saturated_fat_g) : null,
      cholesterol_mg: n.cholesterol_mg != null ? Number(n.cholesterol_mg) : null,
    }
  }

  draft.cooking_level = recipe.cooking_level != null ? String(recipe.cooking_level) : null
  if (draft.source_url) draft.source_url = normalizeSourceUrl(draft.source_url) || draft.source_url
  return draft
}

async function ensureEnglishDraft(draft: RecipeDraft, onStatus?: (msg: string) => void): Promise<RecipeDraft> {
  let current = draft
  if (!draftNeedsTranslation(current)) return current

  onStatus?.('Translating to English…')
  current = await translateRecipeDraftToEnglish(current)
  if (draftNeedsTranslation(current)) {
    // One more forced pass
    current = await translateRecipeDraftToEnglish(current)
  }
  if (draftNeedsTranslation(current)) {
    throw new Error('Could not fully translate this recipe to English. Please try again.')
  }
  return current
}

function hasAnyNutritionValue(n: RecipeDraft['nutrition'] | null | undefined): boolean {
  if (!n) return false
  return Object.values(n).some((v) => v != null)
}

/**
 * Nutrition fallback tiers 2 & 3 — the scraper (tier 1) already tries the source page's own
 * published facts first (schema.org JSON-LD, stated text) and returns null when the source has
 * none. When that happens, fall back to the same local `ingredient_nutrition_cache` DB lookup →
 * Gemini estimate chain the rest of the app uses for stash items, keyed by the recipe's own name
 * (an approximation — this is a whole-dish estimate, not a per-ingredient lookup) so a recipe
 * never ships with a totally blank Nutrition Facts panel.
 */
async function fillMissingNutrition(draft: RecipeDraft): Promise<RecipeDraft> {
  if (hasAnyNutritionValue(draft.nutrition) || !supabase || !draft.name.trim()) return draft
  try {
    const macros = await resolveNutritionForProduct(supabase, draft.name)
    if (!macros) return draft
    return {
      ...draft,
      nutrition: {
        calories: macros.calories,
        protein_g: macros.protein_g,
        carbs_g: macros.carbs_g,
        fat_g: macros.fat_g,
        fiber_g: macros.fiber_g ?? null,
        sodium_mg: macros.sodium_mg ?? null,
        sugar_g: macros.sugar_g ?? null,
        saturated_fat_g: macros.saturated_fat_g ?? null,
        cholesterol_mg: macros.cholesterol_mg ?? null,
      },
    }
  } catch (e) {
    console.warn('[recipeLinkPipeline] nutrition fallback failed:', e)
    return draft
  }
}

/**
 * Share-a-link recipe import — delegates to the already-deployed `scrape-recipe-url` edge
 * function (shared with figs_1.0, no backend changes needed).
 */
export async function runRecipeLinkPipeline(
  url: string,
  options: { onStatus?: (msg: string) => void } = {},
): Promise<RecipeDraft> {
  const onStatus = options.onStatus
  const trimmed = url.trim()
  if (!trimmed) throw new Error('URL is required')

  onStatus?.('Reading link…')
  const data = await invokeEdgeFunction('scrape-recipe-url', { url: trimmed, mode: 'scrape' })

  if (Array.isArray(data?.stageLog)) {
    const last = [...(data.stageLog as Record<string, unknown>[])].reverse().find((s) => s?.ok === true && s?.stage)
    if (last?.stage) onStatus?.(`Extracted from ${String(last.stage).replace(/_/g, ' ')}…`)
  }

  if (!data?.ok || !data?.recipe) {
    console.warn('[recipeLinkPipeline] scrape failed:', data?.error, data?.stageLog)
    throw new Error(typeof data?.error === 'string' && data.error.trim() ? data.error : NOT_A_RECIPE_ERROR)
  }

  const scraped = mapScrapedRecipeToDraft(
    data.recipe as Record<string, unknown>,
    trimmed,
    (data.meta as { authorName?: string; imageUrl?: string }) ?? {},
  )
  if (!scraped) {
    throw new Error(NOT_A_RECIPE_ERROR)
  }

  onStatus?.('Extracting, translating & checking recipe…')
  let master: RecipeDraft
  try {
    master = await refineRecipeDraftWithGemini(scraped)
  } catch (e) {
    console.warn('[recipeLinkPipeline] Gemini refinement threw:', e)
    // Never soft-keep Chinese scraped text — translate or fail.
    if (draftNeedsTranslation(scraped)) {
      master = await ensureEnglishDraft(scraped, onStatus)
    } else {
      master = scraped
    }
  }

  // Soften completeness gate only for English scrapes. Prefer refined when complete;
  // if refined is incomplete but English and scraped is complete English, keep scraped.
  if (!recipeDraftIsComplete(master)) {
    if (recipeDraftIsComplete(scraped) && !draftNeedsTranslation(scraped)) {
      console.warn('[recipeLinkPipeline] refined draft incomplete — keeping English scraped draft')
      master = scraped
    } else if (recipeDraftIsComplete(scraped) && draftNeedsTranslation(scraped)) {
      master = await ensureEnglishDraft(scraped, onStatus)
      if (!recipeDraftIsComplete(master)) {
        throw new Error(NOT_A_RECIPE_ERROR)
      }
    } else {
      console.warn('[recipeLinkPipeline] master draft is incomplete after Gemini refinement:', master)
      throw new Error(NOT_A_RECIPE_ERROR)
    }
  }

  master = await ensureEnglishDraft(master, onStatus)
  master = await fillMissingNutrition(master)

  onStatus?.('Recipe ready')
  return master
}
