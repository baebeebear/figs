/** Fixed figs intake taxonomy — must match Gemini extraction schema. */

export const FIGS_CATEGORIES = [
  'fruit',
  'vegetable',
  'poultry',
  'meat',
  'seafood',
  'dairy & eggs',
  'deli & cured',
  'bakery & bread',
  'pantry staples',
  'oil & condiments',
  'spices & seasoning',
  'leftover',
  'meal prep',
  'beverages',
  'takeout',
  'supplements & powders',
] as const

export type FigsCategory = (typeof FIGS_CATEGORIES)[number]

export const FIGS_UTILITY_TAGS = [
  'ingredient',
  'component',
  'plate',
  'dish',
  'meal',
  'snack',
  'drink',
  'topping/garnish',
] as const

export type FigsUtilityTag = (typeof FIGS_UTILITY_TAGS)[number]

export const FIGS_ATTRIBUTES = [
  'vegan',
  'vegetarian',
  'gluten-free',
  'dairy-free',
  'nut-free',
  'soy-free',
  'organic',
  'non-GMO',
  'grass-fed',
  'free-range',
  'pasture-raised',
  'wild-caught',
  'local',
  'farm-fresh',
  'High-Protein',
  'Low-Carb',
  'Keto',
  'Sugar-Free',
  'No Added Sugar',
  'Low-Sodium',
  'Probiotic',
  'Fermented',
  'Kosher',
  'Halal',
  'plant-based',
  'perishable',
  'stable',
  'pantry-staple',
  'fiber-rich',
  'pescatarian',
  'paleo',
  'umami',
  'acidic',
  'spicy',
  'sweet',
  'bitter',
  'earthy',
  'calorie-dense',
  'low-calorie',
  'egg-free',
  'shellfish-free',
  'seafood-free',
  'sesame-free',
  'nightshade-free',
  'allium-free',
  'low-FODMAP',
  'AIP',
  'carnivore',
  'whole30',
  'Mediterranean',
  'regenerative',
  'fair-trade',
  'sustainably-sourced',
  'line-caught',
  'cage-free',
  'non-irradiated',
  'raw',
  'cold-pressed',
  'unrefined',
  'artisanal',
  'batch-crafted',
  'low-fat',
  'zero-carb',
  'electrolyte-rich',
  'iron-rich',
  'calcium-rich',
  'omega-3-rich',
  'antioxidant-rich',
  'low-glycemic',
  'heart-healthy',
  'salty',
  'savory',
  'smoky',
  'tangy',
  'tart',
  'citrusy',
  'herbal',
  'nutty',
  'floral',
  'peppery',
  'funky',
  'crunchy',
  'crispy',
  'creamy',
  'velvety',
  'tender',
  'chewy',
  'flaky',
  'juicy',
  'thick',
  'dense',
  'rich',
  'light',
  'brothy',
  'neutral',
  'freezer-stable',
  'chilled',
  'shelf-stable',
  'quick-decay',
  'aged',
  'cured',
  'dried',
  'dehydrated',
  'canned',
] as const

export type FigsAttribute = (typeof FIGS_ATTRIBUTES)[number]

const CATEGORY_SET = new Set<string>(FIGS_CATEGORIES.map((c) => c.toLowerCase()))
const ATTRIBUTE_CANON = new Map<string, string>(
  FIGS_ATTRIBUTES.map((a) => [a.toLowerCase(), a]),
)

export function normalizeFigsCategory(raw: unknown): FigsCategory {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (CATEGORY_SET.has(s)) return s as FigsCategory
  if (s.includes('fruit')) return 'fruit'
  if (s.includes('vegetable') || s.includes('produce')) return 'vegetable'
  if (s.includes('poultry') || s.includes('chicken') || s.includes('turkey')) return 'poultry'
  if (s.includes('seafood') || s.includes('fish')) return 'seafood'
  if (s.includes('meat') || s.includes('beef') || s.includes('pork')) return 'meat'
  if (s.includes('dairy') || s.includes('egg')) return 'dairy & eggs'
  if (s.includes('deli') || s.includes('cured')) return 'deli & cured'
  if (s.includes('bakery') || s.includes('bread')) return 'bakery & bread'
  if (s.includes('beverage') || s.includes('drink')) return 'beverages'
  if (s.includes('spice') || s.includes('season')) return 'spices & seasoning'
  if (s.includes('oil') || s.includes('condiment') || s.includes('sauce')) return 'oil & condiments'
  if (s.includes('leftover')) return 'leftover'
  if (s.includes('meal prep') || s.includes('prepped')) return 'meal prep'
  if (s.includes('takeout') || s.includes('take-out')) return 'takeout'
  if (s.includes('supplement') || s.includes('powder')) return 'supplements & powders'
  return 'pantry staples'
}

