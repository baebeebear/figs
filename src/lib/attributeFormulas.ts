/** Deterministic keyword/threshold formulas that derive attributes figs doesn't get from AI
 * extraction — used to merge into whatever `attributes` an item already carries (union, dedup),
 * and to compute recipe-ingredient attributes from scratch (recipe ingredients store none today). */

const PERISHABLE_HINTS = /\b(milk|yogurt|cream|fresh|raw|meat|poultry|chicken|beef|pork|fish|seafood|shrimp|salmon|berry|berries|lettuce|spinach|herb|leafy)\b/i
const STABLE_HINTS = /\b(canned|can of|jarred|dried|dehydrated|jerky|powdered|freeze[- ]dried|shelf[- ]stable)\b/i
const PANTRY_STAPLE_HINTS = /\b(rice|pasta|flour|sugar|bean|lentil|cereal|oat|noodle|grain|quinoa)\b/i
const FIBER_RICH_HINTS = /\b(bean|lentil|chickpea|oat|bran|whole[- ]?grain|broccoli|artichoke|raspberry|avocado|chia|flax)\b/i
const PESCATARIAN_EXCLUDE = /\b(chicken|beef|pork|turkey|lamb|bacon|sausage|ham|duck|veal)\b/i
const PESCATARIAN_INCLUDE = /\b(fish|salmon|shrimp|tuna|cod|tilapia|crab|lobster|scallop|anchovy|sardine|mussel|clam|oyster|seafood)\b/i
const MEAT_HINTS = /\b(chicken|beef|pork|turkey|lamb|bacon|sausage|ham|duck|veal|fish|salmon|shrimp|seafood)\b/i
const PALEO_EXCLUDE = /\b(bean|lentil|rice|pasta|flour|sugar|dairy|milk|cheese|yogurt|bread|grain|oat|corn|potato|legume)\b/i
const UMAMI_HINTS = /\b(mushroom|soy sauce|miso|parmesan|anchovy|tomato paste|broth|stock|fish sauce|nutritional yeast|seaweed|nori|worcestershire)\b/i
const ACIDIC_HINTS = /\b(lemon|lime|vinegar|citrus|orange|grapefruit|tomato|yogurt|buttermilk|pickle|sauerkraut|wine)\b/i
const SPICY_HINTS = /\b(chili|chile|jalapeno|jalapeño|habanero|cayenne|sriracha|hot sauce|pepper flakes|wasabi|horseradish|ghost pepper|szechuan)\b/i
const SWEET_HINTS = /\b(sugar|honey|maple|syrup|candy|chocolate|caramel|jam|jelly|fruit|berry|dessert)\b/i
const BITTER_HINTS = /\b(coffee|dark chocolate|kale|arugula|radicchio|grapefruit|bitter melon|espresso|cocoa|beer)\b/i
const EARTHY_HINTS = /\b(mushroom|beet|potato|truffle|lentil|root vegetable|turnip|parsnip|jicama)\b/i
const CALORIE_DENSE_HINTS = /\b(butter|oil|cheese|bacon|nut|nuts|peanut|almond|cream|avocado|chocolate|fried)\b/i
const LOW_CALORIE_HINTS = /\b(lettuce|celery|cucumber|zucchini|spinach|kale|broth|water|cabbage|sprouts)\b/i

// Allergen-exclusion tags: true by default (matches the existing `paleo` pattern below),
// false only when the ingredient itself is the excluded allergen/family.
const EGG_HINTS = /\begg/i
const SHELLFISH_HINTS = /\b(shrimp|prawn|crab|lobster|scallop|oyster|mussel|clam|crawfish|crayfish)\b/i
const SEAFOOD_HINTS = /\b(fish|salmon|tuna|cod|tilapia|halibut|anchovy|sardine|seafood|shrimp|prawn|crab|lobster|scallop|oyster|mussel|clam)\b/i
const SESAME_HINTS = /\b(sesame|tahini)\b/i
const NIGHTSHADE_HINTS = /\b(tomato|potato|eggplant|aubergine|bell pepper|chili|chile|paprika|cayenne|goji)\b/i
const ALLIUM_HINTS = /\b(onion|garlic|leek|shallot|chive|scallion)\b/i

