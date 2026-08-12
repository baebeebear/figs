import { GoogleGenerativeAI } from '@google/generative-ai'
import { INGREDIENT_TOKENS, inferIngredientToken, isIngredientToken } from './ingredientTokens'
import {
  buildDeepEnrichmentPrompt,
  buildGeminiExtractionPrompt,
  buildGeminiFastTriagePrompt,
  FIGS_CATEGORIES,
  normalizeFigsAttributes,
  normalizeFigsCategory,
  normalizeFigsUtilityTags,
} from './stashTaxonomy'
import { estimateRecipeTimes } from './recipeTimeEstimate'
import { autoLinkIngredientsInSteps } from './stepFormatting'
import { dedupeIngredients, parseIngredientLine, splitLeadingAmount } from '../utils/recipeMath'

const GEMINI_VISION_MODEL = 'gemini-2.5-flash'
const GEMINI_VISION_FALLBACK_MODEL = 'gemini-2.5-flash-lite'

/** Shown when a URL/photo has no extractable recipe content. */
export const NOT_A_RECIPE_ERROR = "This doesn't appear to contain a recipe."

const apiKey = import.meta.env.VITE_GEMINI_API_KEY
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

export function getAI() {
  if (!genAI) throw new Error('Missing VITE_GEMINI_API_KEY')
  return genAI
}

function is404ModelError(e: unknown): boolean {
  const err = e as { status?: number; statusCode?: number; message?: string } | undefined
  if (err?.status === 404 || err?.statusCode === 404) return true
  const msg = String(err?.message ?? e ?? '')
  return /\b404\b/i.test(msg) && /model|not\s*found/i.test(msg)
}

export async function generateWithModels(
  content: unknown,
  onStatus?: (msg: string) => void,
  primaryModel: string = GEMINI_VISION_MODEL,
  fallbackModel: string = GEMINI_VISION_FALLBACK_MODEL,
  options?: { responseMimeType?: string; temperature?: number },
) {
  const ai = getAI()
  const config = options ? { generationConfig: options } : undefined
  try {
    const model = ai.getGenerativeModel({ model: primaryModel, ...config })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await model.generateContent(content as any)
  } catch (e) {
    if (!is404ModelError(e)) throw e
    onStatus?.('Switching to alternate model…')
    const model = ai.getGenerativeModel({ model: fallbackModel, ...config })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await model.generateContent(content as any)
  }
}

export function parseStrictJson<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned) as T
  } catch {
    try {
      const cleaned = text.replace(/```[\s\S]*?```/g, '').trim()
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T
    } catch {
      // fall through
    }
    return fallback
  }
}

/** Decodes HTML entities ("&amp;" → "&", "&#39;" → "'", etc.) that sometimes leak through from
 * scraped/OCR'd recipe text — uses the DOM's own entity decoder (safe: textarea.innerHTML never
 * executes scripts, it just unescapes text) rather than a hand-rolled replace map, so every
 * named/numeric entity is covered. */
function decodeHtmlEntities(text: string): string {
  if (!text || !/&[#a-zA-Z0-9]+;/.test(text)) return text
  if (typeof document === 'undefined') return text
  const el = document.createElement('textarea')
  el.innerHTML = text
  return el.value
}

function coerceStringList(value: unknown): string[] {
  if (value == null) return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    const numbered = trimmed
      .split(/\n+/)
      .flatMap((line) => {
        const m = line.match(/^\s*(?:\d+[.)]\s*|-\s*|•\s*)(.+)/)
        return m ? [m[1].trim()] : [line.trim()]
      })
      .filter(Boolean)
    return (numbered.length ? numbered : [trimmed]).map(decodeHtmlEntities)
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>
          return String(o.text ?? o.instruction ?? o.step ?? o.name ?? '').trim()
        }
        return String(item ?? '').trim()
      })
      .filter(Boolean)
      .map(decodeHtmlEntities)
  }
  return []
}

export type RecipeDraft = {
  name: string
  description: string | null
  author_name: string | null
  author_handle: string | null
  author_image_url: string | null
  source_url: string | null
  source_image_url: string | null
  ingredients: {
    name: string
    amount: string
    unit: string
    canonical_key: string
    notes: string | null
    alternatives?: string[]
  }[]
  recommended_tools: string[]
  steps: string[]
  tags: string[]
  is_component: boolean
  total_cook_minutes: number | null
  /** Split time fields — always populated (explicit source value if given, else the deterministic
   * estimator in `recipeTimeEstimate.ts`). `total_cook_minutes` above is kept only as a legacy
   * display fallback; new code should use these three instead. */
  prep_time_mins: number
  cook_time_mins: number
  inactive_time_mins: number
  servings: number | null
  nutrition?: {
    calories: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    fiber_g: number | null
    sodium_mg: number | null
    sugar_g: number | null
    saturated_fat_g?: number | null
    cholesterol_mg?: number | null
  } | null
  cooking_level?: string | null
}