// Fresh produce phrases that would otherwise be caught by the bare "pepper" spice check below —
// checked first so "bell pepper"/"jalapeño" land in Produce while bare "pepper"/"black pepper"
// (the spice) still lands in Spices & seasoning.
const PRODUCE_PEPPER_RE =
  /bell pepper|red pepper|green pepper|yellow pepper|orange pepper|jalape[nñ]o|poblano|habanero|serrano|banana pepper|chil[ei] pepper|sweet pepper|hot pepper|shishito|scotch bonnet/

/**
 * Name-based classifier for the 16-category `FIGS_CATEGORIES` taxonomy — used where there's no
 * AI image scan to assign a category (e.g. a grocery-list ingredient typed/imported by name only).
 * Ordered so specific/narrow categories are checked before broad ones; critically, spices &
 * seasoning is checked before produce so "salt"/"pepper"/"black pepper" don't fall into Produce
 * (bare "pepper" collides with the bell/chili-pepper vegetable) or a catch-all Other bucket.
 */
export function inferFigsCategoryFromName(name: string): FigsCategory {
  const n = String(name ?? '').toLowerCase().trim()

  if (/milk|yogurt|yoghurt|cheese|\begg|eggs\b|butter|cream|half.and.half/.test(n)) return 'dairy & eggs'
  if (/chicken|turkey|duck|poultry/.test(n)) return 'poultry'
  if (/fish|salmon|shrimp|tuna|cod|tilapia|crab|lobster|scallop|oyster|mussel|anchovy|sardine|seafood/.test(n)) {
    return 'seafood'
  }
  if (/prosciutto|salami|pepperoni|pastrami|deli meat|cold cut/.test(n)) return 'deli & cured'
  if (/beef|pork|steak|bacon|sausage|\bham\b|lamb|veal|brisket|ground meat|ground beef|ground turkey|ground chicken/.test(n)) {
    return 'meat'
  }
  if (/bread|bagel|croissant|\broll\b|\bbun\b|tortilla|baguette|muffin|pastry|pita|naan/.test(n)) return 'bakery & bread'
  if (/soda|juice|sparkling water|seltzer|\bbeer\b|\bwine\b|coffee|\btea\b|kombucha|lemonade|\bwater\b/.test(n)) {
    return 'beverages'
  }
  if (PRODUCE_PEPPER_RE.test(n)) return 'vegetable'
  if (/\bsalt\b|pepper|paprika|cinnamon|\bcumin\b|oregano|\bthyme\b|rosemary|nutmeg|turmeric|cardamom|\bclove/.test(n) ||
    /allspice|bay leaf|bay leaves|chili powder|curry powder|garlic powder|onion powder|seasoning|vanilla extract|saffron|coriander seed|peppercorn/.test(n)
  ) {
    return 'spices & seasoning'
  }
  if (/sauce|ketchup|mustard|mayo|dressing|\boil\b|vinegar|\bjam\b|honey|syrup|salsa|relish/.test(n)) {
    return 'oil & condiments'
  }
  if (/leftover/.test(n)) return 'leftover'
  if (/takeout|take-out/.test(n)) return 'takeout'
  if (/protein powder|supplement|multivitamin/.test(n)) return 'supplements & powders'
  if (
    /rice|pasta|noodle|flour|sugar|\bbean|lentil|\bcan\b|canned|cereal|\boat|\bnut\b|granola|cracker|chip|pretzel|baking soda|baking powder|cornstarch/.test(
      n,
    )
  ) {
    return 'pantry staples'
  }
  if (
    /apple|banana|berry|grape|melon|orange|lemon|lime|peach|pear|plum|mango|pineapple|kiwi|\bfruit\b/.test(n)
  ) {
    return 'fruit'
  }
  if (
    /lettuce|tomato|onion|carrot|potato|garlic|cucumber|broccoli|cauliflower|\bcorn\b|mushroom|avocado|zucchini|squash|cabbage|\bkale\b|celery|radish|\bbeet|ginger|scallion|green onion|leek|asparagus|artichoke|eggplant|\bpea\b|peas\b|vegetable|herb|cilantro|parsley|basil|\bmint\b|\bdill\b|chive|spinach|arugula/.test(
      n,
    )
  ) {
    return 'vegetable'
  }
  return 'pantry staples'
}

