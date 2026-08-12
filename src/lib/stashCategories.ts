export type StorageZone = 'fridge' | 'freezer' | 'pantry'

export const STASH_CATEGORIES = [
  'Produce',
  'Dairy & eggs',
  'Meat & fish',
  'Bakery',
  'Frozen',
  'Pantry staple',
  'Drink',
  'Condiment',
  'Leftovers',
  'Other',
] as const

export type StashCategory = (typeof STASH_CATEGORIES)[number]

export const STASH_ZONES: { value: StorageZone; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'pantry', label: 'Pantry' },
]

export function inferStashCategory(name: string): StashCategory {
  const n = name.toLowerCase()
  if (/milk|yogurt|cheese|egg|butter|cream/.test(n)) return 'Dairy & eggs'
  if (/chicken|beef|pork|fish|salmon|shrimp|turkey|bacon|sausage/.test(n)) return 'Meat & fish'
  if (/bread|bagel|croissant|roll|bun|tortilla/.test(n)) return 'Bakery'
  if (/frozen|ice cream/.test(n)) return 'Frozen'
  if (/soda|juice|water|beer|wine|coffee|tea/.test(n)) return 'Drink'
  if (/sauce|ketchup|mustard|mayo|dressing|oil|vinegar|jam|honey/.test(n)) return 'Condiment'
  if (/leftover/.test(n)) return 'Leftovers'
  if (/rice|pasta|flour|sugar|bean|can|cereal|oat|nut/.test(n)) return 'Pantry staple'
  if (/apple|banana|lettuce|tomato|onion|carrot|pepper|berry|fruit|vegetable|herb|cilantro|spinach/.test(n)) {
    return 'Produce'
  }
  return 'Other'
}

export function suggestStorageZone(category: StashCategory): StorageZone {
  if (category === 'Pantry staple' || category === 'Drink' || category === 'Condiment') return 'pantry'
  if (category === 'Frozen') return 'freezer'
  return 'fridge'
}

export function suggestZoneForCategory(category: string, productName = ''): StorageZone {
  const cat = normalizeFigsExpirationCategory(category)
  const name = productName.toLowerCase()

  if (name.includes('frozen') || cat === 'frozen') return 'freezer'
  if (/(canned|can of|jarred|pickle|olive|rice|pasta|flour|sugar|oats|cereal|dry bean|lentil|potato|onion|garlic|shallot|squash|pumpkin|yam|sweet potato)/.test(name)) {
    return 'pantry'
  }
  if (/(tofu|tempeh|seitan|plant-based)/.test(name)) return 'fridge'
  if (['seafood', 'poultry', 'meat', 'takeout', 'leftover', 'meal prep', 'dairy & eggs', 'deli & cured', 'fruit', 'vegetable'].includes(cat)) {
    return 'fridge'
  }
  return 'pantry'
}

/**
 * ─── Comprehensive Hardcoded Expiration Engine ───────────────────────────────────────
 * Computes deterministic shelf life days using exact category base days, product name
 * keyword overrides, storage zone multipliers, utility tag modifiers, and attribute modifiers.
 */

const CATEGORY_BASE_DAYS: Record<string, number> = {
  seafood: 2,
  poultry: 3,
  meat: 4,
  takeout: 4,
  leftover: 4,
  'meal prep': 5,
  'bakery & bread': 7,
  fruit: 7,
  vegetable: 7,
  'dairy & eggs': 14,
  'deli & cured': 14,
  beverages: 30,
  'oil & condiments': 180,
  'pantry staples': 365,
  'spices & seasoning': 730,
  'supplements & powders': 730,
  frozen: 90,
}

const LEGACY_TO_FIGS: Record<string, string> = {
  poultry: 'poultry',
  meat: 'meat',
  seafood: 'seafood',
  vegetable: 'vegetable',
  vegetables: 'vegetable',
  produce: 'vegetable',
  fruit: 'fruit',
  fruits: 'fruit',
  sauces: 'oil & condiments',
  sauce: 'oil & condiments',
  condiment: 'oil & condiments',
  beverages: 'beverages',
  beverage: 'beverages',
  drink: 'beverages',
  dairy: 'dairy & eggs',
  bakery: 'bakery & bread',
  bread: 'bakery & bread',
  pantry_staple: 'pantry staples',
  pantry: 'pantry staples',
  staple: 'pantry staples',
  frozen: 'frozen',
}