/** Normalize loosely-shaped Gemini/edge-function output into the app's recipe draft shape. */
export function normalizeRecipeDraft(raw: Record<string, unknown>, fallbackSourceUrl?: string | null): RecipeDraft {
  const ingredientsIn = (raw.ingredients ?? raw.ingredient_list) as unknown
  let ingredients: RecipeDraft['ingredients'] = []
  if (Array.isArray(ingredientsIn)) {
    ingredients = dedupeIngredients(
      ingredientsIn
        .map((x) => {
          if (typeof x === 'string') {
            const parsed = parseIngredientLine(decodeHtmlEntities(x))
            const name = parsed.name.toLowerCase()
            return {
              name,
              amount: parsed.amount,
              unit: normalizeUnitToAllowed(parsed.unit),
              canonical_key: inferIngredientToken(name),
              notes: parsed.notes,
              alternatives: parsed.alternatives,
            }
          }
          const o = x as Record<string, unknown>
          const rawName = decodeHtmlEntities(String(o?.name ?? o?.item ?? '').trim())
          const rawAmount = o?.amount ?? o?.quantity ?? o?.qty ?? o?.measurement
          const rawUnit = o?.unit ?? o?.unit_of_measure ?? o?.uom
          const rawNotes = o?.notes ?? o?.note ?? o?.prep_note
          const notesIn = rawNotes != null ? decodeHtmlEntities(String(rawNotes).trim()) || null : null
          const altsIn = Array.isArray(o?.alternatives)
            ? (o.alternatives as unknown[]).map((a) => String(a).trim()).filter(Boolean)
            : undefined
          // Never rejoin amount+unit+name — parse structured fields, peeling leftovers from name.
          const final = parseIngredientLine(rawAmount == null && rawUnit == null ? rawName : '', {
            amount: rawAmount != null ? String(rawAmount) : '',
            unit: rawUnit != null ? String(rawUnit).trim() : '',
            name: rawName,
            notes: notesIn,
          })
          const name = final.name.toLowerCase()
          const canonical_key = isIngredientToken(o?.canonical_key) ? o.canonical_key : inferIngredientToken(name)
          return {
            name,
            amount: final.amount || '',
            unit: normalizeUnitToAllowed(final.unit),
            canonical_key,
            notes: final.notes,
            alternatives: altsIn?.length ? altsIn : final.alternatives,
          }
        })
        // Scraper social-junk hardening: a raw scrape can hand us a hashtag/caption fragment,
        // platform byline ("Instagram"), or likes/comments line as if it were an ingredient —
        // strip those here so every RecipeDraft consumer gets clean data, not just the
        // Gemini-refined happy path (refineRecipeDraftWithGemini has its own pre-filter, but
        // recipeLinkPipeline falls back to this raw draft when refinement fails/is incomplete).
        .filter((i) => !isGarbageScrapedLine(i.name))
        .map((i) => ({
          ...i,
          name: stripFluffAndHashtags(i.name).toLowerCase() || i.name,
          notes: i.notes ? stripFluffAndHashtags(i.notes) || null : i.notes,
        }))
        .filter((i) => i.name.trim().length > 0),
    )
  }
  const name = decodeHtmlEntities(String(raw.name ?? raw.title ?? 'Untitled recipe').trim()) || 'Untitled recipe'
  const author_name = decodeHtmlEntities(String(raw.author_name ?? raw.author ?? '').trim()) || null
  const author_image_url = raw.author_image_url ? String(raw.author_image_url).trim() : null
  const source_url = String(raw.source_url ?? raw.source ?? fallbackSourceUrl ?? '').trim() || fallbackSourceUrl || null
  const rawImage = raw.source_image_url ? String(raw.source_image_url).trim() : null
  const source_image_url = rawImage && !isPlatformLogoUrl(rawImage) ? rawImage : null
  const recommended_tools = coerceStringList(raw.recommended_tools ?? raw.tools ?? raw.equipment)
  const steps = coerceStringList(raw.steps ?? raw.instructions ?? raw.method ?? raw.directions)
    .filter((s) => !isGarbageScrapedLine(s))
    .map((s) => stripFluffAndHashtags(s))
    .filter(Boolean)
  const is_component = Boolean(raw.is_component)
  const tagsIn = Array.isArray(raw.tags) ? (raw.tags as unknown[]) : []
  const tags = tagsIn.map((t) => decodeHtmlEntities(String(t).trim())).filter(Boolean).slice(0, 3)

  let total_cook_minutes: number | null = null
  const rawMins = raw.total_cook_minutes ?? raw.cook_time_minutes ?? raw.total_time_minutes
  if (rawMins != null) {
    const n = Number(rawMins)
    if (Number.isFinite(n) && n > 0) total_cook_minutes = Math.round(n)
  }

  const positiveNum = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const { prepMins, cookMins, inactiveMins } = estimateRecipeTimes({
    ingredients,
    steps,
    explicitPrepMins: positiveNum(raw.prep_time_mins ?? raw.prep_minutes),
    explicitCookMins: positiveNum(raw.cook_time_mins ?? raw.cook_minutes),
    explicitInactiveMins: positiveNum(raw.inactive_time_mins ?? raw.inactive_minutes),
  })
  if (total_cook_minutes == null) total_cook_minutes = prepMins + cookMins + inactiveMins

  const rawDesc = decodeHtmlEntities(String(raw.description ?? '').trim())
  const isServingNote = /^[\d¼½¾⅓⅔]+\s|\bserv(es|ings?)\b|\bmakes\b|\byields?\b/i.test(rawDesc)
  const description = rawDesc && !isServingNote ? rawDesc : null

  let servings: number | null = null
  const rawServings = raw.servings ?? raw.yield ?? raw.serves
  if (rawServings != null) {
    const n = Number(rawServings)
    if (Number.isFinite(n) && n > 0) servings = Math.round(n)
  }

  return {
    name,
    description,
    author_name,
    author_handle: null,
    author_image_url,
    source_url,
    source_image_url,
    ingredients,
    recommended_tools,
    steps,
    tags,
    is_component,
    total_cook_minutes,
    prep_time_mins: prepMins,
    cook_time_mins: cookMins,
    inactive_time_mins: inactiveMins,
    servings,
  }
}

export function recipeDraftIsComplete(draft: RecipeDraft | null | undefined): boolean {
  if (!draft) return false
  const hasIngredients = draft.ingredients.some((i) => i.name.trim())
  const hasSteps = draft.steps.some((s) => s.trim())
  return hasIngredients && hasSteps
}

/** Detect CJK / Hangul / Hiragana / Katakana / common non-Latin scripts that must be translated. */
const NON_ENGLISH_SCRIPT_RE =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f]/

export function textNeedsTranslation(text: string | null | undefined): boolean {
  if (!text) return false
  return NON_ENGLISH_SCRIPT_RE.test(text)
}

/** True when any user-facing recipe field still contains non-English script. */
export function draftNeedsTranslation(draft: RecipeDraft | null | undefined): boolean {
  if (!draft) return false
  if (textNeedsTranslation(draft.name) || textNeedsTranslation(draft.description)) return true
  for (const ing of draft.ingredients) {
    if (
      textNeedsTranslation(ing.name) ||
      textNeedsTranslation(ing.amount) ||
      textNeedsTranslation(ing.unit) ||
      textNeedsTranslation(ing.notes)
    ) {
      return true
    }
  }
  for (const step of draft.steps) {
    if (textNeedsTranslation(step)) return true
  }
  return false
}

export function isPlatformLogoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  // Rednote / XHS platform chrome (hashed CDN paths that are not dish photos).
  if (/picasso-static\.xiaohongshu\.com\/fe-platform\//i.test(url)) return true
  if (/e6214e4fbfae2cf14d634d4296916e8a5eaefdf4\.png/i.test(url)) return true
  // Only reject obvious generic logos/icons — do NOT blanket-ban Instagram/TikTok CDNs
  // (those host real recipe thumbnails / oEmbed covers).
  return (
    /logo|icon|sprite|placeholder|favicon|default[-_]?avatar|app[-_]?icon|watermark|default_user|share[_-]?card|sns-avatar|avatar[_-]?(?:default|empty)|xhs[_-]?logo|rednote[_-]?logo/i.test(
      url,
    ) || /\.svg(\?|$)/i.test(url)
  )
}