export function normalizeFigsUtilityTags(raw: unknown): FigsUtilityTag[] {
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : []
  const out: FigsUtilityTag[] = []
  for (const item of list) {
    const s = String(item ?? '')
      .trim()
      .toLowerCase()
    if (!s) continue
    const match = FIGS_UTILITY_TAGS.find((u) => u.toLowerCase() === s || s.includes(u.toLowerCase()))
    if (match && !out.includes(match)) out.push(match)
  }
  if (!out.length) out.push('ingredient')
  return out.slice(0, 4)
}

export function normalizeFigsAttributes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : []
  const out: string[] = []
  for (const item of list) {
    const s = String(item ?? '').trim()
    if (!s) continue
    const canon = ATTRIBUTE_CANON.get(s.toLowerCase()) ?? s
    if (!out.includes(canon)) out.push(canon)
  }
  return out.slice(0, 30)
}

export function utilityTagsToItemType(tags: string[]): 'ingredient' | 'meal' | 'snack' | 'drink' | 'non_food' {
  const lower = tags.map((t) => t.toLowerCase())
  if (lower.some((t) => t === 'drink')) return 'drink'
  if (lower.some((t) => t === 'snack')) return 'snack'
  if (lower.some((t) => ['meal', 'plate', 'dish'].includes(t))) return 'meal'
  return 'ingredient'
}

/** Deterministic storage from predicted figs category (Phase 1). */
export function storageZoneFromPredictedCategory(category: string): 'fridge' | 'pantry' | 'freezer' {
  const c = String(category ?? '')
    .toLowerCase()
    .trim()
  if (
    [
      'fruit',
      'vegetable',
      'poultry',
      'meat',
      'seafood',
      'dairy & eggs',
      'deli & cured',
      'leftover',
      'meal prep',
      'takeout',
    ].includes(c)
  ) {
    return 'fridge'
  }
  return 'pantry'
}

