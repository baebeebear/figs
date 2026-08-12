import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '../services/supabase'
import { inferIngredientToken } from './ingredientTokens'
import { deriveFlavorProfile } from './attributeFormulas'

/** Bumped whenever the common-swaps prompt changes meaningfully — cached rows written under an
 * older version are treated as stale and regenerated, so a prompt fix (like flavor-matching)
 * actually reaches ingredients that were already cached under the old wording. */
const SWAP_PROMPT_VERSION = 3

export type SwapOption = {
  name: string
  token: string
  /** Set once ranked — the number of times any user has made this exact swap. */
  popularity?: number
  /** True when this option is already sitting in the viewer's own stash. */
  inStash?: boolean
  /** True when this option's derived flavor profile overlaps the original ingredient's. */
  flavorMatch?: boolean
}

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null
const SWAP_PRIMARY_MODEL = 'gemini-2.5-flash'
const SWAP_FALLBACK_MODEL = 'gemini-2.5-flash-lite'

/**
 * The ~50-token vocabulary in `ingredientTokens.ts` is deliberately coarse —
 * great for stash matching (a recipe wanting "any cheese" should match any
 * cheese in the stash), but wrong for the swap cache/event log: everything
 * that doesn't fit the vocabulary collapses into a single `other` bucket, so
 * two unrelated ingredients (e.g. "buttermilk" and "capers") would otherwise
 * collide on the same cache row. Fall back to the normalized name itself so
 * uncommon ingredients still get their own entry.
 *
 * Used only for the intentionally-coarse aggregation paths — popularity
 * ranking (`getPopularSwaps`/`recordSwapEvent`) — where grouping a whole
 * token family (e.g. every hard cheese) together is the desired behavior.
 */
function cacheKeyFor(name: string): string {
  const token = inferIngredientToken(name)
  return token === 'other' ? name.trim().toLowerCase() : token
}

/**
 * Per-ingredient key for the AI-generated description/common-swaps cache. Must NOT collapse to
 * the coarse token: doing so previously meant whichever ingredient was swapped first under a
 * shared token (e.g. "Parmesan" under `cheese_hard`) permanently served its description and
 * 6-swap list to every other ingredient sharing that token (e.g. "Gruyère", "Pecorino") — the
 * swap sheet would show a description that didn't match the ingredient actually being swapped.
 */
function commonSwapsCacheKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function is404ModelError(e: unknown): boolean {
  const err = e as { status?: number; statusCode?: number; message?: string } | undefined
  if (err?.status === 404 || err?.statusCode === 404) return true
  const msg = String(err?.message ?? e ?? '')
  return /\b404\b/i.test(msg) && /model|not\s*found/i.test(msg)
}

async function generateSwapJson(prompt: string): Promise<string> {
  if (!genAI) throw new Error('Missing VITE_GEMINI_API_KEY')
  const config = { generationConfig: { responseMimeType: 'application/json' as const } }
  try {
    const model = genAI.getGenerativeModel({ model: SWAP_PRIMARY_MODEL, ...config })
    const result = await model.generateContent(prompt)
    return result.response.text()
  } catch (e) {
    if (!is404ModelError(e)) throw e
    const model = genAI.getGenerativeModel({ model: SWAP_FALLBACK_MODEL, ...config })
    const result = await model.generateContent(prompt)
    return result.response.text()
  }
}

/**
 * The AI-generated "common swaps for X" list — generated once per canonical
 * ingredient token and cached in `ingredient_common_swaps` forever after.
 */