// Sourcing/processing keyword tags.
const LINE_CAUGHT_HINTS = /\b(line[- ]caught)\b/i
const CAGE_FREE_HINTS = /\b(cage[- ]free)\b/i
const NON_IRRADIATED_HINTS = /\b(non[- ]irradiated)\b/i
const RAW_HINTS = /\b(raw|unpasteurized)\b/i
const COLD_PRESSED_HINTS = /\b(cold[- ]pressed)\b/i
const UNREFINED_HINTS = /\b(unrefined|whole[- ]grain|whole wheat)\b/i
const ARTISANAL_HINTS = /\b(artisan|artisanal|small[- ]batch|handcrafted)\b/i
const CANNED_HINTS = /\b(canned|can of|tinned)\b/i
const DRIED_HINTS = /\b(dried(?!\s+fruit\s*juice))\b/i
const DEHYDRATED_HINTS = /\b(dehydrated|freeze[- ]dried)\b/i
const CURED_HINTS = /\b(cured|smoked|salami|prosciutto|pancetta|pastrami|bacon)\b/i
const AGED_HINTS = /\b(aged|reserve|vintage)\b/i
const FREEZER_STABLE_HINTS = /\b(frozen|freezer)\b/i
const CHILLED_HINTS = /\b(chilled|refrigerated)\b/i

// Nutrient-profile keyword tags.
const LOW_FAT_HINTS = /\b(low[- ]fat|fat[- ]free|nonfat|skim)\b/i
const ZERO_CARB_HINTS = /\b(zero[- ]carb|carb[- ]free)\b/i
const ELECTROLYTE_HINTS = /\b(electrolyte|coconut water|sports drink|gatorade)\b/i
const IRON_RICH_HINTS = /\b(spinach|red meat|beef|liver|lentil|beans?|shellfish|tofu|quinoa)\b/i
const CALCIUM_RICH_HINTS = /\b(milk|cheese|yogurt|kale|sardine|tofu|almond)\b/i
const OMEGA3_HINTS = /\b(salmon|mackerel|sardine|anchovy|tuna|flax|flaxseed|chia|walnut|fish oil)\b/i
const ANTIOXIDANT_HINTS = /\b(berry|berries|blueberr|dark chocolate|green tea|pomegranate|goji|pecan|kale|spinach)\b/i
const LOW_GLYCEMIC_HINTS = /\b(lentil|chickpea|quinoa|oat|barley|leafy green|broccoli)\b/i
const HEART_HEALTHY_HINTS = /\b(salmon|oats|olive oil|avocado|walnut|flaxseed|legume|beans?)\b/i

// Flavor-profile keyword tags (primary tastes + aromatics).
const SALTY_HINTS = /\b(salt|salted|brine|pickle|soy sauce|anchovy|bacon|olive|feta|cured|sea salt)\b/i
const SAVORY_HINTS = /\b(mushroom|parmesan|broth|stock|umami|soy sauce|bacon|tomato)\b/i
const SMOKY_HINTS = /\b(smoked|smoky|chipotle|bacon|barbecue|bbq|charred|grilled)\b/i
const TANGY_HINTS = /\b(vinegar|yogurt|buttermilk|pickle|sauerkraut|mustard|tangy)\b/i
const TART_HINTS = /\b(cranberr|sour cherry|rhubarb|green apple|tamarind|sour|tart)\b/i
const CITRUSY_HINTS = /\b(lemon|lime|orange|grapefruit|citrus|tangerine|yuzu|lemongrass)\b/i
const HERBAL_HINTS = /\b(basil|thyme|rosemary|oregano|mint|cilantro|parsley|dill|sage|tarragon|herb)\b/i
const NUTTY_HINTS = /\b(almond|walnut|pecan|hazelnut|cashew|peanut|pistachio|sesame|tahini|brown butter)\b/i
const FLORAL_HINTS = /\b(lavender|elderflower|rosewater|hibiscus|jasmine|chamomile)\b/i
const FUNKY_HINTS = /\b(blue cheese|fish sauce|fermented|kimchi|natto|stinky|aged cheese|aged miso)\b/i
const PEPPERY_HINTS = /\b(black pepper|white pepper|peppercorn|peppery|ginger|radish|radishes)\b/i