/** Prefer a scraped description; only invent a specific one when empty — never use template fluff. */
function buildSpecificDescription(name: string, ingredients: { name: string }[], scrapedDesc: string | null | undefined): string {
  const cleaned = scrapedDesc ? stripFluffAndHashtags(scrapedDesc).trim() : ''
  if (cleaned && cleaned.toLowerCase() !== name.toLowerCase() && cleaned.length >= 15) return cleaned
  const tops = ingredients.map((i) => i.name.trim()).filter(Boolean).slice(0, 4)
  if (tops.length >= 2) return `${name} made with ${tops.slice(0, -1).join(', ')} and ${tops[tops.length - 1]}.`
  if (tops.length === 1) return `${name} centered around ${tops[0]}.`
  return name
}

export async function generateFastParallel(
  content: unknown,
  options?: { responseMimeType?: string; temperature?: number },
) {
  return generateWithModels(content, undefined, GEMINI_VISION_MODEL, GEMINI_VISION_FALLBACK_MODEL, options)
}

export { autoLinkIngredientsInSteps } from './stepFormatting'

/** Second-pass: translate every remaining non-English field to English, preserve structure. */
export async function translateRecipeDraftToEnglish(draft: RecipeDraft): Promise<RecipeDraft> {
  const payload = {
    name: draft.name,
    description: draft.description,
    ingredients: draft.ingredients.map((i) => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      notes: i.notes,
    })),
    steps: draft.steps,
  }
  const prompt = `Translate this recipe to fluent English. EVERY field that contains Chinese, Japanese, Korean, or any non-English text MUST become English.
- Convert Chinese numerals in amounts to Arabic numerals (e.g. 两 -> 2, 半 -> 1/2).
- Convert Chinese units to: g, kg, oz, lb, ml, l, tsp, tbsp, cup, pinch, bunch, clove, head, slice, piece, can, bottle, package, each, or "".
- Keep {{Ingredient}} / {{@index:Name}} tokens; translate the Name inside them to English.
- Do NOT invent new ingredients or steps. Preserve array lengths/order.
- author_name may stay as a proper name/handle.

Input JSON:
${JSON.stringify(payload)}

Return STRICT JSON only:
{
  "name": string,
  "description": string | null,
  "ingredients": [ { "name": string, "amount": string, "unit": string, "notes": string | null } ],
  "steps": string[]
}`
  const result = await generateFastParallel([{ text: prompt }], { responseMimeType: 'application/json', temperature: 0 }).catch((e) => {
    console.warn('[gemini] translateRecipeDraftToEnglish failed:', e)
    return null
  })
  if (!result) throw new Error('Could not translate recipe to English.')
  const parsed = parseStrictJson<{
    name?: string
    description?: string | null
    ingredients?: { name?: string; amount?: string; unit?: string; notes?: string | null }[]
    steps?: string[]
  }>(result.response.text(), {})
  if (!parsed || typeof parsed !== 'object') throw new Error('Could not translate recipe to English.')

  const ingredients =
    Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0
      ? parsed.ingredients.map((ing, i) => ({
          name: ing.name?.trim() || draft.ingredients[i]?.name || 'Ingredient',
          amount: ing.amount?.trim() ?? draft.ingredients[i]?.amount ?? '',
          unit: normalizeUnitToAllowed(ing.unit?.trim() ?? draft.ingredients[i]?.unit ?? ''),
          canonical_key: inferIngredientToken(ing.name || draft.ingredients[i]?.name || ''),
          notes: ing.notes ?? draft.ingredients[i]?.notes ?? null,
        }))
      : draft.ingredients.map((ing) => ({ ...ing, unit: normalizeUnitToAllowed(ing.unit) }))

  const steps =
    Array.isArray(parsed.steps) && parsed.steps.length > 0
      ? parsed.steps.map((s) => String(s ?? '').trim()).filter(Boolean)
      : draft.steps

  return {
    ...draft,
    name: parsed.name?.trim() || draft.name,
    description: parsed.description?.trim() || draft.description,
    ingredients,
    steps: autoLinkIngredientsInSteps(ingredients, steps),
  }
}

export const ALLOWED_RECIPE_UNITS = [
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'pt',
  'qt',
  'gal',
  'pinch',
  'bunch',
  'clove',
  'head',
  'slice',
  'piece',
  'can',
  'jar',
  'tin',
  'bottle',
  'bag',
  'packet',
  'package',
  'box',
  'carton',
  'tub',
  'each',
  '',
] as const

export function normalizeUnitToAllowed(rawUnit: string | null | undefined): string {
  if (!rawUnit) return ''
  const u = rawUnit.trim().toLowerCase()
  if ((ALLOWED_RECIPE_UNITS as readonly string[]).includes(u)) return u

  if (u.includes('克') || u === 'g' || u.includes('g') || u.includes('gram')) return 'g'
  if (u.includes('千克') || u.includes('公斤') || u === 'kg' || u.includes('kilo')) return 'kg'
  if (u.includes('毫升') || u === 'ml' || u.includes('milli')) return 'ml'
  if (u.includes('升') || u === 'l' || u.includes('liter') || u.includes('litre')) return 'l'
  if (u.includes('茶匙') || u.includes('小勺') || u.includes('小匙') || u.includes('tsp') || u.includes('teaspoon')) return 'tsp'
  if (u.includes('汤匙') || u.includes('大勺') || u.includes('大匙') || u.includes('勺') || u.includes('tbsp') || u.includes('tablespoon')) return 'tbsp'
  if (u.includes('杯') || u.includes('碗') || u.includes('cup')) return 'cup'
  if (u.includes('瓣') || u.includes('clove')) return 'clove'
  if (u.includes('片') || u.includes('slice')) return 'slice'
  if (u.includes('块') || u.includes('段') || u.includes('piece')) return 'piece'
  if (u.includes('包') || u.includes('袋') || u.includes('pack')) return 'package'
  if (u.includes('瓶') || u.includes('bot')) return 'bottle'
  if (u.includes('罐') || u.includes('can')) return 'can'
  if (u.includes('jar')) return 'jar'
  if (u.includes('tin')) return 'tin'
  if (u.includes('box')) return 'box'
  if (u.includes('头') || u.includes('颗') || u.includes('head')) return 'head'
  if (u.includes('适量') || u.includes('少许') || u.includes('pinch')) return 'pinch'
  if (u.includes('一把') || u.includes('束') || u.includes('bunch')) return 'bunch'
  if (u.includes('个') || u.includes('只') || u.includes('根') || u.includes('条') || u.includes('ea')) return 'each'

  if (u.includes('ounce') || u.includes('oz')) return 'oz'
  if (u.includes('pound') || u.includes('lb')) return 'lb'

  return 'each'
}

/** Platform/brand names that scrapers sometimes mistake for an ingredient or step line (e.g. a
 * caption's trailing "Instagram" byline getting parsed as a bare ingredient). */
