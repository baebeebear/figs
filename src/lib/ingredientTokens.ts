/**
 * Canonical ingredient-token vocabulary — maps a raw ingredient string (as shown to the user,
 * e.g. "2 cups chopped fresh herbs") to a small, finite token (e.g. `herbs_fresh`) that can be
 * compared against a user's stash regardless of exact wording. Broad/ambiguous source phrases
 * ("fresh herbs", "microgreens or arugula", "any cheese") intentionally collapse into the
 * `_generic` / group buckets below rather than trying to name every possible ingredient.
 */

export const INGREDIENT_TOKENS = [
  // produce
  'herbs_fresh',
  'herbs_dried',
  'leafy_greens',
  'allium',
  'garlic',
  'tomato',
  'pepper_bell',
  'pepper_chili',
  'citrus',
  'potato',
  'root_vegetable',
  'mushroom',
  'cucumber',
  'avocado',
  'corn',
  'fruit_berry',
  'fruit_stone',
  'fruit_tropical',
  'fruit_pome',
  'produce_generic',
  // dairy & eggs
  'cheese_hard',
  'cheese_soft',
  'cheese_generic',
  'milk',
  'cream',
  'butter',
  'yogurt',
  'egg',
  // proteins
  'chicken',
  'beef',
  'pork',
  'fish',
  'shellfish',
  'tofu',
  'bacon_sausage',
  'protein_generic',
  // grains & pantry
  'rice',
  'pasta',
  'flour',
  'bread',
  'grain_generic',
  'legume_bean',
  'nuts_seeds',
  'sugar',
  'sweetener',
  'oil',
  'vinegar',
  'stock_broth',
  'canned_tomato',
  'spice_generic',
  'salt_pepper',
  'sauce_condiment',
  // other
  'water',
  'wine_alcohol',
  'other',
] as const

export type IngredientToken = (typeof INGREDIENT_TOKENS)[number]

const TOKEN_SET = new Set<string>(INGREDIENT_TOKENS)

export function isIngredientToken(value: unknown): value is IngredientToken {
  return typeof value === 'string' && TOKEN_SET.has(value)
}

/**
 * Deterministic keyword classifier — always returns a valid token, defaulting to `other`.
 * Order matters: specific matches are checked before the generic bucket they'd otherwise fall
 * into, so e.g. "parmesan" hits `cheese_hard` before the bare "cheese" fallback ever runs.
 */