// Blank-canvas neutrals — fat/carb/protein without distinctive flavor of their own.
const NEUTRAL_OIL_HINTS = /\b(canola(?:\s+oil)?|grapeseed(?:\s+oil)?|grape[- ]seed(?:\s+oil)?|vegetable oil)\b/i
const NEUTRAL_CARB_HINTS = /\b(white rice|plain pasta|plain spaghetti|plain noodles?)\b/i
const NEUTRAL_PROTEIN_HINTS = /\b(tofu|chicken breast)\b/i

// Texture / mouthfeel keyword tags.
const CRUNCHY_HINTS = /\b(cracker|chip|crouton|granola|celery|raw carrot|pretzel|crisp|crunchy)\b/i
const CRISPY_HINTS = /\b(fried|tempura|crispy|bacon|crackling|panko|toasted bread)\b/i
const CREAMY_HINTS = /\b(cream|custard|pudding|mousse|yogurt|mashed|hummus|nut butter|avocado|butter)\b/i
const VELVETY_HINTS = /\b(bisque|pureed?|silky|custard|velvety)\b/i
const TENDER_HINTS = /\b(braised|slow[- ]cooked|tenderloin|filet|short rib|tender)\b/i
const CHEWY_HINTS = /\b(jerky|taffy|caramel|dried fruit|gummy|mochi|chewy)\b/i
const FLAKY_HINTS = /\b(pastry|croissant|puff pastry|pie crust|phyllo|filo|biscuit|flaky|cooked fish)\b/i
const JUICY_HINTS = /\b(watermelon|peach|orange|grape|melon|citrus|pineapple|juicy)\b/i
const THICK_HINTS = /\b(paste|puree|thick|reduction|concentrate|honey)\b/i
const DENSE_HINTS = /\b(dense|paste|reduction|concentrate)\b/i
const RICH_HINTS = /\b(heavy cream|butter|rich|cream sauce)\b/i
const LIGHT_HINTS = /\b(sparkling water|broth|consomme|sorbet|salad greens|light)\b/i
const BROTHY_HINTS = /\b(broth|stock|bouillon|consomme|soup base|brothy)\b/i

export function isNeutralIngredient(name: string): boolean {
  const n = (name || '').toLowerCase()
  return NEUTRAL_OIL_HINTS.test(n) || NEUTRAL_CARB_HINTS.test(n) || NEUTRAL_PROTEIN_HINTS.test(n)
}

function has(re: RegExp, text: string): boolean {
  return re.test(text)
}

/** Derives figs's newer "formula" attributes for a single ingredient name (+ optional category),
 * additive to whatever AI-sourced diet/allergen attributes already exist. */