/** Map figs taxonomy category → expirationEngine category (now identity — engine accepts figs keys). */
export function figsCategoryToExpirationKey(category: string): string {
  return String(category ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') || 'pantry staples'
}

export function buildGeminiFastTriagePrompt(
  scanKind: 'receipt' | 'stash' | 'ingredient',
  verifiedNames: string[] = [],
) {
  const scanLabel =
    scanKind === 'receipt' ? 'receipt' : scanKind === 'stash' ? 'fridge/pantry stash audit' : 'single-item ingredient scan'

  const hints =
    verifiedNames.length > 0
      ? `\nUser-verified names to include or merge:\n${verifiedNames.map((n) => `- ${n}`).join('\n')}`
      : ''

  return `You are the figs fast receipt triage engine. Extract unedited printed line text fast from this ${scanLabel} image. Speed is critical.

Return STRICT JSON only — one object, no markdown, no code fences:
{
  "header": {
    "merchant_name": string | null,
    "purchased_at": ISO-8601 string | null
  },
  "items": [
    {
      "raw_name": string (UNEDITED verbatim receipt line text),
      "quantity": number,
      "unit": string,
      "category": one of [${FIGS_CATEGORIES.map((c) => `"${c}"`).join(', ')}]
    }
  ]
}

Rules:
- raw_name: UNEDITED verbatim printed line text as shown on receipt (e.g. "TJ ORG WHL MILK 1GAL").
- Do NOT extract attributes, brand, or normalized names for the receipt review page. Keep it minimal and ultra fast.
- category: pick exactly ONE figs category for storage zone routing.
- NEVER include non-food items, bag charges ("Carry Out Bag Charge"), bottle deposits ("CRV"), subtotal, tax, total, payment, or change.
- quantity defaults to 1, unit defaults to "each" when unknown.${hints}`
}

export type ReorganizedItem = {
  name: string
  brand: string | null
  attributes: string[]
  utilityTags: string[]
}

const ATTRIBUTE_PATTERNS: Array<{ regex: RegExp; attribute: string }> = [
  { regex: /\b(org|orgnc|organic)\b/i, attribute: 'organic' },
  { regex: /\b(grass-fed|grass fed|grss fd|grss fed|grs fd)\b/i, attribute: 'grass-fed' },
  { regex: /\b(free-range|free range|fr rng|fr range)\b/i, attribute: 'free-range' },
  { regex: /\b(pasture-raised|pasture raised|pstr rsd|pstr raised)\b/i, attribute: 'pasture-raised' },
  { regex: /\b(wild-caught|wild caught|wld cght|wld caught)\b/i, attribute: 'wild-caught' },
  { regex: /\b(raw)\b/i, attribute: 'raw' },
  { regex: /\b(non-gmo|non gmo|nongmo|no gmo)\b/i, attribute: 'non-GMO' },
  { regex: /\b(gluten-free|gluten free|gf)\b/i, attribute: 'gluten-free' },
  { regex: /\b(dairy-free|dairy free|df)\b/i, attribute: 'dairy-free' },
  { regex: /\b(vegan)\b/i, attribute: 'vegan' },
  { regex: /\b(plant-based|plant based|plnt bsd)\b/i, attribute: 'plant-based' },
  { regex: /\b(high-protein|high protein|hi prot)\b/i, attribute: 'High-Protein' },
  { regex: /\b(low-carb|low carb|lo carb)\b/i, attribute: 'Low-Carb' },
  { regex: /\b(keto)\b/i, attribute: 'Keto' },
  { regex: /\b(sugar-free|sugar free|sgr free)\b/i, attribute: 'Sugar-Free' },
  { regex: /\b(no added sugar)\b/i, attribute: 'No Added Sugar' },
  { regex: /\b(low-sodium|low sodium|lo sod)\b/i, attribute: 'Low-Sodium' },
  { regex: /\b(farm-fresh|farm fresh)\b/i, attribute: 'farm-fresh' },
  { regex: /\b(local)\b/i, attribute: 'local' },
]

const BRAND_PATTERNS: Array<{ regex: RegExp; brand: string }> = [
  { regex: /\b(srnty|serenity|serenity kids)\b/i, brand: 'Serenity Kids' },
  { regex: /\b(tj|tjs|trader joe'?s|trader joes)\b/i, brand: "Trader Joe's" },
  { regex: /\b(365|whole foods)\b/i, brand: '365 Whole Foods' },
  { regex: /\b(kirkland|kirkland signature)\b/i, brand: 'Kirkland Signature' },
  { regex: /\b(great value)\b/i, brand: 'Great Value' },
  { regex: /\b(organic valley|org valley)\b/i, brand: 'Organic Valley' },
  { regex: /\b(applegate|applgte)\b/i, brand: 'Applegate' },
  { regex: /\b(vital farms|vtl frms)\b/i, brand: 'Vital Farms' },
  { regex: /\b(horizon|hrzn)\b/i, brand: 'Horizon' },
  { regex: /\b(chobani)\b/i, brand: 'Chobani' },
  { regex: /\b(fage)\b/i, brand: 'Fage' },
  { regex: /\b(kraft)\b/i, brand: 'Kraft' },
  { regex: /\b(heinz)\b/i, brand: 'Heinz' },
  { regex: /\b(tillamook)\b/i, brand: 'Tillamook' },
  { regex: /\b(califia|califia farms)\b/i, brand: 'Califia Farms' },
  { regex: /\b(forager|forager project)\b/i, brand: 'Forager Project' },
  { regex: /\b(oatly)\b/i, brand: 'Oatly' },
  { regex: /\b(stonyfield)\b/i, brand: 'Stonyfield' },
]

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bccao\b/i, 'Cacao'],
  [/\bmagc\b/i, 'Magic'],
  [/\bwhl\b/i, 'Whole'],
  [/\bmlk\b/i, 'Milk'],
  [/\bchkn\b/i, 'Chicken'],
  [/\bckn\b/i, 'Chicken'],
  [/\bbrst\b/i, 'Breast'],
  [/\bthgh\b/i, 'Thigh'],
  [/\bbf\b/i, 'Beef'],
  [/\bgrnd\b/i, 'Ground'],
  [/\bygrt\b/i, 'Yogurt'],
  [/\byog\b/i, 'Yogurt'],
  [/\bchz\b/i, 'Cheese'],
  [/\bchs\b/i, 'Cheese'],
  [/\bbuttr\b/i, 'Butter'],
  [/\bbrd\b/i, 'Bread'],
  [/\bappl\b/i, 'Apple'],
  [/\bban\b/i, 'Banana'],
  [/\bstrwby\b/i, 'Strawberry'],
  [/\btmt\b/i, 'Tomato'],
  [/\bonn\b/i, 'Onion'],
  [/\bgarl\b/i, 'Garlic'],
  [/\bppr\b/i, 'Pepper'],
  [/\bsalm\b/i, 'Salmon'],
  [/\bshmp\b/i, 'Shrimp'],
  [/\bwtr\b/i, 'Water'],
  [/\bjce\b/i, 'Juice'],
  [/\bcof\b/i, 'Coffee'],
]

/** Deep enrichment prompt for background calculation while reviewing receipt. */
export function buildDeepEnrichmentPrompt(rawName: string) {
  return `You are the figs kitchen deep-enrichment engine.

Given this EXACT raw receipt line text, extract clean structured metadata into strict JSON.

RAW LINE: ${JSON.stringify(rawName)}

STRICT RULES:
1. brand_name: retailer or manufacturer only (e.g. "Trader Joe's", "365", "Serenity Kids", "Applegate", "Chobani"). null if unknown.
2. product_name: CLEAN base food name ONLY. Fix receipt abbreviations and OCR typos (e.g. "Ccao" -> "Cacao", "Magc" -> "Magic", "Srnty" -> "Serenity", "Org" -> "Organic", "Chkn" -> "Chicken", "Mlk" -> "Milk").
   MUST strip brand_name completely.
   Aggressively strip all dietary buzzwords and attribute markers from product_name (e.g. "Organic", "Vegan", "Gluten-Free", "Grass-Fed", "Free-Range", "Pasture-Raised", "Raw", "Non-GMO", "Plant-Based", "Fresh").
   Retain core substance identifiers, flavor descriptions, and product formats ("Cacao", "Coconut", "Apple Sauce", "Blue Magic").
   Example: "TJ ORG GRASS-FED RAW WHL MILK 1GAL" -> brand_name "Trader Joe's", product_name "Whole Milk", attributes ["organic", "grass-fed", "raw"].
   Example: "Srnty Grss Fd Beef" -> brand_name "Serenity Kids", product_name "Beef", attributes ["grass-fed"].
   Example: "Ccao Coconut Blue Magic" -> product_name "Cacao Coconut Blue Magic".
3. category: REQUIRED. Exactly ONE of: fruit, vegetable, poultry, meat, seafood, dairy & eggs, deli & cured, bakery & bread, pantry staples, oil & condiments, spices & seasoning, leftover, meal prep, beverages, takeout, supplements & powders.
4. utility_tags: Array with at least 1 tag from ["ingredient", "component", "plate", "dish", "meal", "snack", "drink", "topping/garnish"].
5. attributes: Array of accurate attributes inferred from name (e.g. "organic", "grass-fed", "raw", "free-range", "gluten-free", "dairy-free", "vegan", "High-Protein", "perishable").
6. suggested_location: "Fridge", "Freezer", or "Pantry".`
}

/** Strips attributes ("Organic", "Raw", "Grass-Fed", "Free-Range", etc.) out of the item name string
 * into `attributes`, extracts brand into `brand`, un-abbreviates receipt codes, and reorganizes
 * the item into a clean plain English name before adding to Stash. */
export function reorganizeStashItem(rawName: string, category: string): ReorganizedItem {
  let working = rawName.trim()
  const attributes: string[] = []
  let brand: string | null = null

  // 1. Extract brand
  for (const bp of BRAND_PATTERNS) {
    if (bp.regex.test(working)) {
      brand = bp.brand
      working = working.replace(bp.regex, '').trim()
      break
    }
  }

  // 2. Extract attributes & strip them out of the item name string
  for (const ap of ATTRIBUTE_PATTERNS) {
    if (ap.regex.test(working)) {
      if (!attributes.includes(ap.attribute)) attributes.push(ap.attribute)
      working = working.replace(ap.regex, '').trim()
    }
  }

  // 3. Strip size codes e.g. 1GAL, 16OZ, 12PK, 1LB, #1, 24OZ, 12CT, LB, OZ, PK
  working = working.replace(/\b\d+(\.\d+)?\s*(gal|oz|lb|ct|pk|g|kg|ml|l|fl oz)\b/gi, '').trim()
  working = working.replace(/\b\d+\s*(gal|oz|lb|ct|pk)\b/gi, '').trim()
  working = working.replace(/#\d+/g, '').trim()

  // 4. Un-abbreviate common receipt word codes
  for (const [regex, replacement] of ABBREVIATIONS) {
    working = working.replace(regex, replacement)
  }

  // 5. Clean up extra punctuation/spaces and Title Case
  let cleanName = working
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleanName.length > 0) {
    cleanName = cleanName
      .toLowerCase()
      .replace(/(^|[\s-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
  } else {
    cleanName = rawName
  }

  // Default utility tag
  const utilityTags: string[] = ['ingredient']
  if (['beverages'].includes(category)) utilityTags.push('drink')
  if (['fruit', 'bakery & bread'].includes(category)) utilityTags.push('snack')

  return {
    name: cleanName,
    brand,
    attributes: normalizeFigsAttributes(attributes),
    utilityTags: normalizeFigsUtilityTags(utilityTags),
  }
}

/** Phase 3 — Gemini responseSchema for strict deep enrichment JSON. */
export function buildDeepEnrichmentResponseSchema() {
  const nutritionNumber = { type: 'NUMBER' as const, nullable: true }
  return {
    type: 'OBJECT' as const,
    properties: {
      brand_name: { type: 'STRING' as const, nullable: true },
      product_name: { type: 'STRING' as const },
      category: { type: 'STRING' as const, enum: [...FIGS_CATEGORIES] },
      utility_tags: {
        type: 'ARRAY' as const,
        items: { type: 'STRING' as const, enum: [...FIGS_UTILITY_TAGS] },
      },
      attributes: {
        type: 'ARRAY' as const,
        items: { type: 'STRING' as const, enum: [...FIGS_ATTRIBUTES] },
      },
      ingredients: { type: 'STRING' as const, nullable: true },
      suggested_location: {
        type: 'STRING' as const,
        enum: ['Pantry', 'Fridge', 'Freezer'],
        nullable: true,
      },
      nutrition_facts: {
        type: 'OBJECT' as const,
        properties: {
          calories: nutritionNumber,
          protein_g: nutritionNumber,
          carbs_g: nutritionNumber,
          fat_g: nutritionNumber,
          fiber_g: nutritionNumber,
          sodium_mg: nutritionNumber,
          sugar_g: nutritionNumber,
          added_sugar_g: nutritionNumber,
          saturated_fat_g: nutritionNumber,
          cholesterol_mg: nutritionNumber,
          potassium_mg: nutritionNumber,
          iron_mg: nutritionNumber,
          calcium_mg: nutritionNumber,
          weight_g: nutritionNumber,
        },
      },
    },
    required: ['product_name', 'category', 'utility_tags', 'attributes', 'nutrition_facts'],
  }
}

export function buildGeminiExtractionPrompt(scanKind: 'receipt' | 'stash' | 'ingredient', verifiedNames: string[] = []) {
  const scanLabel =
    scanKind === 'receipt' ? 'receipt' : scanKind === 'stash' ? 'fridge/pantry stash audit' : 'single-item ingredient scan'

  const hints =
    verifiedNames.length > 0
      ? `\nUser-verified names to include or merge:\n${verifiedNames.map((n) => `- ${n}`).join('\n')}`
      : ''

  return `You are the figs kitchen intake engine. Analyze this ${scanLabel} image and extract purchasable food lines into a strict ledger schema.

Return STRICT JSON only — one object, no markdown, no code fences:
{
  "header": {
    "merchant_name": string | null,
    "purchased_at": ISO-8601 string | null
  },
  "items": [
    {
      "brand_name": string | null,
      "name": string,
      "quantity": number,
      "unit": string,
      "unit_price": number | null,
      "total_price": number | null,
      "category": one of [${FIGS_CATEGORIES.map((c) => `"${c}"`).join(', ')}],
      "utility_tags": string[] from [${FIGS_UTILITY_TAGS.map((u) => `"${u}"`).join(', ')}],
      "attributes": string[] from [${FIGS_ATTRIBUTES.map((a) => `"${a}"`).join(', ')}],
      "suggested_location": "Pantry" | "Fridge" | "Freezer",
      "calories": number | null,
      "protein_g": number | null,
      "carbs_g": number | null,
      "fat_g": number | null,
      "fiber_g": number | null,
      "sodium_mg": number | null,
      "sugar_g": number | null
    }
  ]
}

Rules:
- Parsing isolation (strict layers — never mix metadata into product_name):
  - brand_name: retailer or manufacturer only (e.g. "Whole Foods", "365").
  - attributes: ALL marketing/diet keywords ("organic", "plant-based", "gluten-free", "kosher", etc.) — strip from name, list only here.
  - name / product_name: base material only after stripping brand + attributes (e.g. "Whole Foods Organic Apple Juice" → brand_name: "Whole Foods", attributes: ["organic"], name: "Apple Juice").
  - You MUST aggressively strip all dietary buzzwords, marketing terms, and attribute markers from the product_name. Words like 'Organic', 'Nondairy', 'Vegan', 'Gluten-Free', 'Plant-Based', 'Sugar-Free', and 'Fresh' must be entirely removed from the string. For example, '365WFM Nondairy Cheddar' must become exactly 'Cheddar' or 'Cheddar Cheese'.
  - While you must strip dietary adjectives like 'Organic', 'Vegan', 'Fresh', and 'Gluten-Free', you MUST retain core substance identifiers, flavor descriptions, and product formats. Words like 'Cacao', 'Coconut', 'Apple Sauce', and unique product descriptors like 'Blue Magic' or 'Beverage Meal' are critical definitions and must never be stripped from the product_name base string.
  - If text contains FREE RANGE / free-range, strip it from the name and always add "free-range" to attributes.
  - quantity + unit: parse pack markers explicitly ("4 CT", "4 count" → quantity: 4, unit: "count"; "2 PK" → quantity: 2, unit: "pack"). Do not default to 1 each when count markers exist.
- category: pick exactly ONE best match from the fixed category list.
- utility_tags: pick 1–3 tags that describe how the item is used; always include at least one.
- attributes: the enum is large (100+ tags) and covers diet/allergen tags, allergen-exclusions, sourcing/ethics, nutrient profile, flavor, texture, and shelf-life. Be EXHAUSTIVE — select every single tag from the enum that is true for this item, not just the one or two most obvious ones. Do not artificially limit how many you return; there is no penalty for a long, accurate list, only for missing ones that clearly apply. Work through every category of the enum for each item: is it perishable or stable/shelf-stable? What allergens is it free of (egg-free, shellfish-free, seafood-free, sesame-free, nightshade-free, allium-free, dairy-free, gluten-free, nut-free, soy-free — infer these from category even when not explicitly labeled, e.g. a vegetable is automatically egg-free/shellfish-free/seafood-free/dairy-free)? What diet patterns fit (vegan/vegetarian/pescatarian/paleo/keto/whole30/AIP/low-FODMAP/Mediterranean/carnivore)? What's its flavor profile (salty/savory/smoky/tangy/tart/citrusy/herbal/nutty/floral/peppery/spicy/sweet/bitter/umami/earthy)? What's its texture (crunchy/crispy/creamy/velvety/tender/chewy/flaky/juicy)? What's its nutrient profile (high-protein/fiber-rich/iron-rich/calcium-rich/omega-3-rich/antioxidant-rich/low-glycemic/heart-healthy/calorie-dense/low-calorie/low-fat)? What's its sourcing/processing (organic/local/farm-fresh/artisanal/raw/dried/cured/aged/canned)? Example — canned wild-caught salmon: ["wild-caught", "canned", "shelf-stable", "stable", "omega-3-rich", "heart-healthy", "pescatarian", "high-protein", "egg-free", "shellfish-free", "sesame-free", "nightshade-free", "allium-free", "dairy-free", "gluten-free", "nut-free", "soy-free"] — that is the level of thoroughness expected for every item, not the exception.
- NEVER include header rows, subtotal, tax, total, payment, or change as items.
- Translate receipt shorthand to plain English names.
- quantity defaults to 1, unit defaults to "each" when unknown.
- Be aggressive: never return an empty items array when food lines are visible.
- Estimate nutrition silently for food/drink lines (used server-side only).${hints}`
}