export function inferIngredientToken(rawName: string): IngredientToken {
  const n = (rawName || '').toLowerCase()

  // herbs (check dried before fresh; fresh is also the default for bare "herbs")
  if (/\b(dried|dry)\b.*\bherb/.test(n) || /\b(oregano|herbes de provence|italian seasoning)\b/.test(n) && /dried|dry/.test(n)) {
    return 'herbs_dried'
  }
  if (/\bherbs?\b|basil|parsley|cilantro|coriander leaves|\bmint\b|\bdill\b|chives|thyme|rosemary|\bsage\b/.test(n)) {
    return 'herbs_fresh'
  }

  if (/microgreen|arugula|rocket|spinach|kale|lettuce|chard|leafy green|salad green/.test(n)) return 'leafy_greens'

  if (/\bgarlic\b/.test(n)) return 'garlic'
  if (/\bonion|shallot|\bleek|scallion|green onion|spring onion/.test(n)) return 'allium'

  if (/tomato/.test(n) && !/canned|crushed|passata|paste|sauce/.test(n)) return 'tomato'
  if (/canned tomato|crushed tomato|tomato paste|passata/.test(n)) return 'canned_tomato'

  if (/bell pepper|capsicum/.test(n)) return 'pepper_bell'
  if (/chili|chile|jalapeno|jalapeño|habanero|serrano|cayenne pepper|hot pepper/.test(n)) return 'pepper_chili'

  if (/lemon|lime|orange zest|orange juice|citrus|grapefruit/.test(n)) return 'citrus'
  if (/\bpotato/.test(n)) return 'potato'
  if (/carrot|beet|turnip|parsnip|radish|celeriac|root vegetable/.test(n)) return 'root_vegetable'
  if (/mushroom/.test(n)) return 'mushroom'
  if (/cucumber/.test(n)) return 'cucumber'
  if (/avocado/.test(n)) return 'avocado'
  if (/\bcorn\b/.test(n)) return 'corn'
  if (/strawberr|blueberr|raspberr|blackberr|berry|berries/.test(n)) return 'fruit_berry'
  if (/peach|plum|cherry|apricot|nectarine/.test(n)) return 'fruit_stone'
  if (/mango|pineapple|banana|papaya|passion fruit/.test(n)) return 'fruit_tropical'
  if (/\bapple\b|\bpear\b/.test(n)) return 'fruit_pome'

  // dairy & eggs
  if (/parmesan|pecorino|aged cheddar|gruyere|grana padano|romano/.test(n)) return 'cheese_hard'
  if (/mozzarella|ricotta|cream cheese|brie|feta|mascarpone|burrata|goat cheese|cottage cheese/.test(n)) return 'cheese_soft'
  if (/cheese/.test(n)) return 'cheese_generic'
  if (/\bmilk\b/.test(n)) return 'milk'
  if (/heavy cream|half.and.half|whipping cream|\bcream\b/.test(n) && !/cream cheese|sour cream/.test(n)) return 'cream'
  if (/\bbutter\b/.test(n) && !/peanut butter|almond butter/.test(n)) return 'butter'
  if (/yogurt|yoghurt/.test(n)) return 'yogurt'
  if (/\begg\b|\beggs\b/.test(n)) return 'egg'

  // proteins — compound/qualified phrases are checked before the bare protein-name fallback, so
  // e.g. "chicken broth" or "chicken sausage" don't collapse to plain 'chicken' just because they
  // contain that word (which was causing false "detected in your stash" matches against raw
  // chicken/beef stash items).
  if (/stock|broth|bouillon/.test(n)) return 'stock_broth'
  if (/bacon|sausage|salami|chorizo|pancetta/.test(n)) return 'bacon_sausage'
  if (/chicken|poultry/.test(n)) return 'chicken'
  if (/\bbeef\b|steak|ground beef|brisket/.test(n)) return 'beef'
  if (/\bpork\b|\bham\b|prosciutto/.test(n)) return 'pork'
  if (/salmon|tuna|cod|tilapia|halibut|trout|anchov|\bfish\b/.test(n)) return 'fish'
  if (/shrimp|prawn|crab|lobster|scallop|mussel|clam|oyster|shellfish/.test(n)) return 'shellfish'
  if (/\btofu\b|tempeh|seitan/.test(n)) return 'tofu'
  if (/\bany (protein|meat)\b|\bprotein of choice\b/.test(n)) return 'protein_generic'

  // grains & pantry
  if (/\brice\b/.test(n)) return 'rice'
  if (/pasta|noodle|spaghetti|penne|macaroni/.test(n)) return 'pasta'
  if (/\bflour\b/.test(n)) return 'flour'
  if (/\bbread\b|baguette|tortilla|pita|bun\b/.test(n)) return 'bread'
  if (/quinoa|\boats?\b|barley|couscous|farro|bulgur/.test(n)) return 'grain_generic'
  if (/\bbean|lentil|chickpea|garbanzo|legume/.test(n)) return 'legume_bean'
  if (/almond|walnut|pecan|cashew|pistachio|peanut|\bnuts?\b|sesame|sunflower seed|chia|flax/.test(n)) return 'nuts_seeds'
  if (/\bsugar\b/.test(n)) return 'sugar'
  if (/honey|maple syrup|agave/.test(n)) return 'sweetener'
  if (/\boil\b|olive oil|vegetable oil|canola/.test(n)) return 'oil'
  if (/vinegar/.test(n)) return 'vinegar'
  if (/\bspice\b|cumin|paprika|cinnamon|nutmeg|turmeric|cayenne|seasoning|chili powder/.test(n)) return 'spice_generic'
  if (/\bsalt\b|\bpepper\b(?!corn)/.test(n) && !/bell pepper|chili|chile/.test(n)) return 'salt_pepper'
  if (/soy sauce|ketchup|mustard|mayo|mayonnaise|hot sauce|salsa|sauce\b|dressing|condiment/.test(n)) return 'sauce_condiment'

  if (/\bwater\b/.test(n)) return 'water'
  if (/wine|beer|rum|vodka|whiskey|bourbon|brandy|liqueur/.test(n)) return 'wine_alcohol'

  if (/\bany cheese\b/.test(n)) return 'cheese_generic'
  if (/vegetable|produce|greens?\b/.test(n)) return 'produce_generic'

  return 'other'
}