export function deriveIngredientAttributes(name: string, category?: string | null): string[] {
  const n = (name || '').toLowerCase()
  const cat = (category || '').toLowerCase()
  const out: string[] = []

  if (STABLE_HINTS.test(n) || /pantry staples|spices|oil & condiments|supplements/.test(cat)) out.push('stable')
  else if (PERISHABLE_HINTS.test(n) || /seafood|poultry|meat|dairy|produce|fruit|vegetable/.test(cat)) out.push('perishable')

  if (PANTRY_STAPLE_HINTS.test(n) || cat === 'pantry staples') out.push('pantry-staple')
  if (FIBER_RICH_HINTS.test(n)) out.push('fiber-rich')

  if (PESCATARIAN_INCLUDE.test(n) || (!PESCATARIAN_EXCLUDE.test(n) && !/meat|poultry/.test(cat))) {
    if (!MEAT_HINTS.test(n) || PESCATARIAN_INCLUDE.test(n)) out.push('pescatarian')
  }
  if (!PALEO_EXCLUDE.test(n)) out.push('paleo')

  if (UMAMI_HINTS.test(n)) out.push('umami')
  if (ACIDIC_HINTS.test(n)) out.push('acidic')
  if (SPICY_HINTS.test(n)) out.push('spicy')
  if (SWEET_HINTS.test(n)) out.push('sweet')
  if (BITTER_HINTS.test(n)) out.push('bitter')
  if (EARTHY_HINTS.test(n)) out.push('earthy')

  if (CALORIE_DENSE_HINTS.test(n)) out.push('calorie-dense')
  else if (LOW_CALORIE_HINTS.test(n)) out.push('low-calorie')

  // Allergen-exclusion tags — true by default (same "true unless excluded" pattern as paleo
  // above), false only when the ingredient itself is the excluded allergen/family.
  if (!EGG_HINTS.test(n)) out.push('egg-free')
  if (!SHELLFISH_HINTS.test(n)) out.push('shellfish-free')
  if (!SEAFOOD_HINTS.test(n)) out.push('seafood-free')
  if (!SESAME_HINTS.test(n)) out.push('sesame-free')
  if (!NIGHTSHADE_HINTS.test(n)) out.push('nightshade-free')
  if (!ALLIUM_HINTS.test(n)) out.push('allium-free')

  // Sourcing / processing / preservation keyword tags.
  if (LINE_CAUGHT_HINTS.test(n)) out.push('line-caught')
  if (CAGE_FREE_HINTS.test(n)) out.push('cage-free')
  if (NON_IRRADIATED_HINTS.test(n)) out.push('non-irradiated')
  if (RAW_HINTS.test(n)) out.push('raw')
  if (COLD_PRESSED_HINTS.test(n)) out.push('cold-pressed')
  if (UNREFINED_HINTS.test(n)) out.push('unrefined')
  if (ARTISANAL_HINTS.test(n)) out.push('artisanal')
  if (CANNED_HINTS.test(n)) out.push('canned')
  if (DRIED_HINTS.test(n)) out.push('dried')
  if (DEHYDRATED_HINTS.test(n)) out.push('dehydrated')
  if (CURED_HINTS.test(n)) out.push('cured')
  if (AGED_HINTS.test(n)) out.push('aged')
  if (FREEZER_STABLE_HINTS.test(n)) out.push('freezer-stable')
  if (CHILLED_HINTS.test(n)) out.push('chilled')
  if (CANNED_HINTS.test(n) || DRIED_HINTS.test(n) || DEHYDRATED_HINTS.test(n) || STABLE_HINTS.test(n)) out.push('shelf-stable')

  // Nutrient-profile keyword tags.
  if (LOW_FAT_HINTS.test(n)) out.push('low-fat')
  if (ZERO_CARB_HINTS.test(n)) out.push('zero-carb')
  if (ELECTROLYTE_HINTS.test(n)) out.push('electrolyte-rich')
  if (IRON_RICH_HINTS.test(n)) out.push('iron-rich')
  if (CALCIUM_RICH_HINTS.test(n)) out.push('calcium-rich')
  if (OMEGA3_HINTS.test(n)) out.push('omega-3-rich')
  if (ANTIOXIDANT_HINTS.test(n)) out.push('antioxidant-rich')
  if (LOW_GLYCEMIC_HINTS.test(n)) out.push('low-glycemic')
  if (HEART_HEALTHY_HINTS.test(n)) out.push('heart-healthy')

  // Flavor-profile keyword tags.
  if (SALTY_HINTS.test(n)) out.push('salty')
  if (SAVORY_HINTS.test(n)) out.push('savory')
  if (SMOKY_HINTS.test(n)) out.push('smoky')
  if (TANGY_HINTS.test(n)) out.push('tangy')
  if (TART_HINTS.test(n)) out.push('tart')
  if (CITRUSY_HINTS.test(n)) out.push('citrusy')
  if (HERBAL_HINTS.test(n)) out.push('herbal')
  if (NUTTY_HINTS.test(n)) out.push('nutty')
  if (FLORAL_HINTS.test(n)) out.push('floral')
  if (FUNKY_HINTS.test(n)) out.push('funky')
  if (PEPPERY_HINTS.test(n)) out.push('peppery')

  // Texture / mouthfeel keyword tags.
  if (CRUNCHY_HINTS.test(n)) out.push('crunchy')
  if (CRISPY_HINTS.test(n)) out.push('crispy')
  if (CREAMY_HINTS.test(n)) out.push('creamy')
  if (VELVETY_HINTS.test(n)) out.push('velvety')
  if (TENDER_HINTS.test(n)) out.push('tender')
  if (CHEWY_HINTS.test(n)) out.push('chewy')
  if (FLAKY_HINTS.test(n)) out.push('flaky')
  if (JUICY_HINTS.test(n)) out.push('juicy')
  if (THICK_HINTS.test(n)) out.push('thick')
  if (DENSE_HINTS.test(n)) out.push('dense')
  if (RICH_HINTS.test(n)) out.push('rich')
  if (LIGHT_HINTS.test(n)) out.push('light')
  if (BROTHY_HINTS.test(n)) out.push('brothy')
  if (isNeutralIngredient(n)) out.push('neutral')

  // Diet-pattern tags — looser, best-effort heuristics (same approximate spirit as `paleo` above).
  if (MEAT_HINTS.test(n) && !PANTRY_STAPLE_HINTS.test(n)) out.push('carnivore')
  if (/\b(olive oil|feta|chickpea|tomato|cucumber|whole grain|yogurt|fish|herb)\b/i.test(n)) out.push('Mediterranean')
  if (!NIGHTSHADE_HINTS.test(n) && !PANTRY_STAPLE_HINTS.test(n) && !/dairy|egg|nut/.test(cat) && !EGG_HINTS.test(n) && !NUTTY_HINTS.test(n)) {
    out.push('AIP')
  }
  if (!PANTRY_STAPLE_HINTS.test(n) && !SWEET_HINTS.test(n) && !/dairy/.test(cat)) out.push('whole30')
  if (!ALLIUM_HINTS.test(n) && !PANTRY_STAPLE_HINTS.test(n) && !FIBER_RICH_HINTS.test(n)) out.push('low-FODMAP')

  return out
}