async function getOrGenerateCommonSwaps(
  cacheKey: string,
  ingredientName: string,
): Promise<{ names: string[]; description: string; physicalTranslation: string }> {
  if (supabase) {
    const { data } = await supabase
      .from('ingredient_common_swaps')
      .select('swaps')
      .eq('ingredient_token', cacheKey)
      .maybeSingle()
    if (data?.swaps) {
      const parsed = data.swaps as {
        names?: string[]
        description?: string
        physicalTranslation?: string
        promptVersion?: number
      }
      // Rows written before the flavor-matching prompt (or with no version marker at all) are
      // stale — regenerate instead of serving substitutes that were never asked to match flavor.
      if (Array.isArray(parsed.names) && parsed.names.length && parsed.promptVersion === SWAP_PROMPT_VERSION) {
        return {
          names: parsed.names,
          description: parsed.description ?? '',
          physicalTranslation: parsed.physicalTranslation ?? '',
        }
      }
    }
  }

  if (!genAI) return { names: [], description: '', physicalTranslation: '' }

  const flavorTags = deriveFlavorProfile(ingredientName)
  const flavorLine = flavorTags.length
    ? `Its flavor profile is: ${flavorTags.join(', ')}.`
    : ''

  const prompt = `You are a culinary substitution expert. For the ingredient "${ingredientName}", list the 6 best cooking substitutes, ordered best-first.
${flavorLine}
CRITICAL: prioritize substitutes that share a SIMILAR FLAVOR PROFILE and character to "${ingredientName}" — not merely ingredients that serve the same role or macro/texture function in a dish. For example, a neutral-flavored ingredient (like plain tofu) should be swapped with other neutral-flavored options (like tempeh, seitan, paneer), never with something that has a strong or distinct flavor of its own (like chicken or mushrooms) even if it's a common functional substitute. Only include a differently-flavored option if there is truly no closer flavor match.
Also write a 1-sentence neutral description of what the ingredient is/does in cooking (its flavor and role), not a recipe idea.
Also write one short physical translation of how the ingredient is typically sold or portioned in a grocery store (e.g. "about 1 block", "roughly 1 bunch", "1 standard can") — keep it under 8 words.
Return STRICT JSON: { "names": string[], "description": string, "physicalTranslation": string }`
  try {
    const text = await generateSwapJson(prompt)
    const parsed = JSON.parse(text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()) as {
      names?: string[]
      description?: string
      physicalTranslation?: string
    }
    const names = Array.isArray(parsed.names) ? parsed.names.filter((n) => typeof n === 'string' && n.trim()).slice(0, 6) : []
    const description = typeof parsed.description === 'string' ? parsed.description : ''
    const physicalTranslation =
      typeof parsed.physicalTranslation === 'string' ? parsed.physicalTranslation.trim() : ''

    if (supabase && names.length) {
      await supabase
        .from('ingredient_common_swaps')
        .upsert(
          {
            ingredient_token: cacheKey,
            swaps: { names, description, physicalTranslation, promptVersion: SWAP_PROMPT_VERSION },
          },
          { onConflict: 'ingredient_token' },
        )
    }
    return { names, description, physicalTranslation }
  } catch (err) {
    console.warn('[ingredientSwaps] generation failed', err)
    return { names: [], description: '', physicalTranslation: '' }
  }
}

/**
 * Fire-and-forget: warm the common-swaps cache for a set of ingredient names
 * (deduped by cache key) so recipe detail can show stash-swap affordances quickly.
 */
export function warmIngredientSwaps(names: string[]): void {
  const seen = new Set<string>()
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    const key = commonSwapsCacheKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    void getOrGenerateCommonSwaps(key, name).catch(() => {})
  }
}

/**
 * Global swap-popularity ranking for a token, from every user's recorded
 * swaps — grouped by canonical token (so "yogurt" and "greek yogurt" count
 * together) but labeled with whichever literal display name was used most
 * often within that group, since the token itself isn't human-readable.
 */
async function getPopularSwaps(originalKey: string): Promise<{ name: string; count: number }[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('ingredient_swap_events')
    .select('swapped_to_token, swapped_to_name')
    .eq('original_token', originalKey)
  if (!data?.length) return []

  const totalByToken = new Map<string, number>()
  const nameCountsByToken = new Map<string, Map<string, number>>()
  for (const row of data as { swapped_to_token: string; swapped_to_name: string }[]) {
    totalByToken.set(row.swapped_to_token, (totalByToken.get(row.swapped_to_token) ?? 0) + 1)
    if (!row.swapped_to_name) continue
    const nameCounts = nameCountsByToken.get(row.swapped_to_token) ?? new Map<string, number>()
    nameCounts.set(row.swapped_to_name, (nameCounts.get(row.swapped_to_name) ?? 0) + 1)
    nameCountsByToken.set(row.swapped_to_token, nameCounts)
  }

  return [...totalByToken.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tok, count]) => {
      const nameCounts = nameCountsByToken.get(tok)
      const bestName = nameCounts ? [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined
      return { name: bestName ?? tok, count }
    })
}