function normalizeFigsExpirationCategory(category: string): string {
  const raw = String(category ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
  if (CATEGORY_BASE_DAYS[raw] != null) return raw
  const underscored = raw.replace(/\s+/g, '_')
  if (LEGACY_TO_FIGS[underscored]) return LEGACY_TO_FIGS[underscored]
  if (LEGACY_TO_FIGS[raw]) return LEGACY_TO_FIGS[raw]
  if (raw.includes('seafood') || raw.includes('fish') || raw.includes('shrimp')) return 'seafood'
  if (raw.includes('poultry') || raw.includes('chicken') || raw.includes('turkey')) return 'poultry'
  if (raw.includes('meat') || raw.includes('beef') || raw.includes('pork')) return 'meat'
  if (raw.includes('dairy') || raw.includes('egg') || raw.includes('milk') || raw.includes('cheese') || raw.includes('yogurt')) return 'dairy & eggs'
  if (raw.includes('deli') || raw.includes('cured') || raw.includes('bacon')) return 'deli & cured'
  if (raw.includes('bakery') || raw.includes('bread') || raw.includes('bagel')) return 'bakery & bread'
  if (raw.includes('beverage') || raw.includes('drink') || raw.includes('juice')) return 'beverages'
  if (raw.includes('oil') || raw.includes('condiment') || raw.includes('sauce') || raw.includes('dressing')) return 'oil & condiments'
  if (raw.includes('spice') || raw.includes('season')) return 'spices & seasoning'
  if (raw.includes('supplement') || raw.includes('powder')) return 'supplements & powders'
  if (raw.includes('leftover')) return 'leftover'
  if (raw.includes('meal prep') || raw.includes('prepped')) return 'meal prep'
  if (raw.includes('takeout') || raw.includes('take-out')) return 'takeout'
  if (raw.includes('frozen')) return 'frozen'
  if (raw.includes('fruit')) return 'fruit'
  if (raw.includes('vegetable') || raw.includes('produce')) return 'vegetable'
  return 'pantry staples'
}

function getBaseDaysWithOverrides(productName: string, category: string, attributes: string[] = []): number {
  const name = productName.toLowerCase()
  const attrLower = attributes.map((a) => String(a).toLowerCase())

  // Long-life dry & canned staples
  if (/(canned|can of|jarred|dried|dehydrated|jerky|powdered)/.test(name)) return 365
  if (/(water|seltzer|soda|sparkling|cola|liquor|vodka|whiskey|wine)/.test(name)) return 365
  if (/(spice|salt|pepper|cinnamon|paprika|oregano|thyme|garlic powder)/.test(name)) return 730

  // Hard cheeses vs soft cheeses
  if (/(parmesan|pecorino|cheddar|swiss|gouda|asiago|gruyere)/i.test(name)) {
    if (attrLower.includes('dairy-free') || attrLower.includes('vegan') || /plant/.test(name)) return 14
    return 90
  }
  if (/(mozzarella|ricotta|brie|feta|cottage|cream cheese)/i.test(name)) return 14
  if (/(butter|margarine)/i.test(name)) return 90

  // Produce overrides
  if (/(potato|onion|garlic|shallot|squash|pumpkin|yam|sweet potato)/.test(name)) return 60
  if (/(apple|orange|lemon|lime|grapefruit)/.test(name)) return 21
  if (/(berry|strawberry|raspberry|blueberry|spinach|lettuce|herb|cilantro|basil|sprout|avocado)/.test(name)) return 4
  if (name.includes('banana')) return 5

  // Protein overrides
  if (/(shrimp|oyster|mussel|sushi|raw fish)/.test(name)) return 2
  if (/(ground beef|mince|patty|sausage)/.test(name)) return 3
  if (/(chicken breast|turkey wing|chicken thigh)/.test(name)) return 3
  if (/(tofu|tempeh|seitan|plant-based|vegan meat|beyond|impossible)/.test(name)) return 7
  if (name.includes('egg') && !name.includes('eggplant')) return 30

  // Sweets & condiments
  if (/choc|candy|confection/i.test(name)) return 180
  if (/(ketchup|mustard|mayo|dressing|soy sauce|hot sauce|jam|jelly|honey|maple syrup|vinegar|olive oil)/.test(name)) return 180
  if (name.includes('ramen') || name.includes('noodle')) return 365

  return CATEGORY_BASE_DAYS[category] || 7
}

function getStorageMultiplier(productName: string, category: string, storage: string): number {
  const name = productName.toLowerCase()
  const isPerishable = ['seafood', 'poultry', 'meat', 'takeout', 'leftover', 'meal prep', 'dairy & eggs', 'deli & cured'].includes(category)
  const isProduce = ['fruit', 'vegetable'].includes(category)
  const isBread = category === 'bakery & bread'
  const isRootVeggie = /(potato|onion|garlic|shallot|squash|pumpkin|yam|sweet potato)/.test(name)
  const isPlantProtein = /(tofu|tempeh|seitan|plant-based)/.test(name)

  if (storage === 'freezer') {
    if (isPerishable || isProduce || isBread || isPlantProtein) return 24.0
    return 1.0
  }
  if (storage === 'pantry') {
    if (isRootVeggie) return 1.0
    if (isPlantProtein) return 0.25
    if (isPerishable) return 0.25
    if (isProduce) return 0.4
    return 1.0
  }
  if (storage === 'fridge') {
    if (isBread) return 0.8
    if (isRootVeggie) return 0.8
    return 1.0
  }
  return 1.0
}

const UTILITY_MULTIPLIERS: Record<string, number> = {
  plate: 0.6,
  dish: 0.6,
  meal: 0.6,
  component: 0.75,
  snack: 1.0,
  drink: 1.0,
  'topping/garnish': 1.2,
  ingredient: 1.0,
}

const ATTRIBUTE_MULTIPLIERS: Record<string, number> = {
  Fermented: 2.5,
  fermented: 2.5,
  Probiotic: 1.8,
  probiotic: 1.8,
  stable: 3.0,
  'shelf-stable': 3.0,
  'pantry-staple': 3.0,
  organic: 0.85,
  'farm-fresh': 0.85,
  local: 0.9,
  'wild-caught': 0.9,
  'pasture-raised': 0.95,
  'grass-fed': 0.95,
  perishable: 0.7,
  raw: 0.75,
  'cold-pressed': 0.8,
  unrefined: 0.8,
  artisanal: 0.8,
  'No Added Sugar': 0.9,
  'Sugar-Free': 0.9,
  'Low-Sodium': 0.9,
}

function attrMultiplierKey(attr: string): number {
  if (ATTRIBUTE_MULTIPLIERS[attr] != null) return ATTRIBUTE_MULTIPLIERS[attr]
  const hit = Object.entries(ATTRIBUTE_MULTIPLIERS).find(([k]) => k.toLowerCase() === attr.toLowerCase())
  return hit ? hit[1] : 1.0
}

/** Days of shelf life for an item — category-base-days × name-override × storage-zone multiplier
 * × utility/attribute multipliers, clamped per storage zone. */
export function shelfLifeDays(category: string, zone: StorageZone, name = '', utilities: string[] = [], attributes: string[] = []): number {
  const cat = normalizeFigsExpirationCategory(category)
  const baseDays = getBaseDaysWithOverrides(name, cat, attributes)
  const storageMux = getStorageMultiplier(name, cat, zone)
  const utilityMux = (utilities.length ? utilities : ['ingredient']).reduce((acc, util) => acc * (UTILITY_MULTIPLIERS[util] || 1.0), 1.0)
  const rawAttrMux = attributes.reduce((acc, attr) => acc * attrMultiplierKey(attr), 1.0)
  const attributeMux = Math.max(0.5, rawAttrMux)

  let finalDays = Math.floor(baseDays * storageMux * utilityMux * attributeMux)
  if (zone === 'freezer') finalDays = Math.min(finalDays, 365)
  if (zone === 'pantry' && finalDays > 730) finalDays = 730

  if (/(water|soda|seltzer|sparkling|cola)/i.test(name)) {
    return zone === 'fridge' || zone === 'pantry' ? 365 : Math.max(2, finalDays)
  }

  return Math.max(2, finalDays)
}

export function expiryDateFor(
  category: string,
  zone: StorageZone,
  name = '',
  utilities: string[] = [],
  attributes: string[] = [],
  from = new Date(),
): string {
  const days = shelfLifeDays(category, zone, name, utilities, attributes)
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}