/** Primary tastes, aromatics, and mouthfeel — the sensory profile shown in ingredient info.
 * Neutrals (canola oil, white rice, tofu, etc.) surface as just "neutral". */
export const FLAVOR_ATTRIBUTES = new Set([
  'sweet', 'salty', 'acidic', 'bitter', 'umami', 'savory',
  'peppery', 'spicy', 'earthy', 'herbal', 'nutty', 'smoky', 'citrusy', 'funky', 'floral', 'tart', 'tangy',
  'rich', 'creamy', 'velvety', 'crispy', 'crunchy', 'juicy', 'flaky', 'chewy', 'tender', 'light', 'brothy', 'thick', 'dense',
  'neutral',
])

/** Just the flavor-profile tags for an ingredient — e.g. for showing "Acidic · Savory" next to a
 * swap candidate without pulling in its diet/allergen/texture attributes too. */
export function deriveFlavorProfile(name: string, category?: string | null): string[] {
  if (isNeutralIngredient(name)) return ['neutral']
  return deriveIngredientAttributes(name, category).filter((a) => FLAVOR_ATTRIBUTES.has(a) && a !== 'neutral')
}

/** Non-flavor attributes (diet, allergen, sourcing, nutrient) for the info sheet bottom section. */
export function deriveNonFlavorAttributes(name: string, category?: string | null): string[] {
  return deriveIngredientAttributes(name, category).filter((a) => !FLAVOR_ATTRIBUTES.has(a))
}

/** Merges formula-derived attributes into an existing (possibly AI-sourced) attributes array,
 * de-duplicated case-insensitively. */
export function mergeComputedAttributes(existing: string[] | null | undefined, name: string, category?: string | null): string[] {
  const base = existing ?? []
  const derived = deriveIngredientAttributes(name, category)
  const seen = new Set(base.map((a) => a.toLowerCase()))
  const out = [...base]
  for (const attr of derived) {
    if (!seen.has(attr.toLowerCase())) {
      seen.add(attr.toLowerCase())
      out.push(attr)
    }
  }
  return out
}