/**
 * Coarse ingredient tokens (see ingredientTokens.ts) deliberately group whole categories together
 * ("parmesan" and "pecorino" both collapse to `cheese_hard`) so recipe-vs-stash matching stays
 * forgiving. That's wrong for this badge specifically — labeling a swap option "in your stash" when
 * the user only owns a same-category cousin is actively misleading. Require the option's name to
 * actually resemble one of the user's real stash item names instead.
 */
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/s$/, '')
}

export function isPreciseStashMatch(optionName: string, stashItemNames: string[]): boolean {
  const normOption = normalizeIngredientName(optionName)
  if (!normOption) return false
  return stashItemNames.some((raw) => {
    const normStash = normalizeIngredientName(raw)
    if (!normStash) return false
    return normStash === normOption
  })
}

/**
 * Builds the swap dropdown's options: popularity-ranked first (falling back
 * to the AI-generated common-swaps list for a cold-start ingredient with no
 * tracked swaps yet), then re-sorted so anything in the viewer's stash is
 * promoted to the very top, capped to 10.
 */
export async function buildSwapOptions(
  ingredientName: string,
  stashItemNames: string[],
  preferredSwaps: string[] = [],
): Promise<{ options: SwapOption[]; description: string; physicalTranslation: string }> {
  const popularityKey = cacheKeyFor(ingredientName)
  const descriptionKey = commonSwapsCacheKey(ingredientName)
  const [popular, common] = await Promise.all([
    getPopularSwaps(popularityKey),
    getOrGenerateCommonSwaps(descriptionKey, ingredientName),
  ])

  const byName = new Map<string, SwapOption>()
  // Recipe-authored options first (butter or margarine → margarine preferred).
  for (const name of preferredSwaps) {
    const n = name.trim()
    if (!n) continue
    byName.set(n.toLowerCase(), { name: n, token: inferIngredientToken(n), popularity: 9999 })
  }
  for (const p of popular) {
    byName.set(p.name.toLowerCase(), { name: p.name, token: inferIngredientToken(p.name), popularity: p.count })
  }
  for (const name of common.names) {
    const k = name.toLowerCase()
    if (!byName.has(k)) byName.set(k, { name, token: inferIngredientToken(name) })
  }

  // Flavor-similarity ranking: an option sharing at least one flavor tag with the original (or
  // both being flavor-neutral) is a much better swap than one that's merely functionally similar
  // but tastes completely different (e.g. tofu -> tempeh, not tofu -> chicken).
  const originalFlavor = new Set(deriveFlavorProfile(ingredientName))
  const flavorMatches = (name: string): boolean => {
    if (originalFlavor.size === 0) return false
    const optFlavor = deriveFlavorProfile(name)
    if (originalFlavor.has('neutral')) return optFlavor.includes('neutral')
    return optFlavor.some((t) => originalFlavor.has(t))
  }

  const preferredLower = new Set(preferredSwaps.map((s) => s.trim().toLowerCase()).filter(Boolean))
  const options = [...byName.values()]
    .map((o) => ({ ...o, inStash: isPreciseStashMatch(o.name, stashItemNames), flavorMatch: flavorMatches(o.name) }))
    .sort((a, b) => {
      const aPref = preferredLower.has(a.name.toLowerCase())
      const bPref = preferredLower.has(b.name.toLowerCase())
      if (aPref !== bPref) return aPref ? -1 : 1
      if (a.inStash !== b.inStash) return a.inStash ? -1 : 1
      if (a.flavorMatch !== b.flavorMatch) return a.flavorMatch ? -1 : 1
      return (b.popularity ?? 0) - (a.popularity ?? 0)
    })
    .slice(0, 10)

  return { options, description: common.description, physicalTranslation: common.physicalTranslation }
}

/** Records one swap-made event for popularity ranking. */
export async function recordSwapEvent(userId: string, originalName: string, swappedToName: string, recipeId?: string | null) {
  if (!supabase) return
  await supabase.from('ingredient_swap_events').insert({
    user_id: userId,
    original_token: cacheKeyFor(originalName),
    swapped_to_token: cacheKeyFor(swappedToName),
    swapped_to_name: swappedToName,
    recipe_id: recipeId ?? null,
  })
}