const SOCIAL_PLATFORM_RE =
  /^(?:instagram|tiktok|facebook|youtube|pinterest|xiaohongshu|rednote|xhs|snapchat|twitter|x)$/i

export function isGarbageScrapedLine(line: string): boolean {
  if (!line || !line.trim()) return true
  const l = line.trim()
  if (/^\d{1,3}$/.test(l)) return true
  if (SOCIAL_PLATFORM_RE.test(l)) return true
  if (/^@[\w.]{1,40}$/.test(l)) return true
  if (/^https?:\/\/\S+$/i.test(l)) return true
  if (/^(?:#[\w\u4e00-\u9fa5\d]+\s*)+$/i.test(l)) return true
  if (/\b(?:\d+k?\s*likes|\d+\s*comments|on\s+[A-Z][a-z]+\s+\d{1,2}|followers|reposts)\b/i.test(l)) return true
  if (/^(?:ingredients|method|instructions|directions|preparation|for\s+\d+|ingredients\s+for\s+\d+)\s*:?$/i.test(l)) return true
  if (/\b\d+g?\s*(?:protein|kcal|fat|carbs)\s*\|/i.test(l)) return true
  return false
}

export function stripFluffAndHashtags(text: string): string {
  if (!text) return ''
  return text
    .replace(/#[\w\u4e00-\u9fa5\d]+/g, '')
    .replace(/(?:Follow|Like|Subscribe|Share|Link in bio|Xiaohongshu|RedNote|Instagram|TikTok)[^.]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Post-processes a scraped recipe draft (from a URL import — rednote, blogs, social posts) with
 * four fixes scraping alone can't do: (1) translates every text field to English when the source
 * wasn't in English; (2) replaces invalid titles; (3) replaces invalid descriptions; and (4)
 * splits ingredients into amount, unit, name, and notes, and automatically references ingredients in steps with {{Ingredient Name}}.
 */
export async function refineRecipeDraftWithGemini(draft: RecipeDraft): Promise<RecipeDraft> {
  try {
    const rawSteps = draft.steps.filter((s) => !isGarbageScrapedLine(s)).map(stripFluffAndHashtags).filter(Boolean)
    const rawIngredients = draft.ingredients
      .filter((i) => !isGarbageScrapedLine(i.name))
      .map((i) => ({ name: stripFluffAndHashtags(i.name), amount: i.amount, unit: i.unit, notes: i.notes ? stripFluffAndHashtags(i.notes) : null }))
      .filter((i) => i.name.length > 0)

    const payload = {
      name: stripFluffAndHashtags(draft.name),
      description: stripFluffAndHashtags(draft.description || ''),
      author_name: draft.author_name,
      tags: draft.tags,
      ingredients: rawIngredients,
      steps: rawSteps,
    }
    const prompt = `You are an expert culinary editor and translator. Your task is to clean up and translate a recipe scraped from social media or web pages (RedNote, Xiaohongshu, Instagram, TikTok, blogs) into clean, professional, fluent English.

STRICT CLEANUP & TRANSLATION RULES:
1. PURGE SOCIAL CAPTION FLUFF, HASHTAGS & GARBAGE LINES: Read the title, description, ingredients, and steps carefully. PURGE and REMOVE all social media hashtags (#recipe, #foodie, #xiaohongshu), likes/comments headers ("159K likes, 524 comments"), macro header dumps ("52g Protein | 587 Kcal"), standalone index numbers ("6", "7"), section headers ("INGREDIENTS FOR 2"), personal storylines, emoji dumps, sponsor shoutouts, and store links.
2. REVISE DESCRIPTION: Write a clean, 1-2 sentence appetizing description of THIS specific dish in plain English. It MUST NOT be identical to the title. NEVER start with generic openers like "A delicious…", "A flavorful…", "A mouth-watering…", or "An easy recipe featuring…". Ground the description in the actual dish name and distinctive ingredients/technique. If a usable description already exists after fluff removal, rewrite it for clarity rather than inventing a new one. NEVER include hashtags or social media chatter.
3. TITLE NORMALIZATION: Convert social titles/captions/hashtags (e.g. "50 30 | LOW CAL EP. 3 SPICY TOFU & CHICKEN NOODLES") into a clean, properly capitalized English dish name (e.g. "Spicy Tofu & Chicken Noodles"). NEVER leave titles in ALL CAPS or with episode tags/hashtags.
4. MANDATORY ENGLISH TRANSLATION: If ANY text is in Chinese (中文), Japanese, French, Spanish, Korean, or any non-English language, translate EVERY SINGLE WORD to natural, clean, fluent English. ZERO non-English or Chinese characters are allowed in the output.
5. ENUM UNITS: "unit" MUST be one of these exact allowed English values: ["g", "kg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "pt", "qt", "gal", "pinch", "bunch", "clove", "head", "slice", "piece", "can", "jar", "tin", "bottle", "bag", "packet", "package", "box", "carton", "tub", "each", ""]. Convert Chinese units (克->g, 毫升->ml, 茶匙->tsp, 汤匙->tbsp, 杯->cup, 瓣->clove, 片->slice, 个->each, 适量->pinch).
6. STEPS — MERGE INTO COOKABLE CHUNKS: Combine micro-actions into ~4–8 clear cookable steps (hard cap ~10). Do NOT preserve 1:1 caption/line count. Each step should be a meaningful cooking action (or short related group). Remove step numbers or bullet prefixes. Wrap every mentioned ingredient as {{@index:Ingredient Name}} using the 0-based index from the ingredients array (e.g. "Add {{@0:Garlic Cloves}} and {{@1:Ginger}} to the wok").
7. INGREDIENT NOTES: Keep short single-word prep on "name" (e.g. "Minced Garlic"). Move parentheticals, tips, and longer prep phrases into "notes". When the source lists options ("butter or margarine", "olive oil (or vegetable oil)"), pick ONE primary name and put the other options in "alternatives": string[] — do not leave "or …" jammed into "name".
8. METHOD WHEN STEPS ARE THIN: If ingredients are complete but steps are missing or too thin to cook from, write a short minimal method (~4–8 steps) that uses EVERY listed ingredient in a sensible order. Do not invent extra ingredients or nutrition.

Input JSON:
${JSON.stringify(payload)}

Return STRICT JSON only matching this schema:
{
  "name": string,
  "description": string,
  "author_name": string | null,
  "tags": string[],
  "ingredients": [ { "name": string, "amount": string, "unit": string, "notes": string | null } ],
  "steps": string[]
}`
    const result = await generateFastParallel([{ text: prompt }], { responseMimeType: 'application/json', temperature: 0.1 }).catch((e) => {
      console.warn('[gemini] generateFastParallel failed during refinement:', e)
      return null
    })

    if (!result) {
      const fallbackIngs = rawIngredients.map((ing) => ({
        ...ing,
        unit: normalizeUnitToAllowed(ing.unit),
        canonical_key: inferIngredientToken(ing.name),
      }))
      return {
        ...draft,
        name: stripFluffAndHashtags(draft.name),
        description: buildSpecificDescription(draft.name, fallbackIngs, draft.description),
        ingredients: fallbackIngs,
        steps: autoLinkIngredientsInSteps(fallbackIngs, rawSteps),
      }
    }
    const text = result.response.text()
    const parsed = parseStrictJson<{
      name?: string
      description?: string | null
      author_name?: string | null
      tags?: string[]
      ingredients?: { name?: string; amount?: string; unit?: string; notes?: string | null }[]
      steps?: string[]
    }>(text, {})

    if (!parsed || typeof parsed !== 'object') {
      const fallbackIngs = rawIngredients.map((ing) => ({
        ...ing,
        unit: normalizeUnitToAllowed(ing.unit),
        canonical_key: inferIngredientToken(ing.name),
      }))
      return {
        ...draft,
        ingredients: fallbackIngs,
        steps: autoLinkIngredientsInSteps(fallbackIngs, rawSteps),
      }
    }

    const refinedIngredients =
      Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0
        ? parsed.ingredients.map((ing, i) => {
            const name = (ing.name?.trim() || rawIngredients[i]?.name || 'ingredient').toLowerCase()
            // Amount stays numbers-only; push any leftover text into notes.
            const { amount, extra } = splitLeadingAmount(ing.amount?.trim() ?? rawIngredients[i]?.amount ?? '')
            let notes = ing.notes ?? rawIngredients[i]?.notes ?? null
            if (extra) notes = notes ? `${notes}; ${extra}` : extra
            return {
              name,
              amount: amount || '',
              unit: normalizeUnitToAllowed(ing.unit?.trim() ?? rawIngredients[i]?.unit ?? ''),
              canonical_key: inferIngredientToken(ing.name || rawIngredients[i]?.name || ''),
              notes,
            }
          })
        : rawIngredients.map((ing) => {
            const { amount, extra } = splitLeadingAmount(ing.amount)
            let notes = ing.notes ?? null
            if (extra) notes = notes ? `${notes}; ${extra}` : extra
            return {
              ...ing,
              name: ing.name.toLowerCase(),
              amount: amount || '',
              unit: normalizeUnitToAllowed(ing.unit),
              canonical_key: inferIngredientToken(ing.name),
              notes,
            }
          })

    const refinedSteps =
      Array.isArray(parsed.steps) && parsed.steps.length > 0
        ? parsed.steps.map((s, i) => (s?.trim() ? s.trim() : rawSteps[i] || '')).filter(Boolean)
        : rawSteps

    let cleanName = parsed.name?.trim() || draft.name || 'Untitled Dish'
    if (cleanName === cleanName.toUpperCase() && cleanName.length > 4) {
      cleanName = cleanName.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase())
    }
    cleanName = cleanName.replace(/^(?:LOW\s+CAL\s+)?EP\.\s*\d+\s*\|?\s*/i, '').replace(/\|.*/, '').trim() || cleanName

    let cleanDesc = parsed.description?.trim() || ''
    const looksGeneric =
      /^(a|an)\s+(delicious|flavorful|mouth-watering|tasty|yummy|easy|simple|homemade)\b/i.test(cleanDesc) ||
      /\bfeaturing\b.*\bcooked to perfection\b/i.test(cleanDesc)
    if (!cleanDesc || cleanDesc.toLowerCase() === cleanName.toLowerCase() || cleanDesc.length < 15 || looksGeneric) {
      cleanDesc = buildSpecificDescription(cleanName, refinedIngredients, draft.description)
    }

    const linkedSteps = autoLinkIngredientsInSteps(refinedIngredients, refinedSteps)

    return {
      ...draft,
      name: cleanName,
      description: cleanDesc,
      author_name: parsed.author_name?.trim() || draft.author_name,
      tags: Array.isArray(parsed.tags) && parsed.tags.length ? parsed.tags : draft.tags,
      ingredients: refinedIngredients,
      steps: linkedSteps,
    }
  } catch (e) {
    console.warn('[gemini] recipe draft refinement failed, keeping original', e)
    return draft
  }
}

const RECIPE_DRAFT_JSON_SHAPE = `{
  "name": string,
  "description": string,
  "author_name": string | null,
  "servings": number | null,
  "total_cook_minutes": number | null,
  "prep_time_mins": number | null,
  "cook_time_mins": number | null,
  "inactive_time_mins": number | null,
  "ingredients": [ { "name": string, "amount": string, "unit": string } ],
  "steps": string[]
}`

/** "AI Recipe" — the user describes what they want in a sentence or two and Gemini writes a full
 * recipe from scratch (opens in the editor afterward for review, same as any other draft). */
export async function generateRecipeFromPrompt(promptText: string): Promise<RecipeDraft> {
  const prompt = `You are a recipe developer. Write an original, complete, home-cook-friendly recipe based on this request: "${promptText}"

Return STRICT JSON only, no markdown, in exactly this shape:
${RECIPE_DRAFT_JSON_SHAPE}

Rules: "amount"/"unit" are separate fields — they must NOT appear in "name". Write clear, concise steps in natural English. "description" should be 1-2 appetizing sentences about the dish.`
  const result = await generateWithModels([{ text: prompt }])
  const parsed = parseStrictJson<Record<string, unknown>>(result.response.text(), {})
  const draft = normalizeRecipeDraft(parsed)
  return await refineRecipeDraftWithGemini(draft)
}

/** In-editor "AI" button — fills in gaps (missing description, missing amount/unit on ingredients
 * that only have a name, etc.) from whatever the user has written so far, without touching fields
 * that are already filled in. Best-effort — falls back to the untouched draft on any failure. */
export async function aiCompleteRecipeDraft(draft: {
  name: string
  description: string | null
  ingredients: { name: string; amount: string; unit: string }[]
  steps: string[]
}): Promise<{
  description: string | null
  ingredients: { name: string; amount: string; unit: string }[]
  steps: string[]
}> {
  try {
    const prompt = `You are helping a home cook finish writing a recipe. Here's what they have so far:
${JSON.stringify(draft)}

Fill in ONLY what's missing or clearly incomplete:
- If "description" is empty, write one appetizing 1-2 sentence description.
- For any ingredient with an empty "amount" or "unit", suggest a reasonable one for a typical home recipe serving 2-4 people. Never change an ingredient's "name" or touch amount/unit that's already filled in.
- If "steps" is empty, write clear numbered steps (as separate array entries) to actually make this dish from the ingredients listed. If steps already exist, leave the array exactly as given.

Return STRICT JSON only, no markdown, in exactly this shape (ingredients array must be the same length/order as the input):
{ "description": string, "ingredients": [ { "name": string, "amount": string, "unit": string } ], "steps": string[] }`
    const result = await generateWithModels([{ text: prompt }])
    const parsed = parseStrictJson<{
      description?: string
      ingredients?: { name?: string; amount?: string; unit?: string }[]
      steps?: string[]
    }>(result.response.text(), {})

    const ingredients =
      Array.isArray(parsed.ingredients) && parsed.ingredients.length === draft.ingredients.length
        ? draft.ingredients.map((ing, i) => ({
            name: ing.name,
            amount: ing.amount?.trim() || parsed.ingredients![i]?.amount?.trim() || '1',
            unit: ing.unit || parsed.ingredients![i]?.unit?.trim() || ing.unit,
          }))
        : draft.ingredients

    return {
      description: draft.description?.trim() || parsed.description?.trim() || draft.description,
      ingredients,
      steps: draft.steps.length ? draft.steps : Array.isArray(parsed.steps) ? parsed.steps.filter((s) => s?.trim()) : draft.steps,
    }
  } catch (e) {
    console.warn('[gemini] AI complete failed, keeping draft as-is', e)
    return { description: draft.description, ingredients: draft.ingredients, steps: draft.steps }
  }
}

type InlineImage = { base64: string; mimeType: string }

function toInlinePart(image: InlineImage) {
  const clean = image.base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '')
  return { inlineData: { data: clean, mimeType: image.mimeType || 'image/jpeg' } }
}

/** "Upload a file" — a plain-text recipe file (.txt/.md, e.g. exported from Notes or another app),
 * as opposed to a photo. */
export async function extractRecipeFromText(text: string): Promise<RecipeDraft> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error(NOT_A_RECIPE_ERROR)
  const prompt = `You extract a structured recipe from a text file a user uploaded. If it's not a recipe, return {"name":null}.

Text:
"""
${trimmed.slice(0, 12000)}
"""

Return STRICT JSON only, no markdown, in exactly this shape:
${RECIPE_DRAFT_JSON_SHAPE}

"amount"/"unit" are separate fields — they must NOT appear in "name".`
  const result = await generateWithModels([{ text: prompt }])
  const parsed = parseStrictJson<Record<string, unknown>>(result.response.text(), {})
  if (!parsed.name) throw new Error(NOT_A_RECIPE_ERROR)
  const draft = normalizeRecipeDraft(parsed)
  return await refineRecipeDraftWithGemini(draft)
}

/**
 * Snap-a-photo recipe capture: transcribes 1+ photos of a recipe (cookbook page, card, screenshot)
 * into the app's composite recipe schema. Simplified single-call version of figs_1.0's pipeline.
 */
export async function extractRecipeFromImages(
  images: InlineImage[],
  onStatus?: (msg: string) => void,
): Promise<{ master: RecipeDraft; components: RecipeDraft[] }> {
  if (!images.length) throw new Error('No photos captured.')
  onStatus?.('Reading photo…')

  const prompt = `You transcribe a recipe from photo(s) of a cookbook page, recipe card, or app screenshot.

Ingredients: transcribe EXACTLY what is written — do not invent quantities or ingredients that are not visible.

Steps: capture the same techniques, order, and quantities as written, but rewrite them in fresh, original
wording — different sentence structure and phrasing than the source page, not a verbatim copy or a light
copyedit. This is a copyright-safety requirement, not optional.

Return STRICT JSON only (no markdown) matching this exact shape:
{
  "name": string,
  "description": string | null,
  "servings": number | null,
  "total_cook_minutes": number | null,
  "prep_time_mins": number | null,
  "cook_time_mins": number | null,
  "inactive_time_mins": number | null,
  "ingredients": [ { "name": string, "amount": string, "unit": string, "canonical_key": string, "notes": string | null } ],
  "steps": [ string ]
}

Time fields — extract prep/cook/inactive as three SEPARATE numbers whenever the source states or implies
them, rather than one combined total:
- "prep_time_mins": active hands-on prep before cooking starts (chopping, measuring, mixing raw ingredients).
- "cook_time_mins": active stovetop/thermal execution (sautéing, searing, simmering while stirring, grilling).
- "inactive_time_mins": passive waiting (baking/roasting unattended, marinating, chilling, resting, rising).
If the source only gives one combined time, leave all three null rather than guessing a split — the app
computes a reasonable split itself when these are null.

Ingredient formatting rules:
- "amount"/"unit" are separate fields — they must NOT appear in "name".
- If the written quantity is genuinely vague ("a handful of fresh herbs", "1/4 cup chopped fresh herbs"),
  pick ONE specific, commonly-used ingredient that fits the dish rather than leaving it generic — e.g.
  "fresh herbs" in a pasta dish becomes "basil", not "herbs".
- Short, single-word prep verbs (minced, chopped, diced, sliced, softened, melted, thawed) belong PREPENDED
  to "name" (e.g. "Minced Garlic", "Softened Butter"), never dropped and never left trailing.
- Longer or more specific descriptive phrases about HOW an ingredient is prepared (finely grated, thinly
  sliced, coarsely chopped, room temperature, freshly squeezed, at room temperature) go in "notes" instead —
  do not prepend these to "name", they read as clutter when they're more than one qualifying word. Never
  drop them entirely; if "notes" already holds something else, append with "; ".
- Any parenthetical tip or condition attached to a line ("(thawed if frozen)", "(or substitute margarine)")
  also goes in "notes" instead of "name" — keep "name" to just the ingredient itself.
- "canonical_key" must be exactly one token from this vocabulary — pick the closest match, collapsing
  broad/ambiguous phrasing into the matching generic/group bucket rather than inventing a new token:
${INGREDIENT_TOKENS.join(', ')}

If the photo(s) do not contain a recipe, return { "name": "", "ingredients": [], "steps": [] }.`

  const parts = [...images.map(toInlinePart), { text: prompt }]
  const result = await generateWithModels(parts, onStatus)
  const text = result.response.text()
  const parsed = parseStrictJson<Record<string, unknown>>(text, {})
  const master = normalizeRecipeDraft(parsed)

  if (!recipeDraftIsComplete(master)) {
    throw new Error(NOT_A_RECIPE_ERROR)
  }

  onStatus?.('Cleaning up & translating recipe…')
  const refined = await refineRecipeDraftWithGemini(master)
  return { master: refined, components: [] }
}

export type ExtractedFigsLine = {
  name: string
  brand: string | null
  quantity: number
  unit: string
  category: string
  utilityTags: string[]
  attributes: string[]
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  unitPrice: number | null
  totalPrice: number | null
}

export type ExtractedFigsScan = {
  merchantName: string | null
  purchasedAt: string | null
  items: ExtractedFigsLine[]
}

export type FastTriageLine = { name: string; quantity: number; unit: string; category: string }
export type FastTriageScan = { merchantName: string | null; purchasedAt: string | null; items: FastTriageLine[] }

export type ScanKind = 'receipt' | 'stash' | 'ingredient'

function numOrNull(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normalizes scanned item names to normal Title Case — Gemini/receipt text often comes back
 * ALL CAPS or snake_cased; this strips underscores and re-cases word-by-word. */
function toTitleCase(input: string): string {
  return input
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

/**
 * Background deep enrichment for a single raw receipt line — runs while user views the review page.
 */
export async function deepEnrichRawLine(rawName: string): Promise<{
  productName: string
  brandName: string | null
  category: string
  utilityTags: string[]
  attributes: string[]
  suggestedLocation: string | null
} | null> {
  try {
    const prompt = buildDeepEnrichmentPrompt(rawName)
    const result = await generateWithModels([{ text: prompt }], undefined, GEMINI_VISION_FALLBACK_MODEL, GEMINI_VISION_MODEL, {
      responseMimeType: 'application/json',
      temperature: 0.1,
    })
    const text = result.response.text()
    const parsed = parseStrictJson<Record<string, unknown>>(text, {})
    const productName = String(parsed.product_name ?? parsed.productName ?? '').trim()
    if (!productName) return null
    return {
      productName: toTitleCase(productName),
      brandName: parsed.brand_name ? toTitleCase(String(parsed.brand_name)) : null,
      category: normalizeFigsCategory(parsed.category),
      utilityTags: normalizeFigsUtilityTags(parsed.utility_tags),
      attributes: normalizeFigsAttributes(parsed.attributes),
      suggestedLocation: String(parsed.suggested_location ?? '') || null,
    }
  } catch {
    return null
  }
}

/**
 * Phase 1 — fast receipt triage (unedited raw lines only, no enrichment).
 */
export async function extractFastTriage(image: InlineImage, scanKind: ScanKind, onStatus?: (msg: string) => void): Promise<FastTriageScan> {
  onStatus?.('Reading photo…')

  const prompt = buildGeminiFastTriagePrompt(scanKind)
  const parts = [toInlinePart(image), { text: prompt }]
  const result = await generateWithModels(parts, onStatus, GEMINI_VISION_FALLBACK_MODEL, GEMINI_VISION_MODEL, {
    responseMimeType: 'application/json',
    temperature: 0.1,
  })
  const text = result.response.text()
  const parsed = parseStrictJson<{
    header?: { merchant_name?: string | null; purchased_at?: string | null }
    items?: unknown[]
  }>(text, {})

  const rawItems = Array.isArray(parsed.items) ? parsed.items : []
  const items: FastTriageLine[] = []
  for (const row of rawItems) {
    const o = row as Record<string, unknown>
    const name = String(o.raw_name ?? o.name ?? '').trim()
    if (!name) continue
    // Filter out non-food receipt lines like bag charges, bottle deposits, etc.
    if (/(bag charge|bottle deposit|crv|tax|subtotal|total|discount|savings|coupon)/i.test(name)) continue

    items.push({
      name,
      quantity: Number(o.quantity) > 0 ? Number(o.quantity) : 1,
      unit: String(o.unit ?? 'each').trim() || 'each',
      category: normalizeFigsCategory(o.category ?? o.predicted_category),
    })
  }

  return {
    merchantName: parsed.header?.merchant_name?.trim() ? toTitleCase(parsed.header.merchant_name.trim()) : null,
    purchasedAt: parsed.header?.purchased_at?.trim() || null,
    items,
  }
}

/**
 * Structures raw on-device OCR text (from the local-first scan circuit breaker) into the same
 * shape `extractFastTriage` produces — a cheap TEXT-only prompt (no image bytes), since the pixel
 * OCR already happened for free on-device. This is what makes the local-OCR path actually usable
 * end-to-end: local Tesseract gives us plain lines, this turns those lines into structured items.
 */
export async function structureRawOcrText(rawLines: string[], scanKind: ScanKind, onStatus?: (msg: string) => void): Promise<FastTriageScan> {
  onStatus?.('Structuring text…')

  const scanLabel = scanKind === 'receipt' ? 'receipt' : scanKind === 'stash' ? 'fridge/pantry stash audit' : 'single-item ingredient scan'
  const prompt = `You are the figs FAST receipt triage engine. Below is raw OCR text already extracted on-device from a ${scanLabel} photo — no image, just text. Structure it.

Raw OCR lines:
${rawLines.map((l) => `- ${l}`).join('\n')}

Return STRICT JSON only — one object, no markdown, no code fences:
{
  "header": { "merchant_name": string | null, "purchased_at": ISO-8601 string | null },
  "items": [ { "raw_name": string, "quantity": number, "unit": string, "predicted_category": one of [${FIGS_CATEGORIES.map((c) => `"${c}"`).join(', ')}] } ]
}

Rules:
- raw_name should be the item text as OCR'd, lightly cleaned of obvious OCR noise (stray symbols/misreads) but not otherwise rewritten.
- Ignore lines that are clearly OCR garbage, header/footer boilerplate, subtotal/tax/total/payment/change.
- quantity defaults to 1, unit defaults to "each" when unknown.
- Never return an empty items array if any plausible item lines are present.`

  const result = await generateWithModels([{ text: prompt }], onStatus)
  const text = result.response.text()
  const parsed = parseStrictJson<{
    header?: { merchant_name?: string | null; purchased_at?: string | null }
    items?: unknown[]
  }>(text, {})

  const rawItems = Array.isArray(parsed.items) ? parsed.items : []
  const items: FastTriageLine[] = []
  for (const row of rawItems) {
    const o = row as Record<string, unknown>
    const name = String(o.raw_name ?? o.name ?? '').trim()
    if (!name) continue
    items.push({
      name,
      quantity: Number(o.quantity) > 0 ? Number(o.quantity) : 1,
      unit: String(o.unit ?? 'each').trim() || 'each',
      category: normalizeFigsCategory(o.predicted_category ?? o.category),
    })
  }

  if (!items.length) throw new Error('No items found in that text.')

  return {
    merchantName: parsed.header?.merchant_name?.trim() ? toTitleCase(parsed.header.merchant_name.trim()) : null,
    purchasedAt: parsed.header?.purchased_at?.trim() || null,
    items,
  }
}

/**
 * Phase 2 — deep extraction (figs_1.0 taxonomy): full category/utility/attribute/nutrition detail,
 * run in the background after the fast-triage review page is already showing.
 */
export async function extractFigsScanFromImage(
  image: InlineImage,
  scanKind: ScanKind,
  onStatus?: (msg: string) => void,
): Promise<ExtractedFigsScan> {
  onStatus?.('Reading photo…')

  const prompt = buildGeminiExtractionPrompt(scanKind)
  const parts = [toInlinePart(image), { text: prompt }]
  const result = await generateWithModels(parts, onStatus)
  const text = result.response.text()
  const parsed = parseStrictJson<{
    header?: { merchant_name?: string | null; purchased_at?: string | null }
    items?: unknown[]
  }>(text, {})

  const rawItems = Array.isArray(parsed.items) ? parsed.items : []
  const items: ExtractedFigsLine[] = []
  for (const row of rawItems) {
    const o = row as Record<string, unknown>
    const name = String(o.name ?? '').trim()
    if (!name) continue
    const brandRaw = String(o.brand_name ?? '').trim()
    items.push({
      name: toTitleCase(name),
      brand: brandRaw ? toTitleCase(brandRaw) : null,
      quantity: Number(o.quantity) > 0 ? Number(o.quantity) : 1,
      unit: String(o.unit ?? 'each').trim() || 'each',
      category: normalizeFigsCategory(o.category),
      utilityTags: normalizeFigsUtilityTags(o.utility_tags),
      attributes: normalizeFigsAttributes(o.attributes),
      calories: numOrNull(o.calories),
      proteinG: numOrNull(o.protein_g),
      carbsG: numOrNull(o.carbs_g),
      fatG: numOrNull(o.fat_g),
      unitPrice: numOrNull(o.unit_price),
      totalPrice: numOrNull(o.total_price),
    })
  }

  if (!items.length) throw new Error('No items found in that photo.')

  return {
    merchantName: parsed.header?.merchant_name?.trim() ? toTitleCase(parsed.header.merchant_name.trim()) : null,
    purchasedAt: parsed.header?.purchased_at?.trim() || null,
    items,
  }
}

export type LivePendingItem = { name: string; quantity: number; unit: string; x: number; y: number }
export type LiveTextDensity = 'none' | 'few' | 'many'
export type LiveFrameResult = {
  items: LivePendingItem[]
  hasHeader: boolean
  hasFooter: boolean
  detectedContext: ScanKind | null
  textDensity: LiveTextDensity | null
}

const SCAN_KIND_HINT: Record<ScanKind, string> = {
  receipt: 'a paper receipt',
  stash: 'a fridge, pantry, or shelf holding multiple food items',
  ingredient: 'a single food item held up to the camera',
}

/**
 * One tick of the live continuous scan loop — cheap/fast single-frame read (name/qty/unit +
 * an approximate on-screen position for the floating approve pill), receipt header/footer
 * detection, and — while `lockedMode` is still null — a live classification guess so the caller
 * can decide what kind of scan this is without the user picking a mode up front. Deliberately
 * uses the lighter model since this runs every ~2s while the camera is open; the full two-phase
 * pipeline (extractFastTriage/extractFigsScanFromImage) still runs once on the final captured
 * frame after the user taps the lit-up action button.
 */
export async function parseLiveFrame(image: InlineImage, lockedMode: ScanKind | null, seenNames: string[]): Promise<LiveFrameResult> {
  const modeHint = lockedMode
    ? SCAN_KIND_HINT[lockedMode]
    : 'a paper receipt, a fridge/pantry shelf, or a single food item — figure out which from what is visible'
  const seenHint = seenNames.length ? `\nAlready confirmed this session — do not list these again: ${seenNames.join(', ')}` : ''
  const classifyField = lockedMode
    ? ''
    : ',\n  "detected_context": "receipt" | "stash" | "ingredient" | null,\n  "text_density": "none" | "few" | "many"'
  const classifyRule = lockedMode
    ? ''
    : `\n- "text_density": how much readable text is in the frame — "none" if you cannot read words (shelf/fridge of indistinct items → stash); "few" if you can read one or a couple of product/ingredient names → ingredient; "many" if there is dense printed text (lines of items, prices) → receipt candidate.
- "detected_context": classify from text density + scene — "stash" when text_density is none / shelf-like; "ingredient" when text_density is few with clearly named items; "receipt" when text_density is many or a paper receipt with header/footer is visible. Use null if genuinely unclear yet.`

  const prompt = `This is one frame from a live camera stream pointed at ${modeHint}. Respond fast — this is a quick live read, not a final analysis.

Return STRICT JSON only, no markdown:
{
  "items": [ { "name": string, "quantity": number, "unit": string, "x": number, "y": number } ],
  "has_header": boolean,
  "has_footer": boolean${classifyField}
}

- "items": up to 5 clearly-visible, distinct food items or receipt lines not already confirmed. "x"/"y" are the item's approximate on-screen center, each from 0 (left/top) to 1 (right/bottom).
- "has_header": true only if the TOP of a receipt is visible in this frame (store name/address/date near the top edge of the paper).
- "has_footer": true only if the BOTTOM of a receipt is visible in this frame (subtotal/total/payment line).${classifyRule}
- If nothing food-related or receipt-like is clearly visible, return { "items": [], "has_header": false, "has_footer": false, "detected_context": null, "text_density": "none" }. Never invent items.${seenHint}`

  const parts = [toInlinePart(image), { text: prompt }]
  const result = await generateWithModels(parts, undefined, GEMINI_VISION_FALLBACK_MODEL, GEMINI_VISION_FALLBACK_MODEL)
  const text = result.response.text()
  const parsed = parseStrictJson<{
    items?: unknown[]
    has_header?: boolean
    has_footer?: boolean
    detected_context?: string | null
    text_density?: string | null
  }>(text, {})

  const items: LivePendingItem[] = []
  for (const row of Array.isArray(parsed.items) ? parsed.items : []) {
    const o = row as Record<string, unknown>
    const name = String(o.name ?? '').trim()
    if (!name) continue
    items.push({
      name: toTitleCase(name),
      quantity: Number(o.quantity) > 0 ? Number(o.quantity) : 1,
      unit: String(o.unit ?? 'each').trim() || 'each',
      x: Math.max(0.08, Math.min(0.92, Number(o.x) || 0.5)),
      y: Math.max(0.08, Math.min(0.85, Number(o.y) || 0.5)),
    })
  }

  const detectedContext =
    parsed.detected_context === 'receipt' || parsed.detected_context === 'stash' || parsed.detected_context === 'ingredient'
      ? parsed.detected_context
      : null

  const textDensity: LiveTextDensity | null =
    parsed.text_density === 'none' || parsed.text_density === 'few' || parsed.text_density === 'many'
      ? parsed.text_density
      : null

  return { items, hasHeader: !!parsed.has_header, hasFooter: !!parsed.has_footer, detectedContext, textDensity }
}