const VESSEL_KEYWORDS: Record<string, RegExp> = {
  'sheet-pan': /\bsheet pan\b/i,
  'sous-vide': /\bsous[- ]vide\b/i,
  'air-fryer': /\bair fryer\b/i,
  'one-pot': /\b(one pot|one[- ]?pan|dutch oven|single pot)\b/i,
}

const TECHNICAL_KEYWORDS = /\b(temper|fold in|deglaze|sous vide|emulsify|blanch|reduce by|clarify|proof the dough|laminate)\b/i
const CHARRED_KEYWORDS = /\b(char|blacken|grill|sear|torch)\b/i
const GARNISH_KEYWORDS = /\b(garnish|finish with|top with|drizzle over)\b/i
const BATCH_KEYWORDS = /\b(freeze|freezer[- ]friendly|meal prep|batch|make ahead|double the recipe)\b/i
const NO_COOK_KEYWORDS = /\b(no[- ]cook|no cooking required|raw)\b/i
const SLOW_COOK_KEYWORDS = /\b(braise|slow cook|slow[- ]cooker|simmer for hours|low and slow)\b/i

/** Aggregates ingredient-level formula attributes across a recipe, then layers on recipe-only
 * attributes derived from the method text and cook time. Every rule is a small named check so the
 * list stays auditable rather than one giant regex blob. */
export function deriveRecipeAttributes(
  ingredients: { name: string }[],
  steps: string[],
  cookMinutes: number | null | undefined,
): string[] {
  const out = new Set<string>()
  const ingredientNames = ingredients.map((i) => i.name.toLowerCase())
  const methodText = steps.join(' ').toLowerCase()
  const lastStep = (steps[steps.length - 1] ?? '').toLowerCase()

  for (const ing of ingredients) {
    for (const attr of deriveIngredientAttributes(ing.name)) out.add(attr)
  }

  for (const [attr, re] of Object.entries(VESSEL_KEYWORDS)) {
    if (has(re, methodText)) out.add(attr)
  }
  if (NO_COOK_KEYWORDS.test(methodText) || steps.length === 0) out.add('raw/no-cook')
  if (SLOW_COOK_KEYWORDS.test(methodText) || (cookMinutes ?? 0) > 90) out.add('slow-cook')
  if (cookMinutes != null && cookMinutes > 0) {
    if (cookMinutes < 20) out.add('quick')
    else if (cookMinutes <= 60) out.add('moderate')
  }
  if (steps.length > 0 && steps.length <= 3 && !TECHNICAL_KEYWORDS.test(methodText)) out.add('low-touch')
  else if (steps.length > 3) out.add('active-prep')
  if (TECHNICAL_KEYWORDS.test(methodText)) out.add('technical')
  if (CHARRED_KEYWORDS.test(methodText)) out.add('charred')
  if (GARNISH_KEYWORDS.test(lastStep)) out.add('garnish/finisher')
  if (BATCH_KEYWORDS.test(methodText)) out.add('batch-friendly')

  const meatShare = ingredientNames.filter((n) => MEAT_HINTS.test(n)).length / Math.max(1, ingredientNames.length)
  const stapleShare =
    ingredientNames.filter((n) => PANTRY_STAPLE_HINTS.test(n) || STABLE_HINTS.test(n)).length / Math.max(1, ingredientNames.length)
  if (meatShare < 0.25 && stapleShare > 0.3) out.add('budget-friendly')

  const hasSpicyOrBitter = ingredientNames.some((n) => SPICY_HINTS.test(n) || BITTER_HINTS.test(n))
  if (!hasSpicyOrBitter && ingredientNames.length <= 10) out.add('kid-friendly')

  if (out.has('technical') && out.has('active-prep')) out.add('host-worthy')

  const perishableCount = ingredientNames.filter((n) => PERISHABLE_HINTS.test(n)).length
  if (perishableCount >= 4) out.add('high-stash-impact')

  if (ingredientNames.some((n) => UMAMI_HINTS.test(n) && /broth|stock/.test(n))) out.add('broth-based')
  if (ingredientNames.some((n) => /cream|butter|cheese|yogurt/.test(n))) out.add('creamy')
  if (steps.length === 0) out.add('ready-to-eat')

  return Array.from(out)
}
