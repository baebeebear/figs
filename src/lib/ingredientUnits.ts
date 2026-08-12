/**
 * Master Unit Registry — ported from figs_1.0, single source for stash/grocery/scan unit pickers.
 */
export const VALID_UNITS = [
  'mg',
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'fl oz',
  'cup',
  'pt',
  'qt',
  'gal',
  'clove',
  'stalk',
  'rib',
  'head',
  'bulb',
  'bunch',
  'sprig',
  'leaf',
  'slice',
  'pat',
  'wedge',
  'segment',
  'fillet',
  'piece',
  'whole',
  'unit',
  'each',
  'dozen',
  'half',
  'quarter',
  'can',
  'jar',
  'tin',
  'bottle',
  'bag',
  'packet',
  'package',
  'pouch',
  'box',
  'carton',
  'tub',
  'container',
  'sachet',
  'stick',
  'bar',
  'loaf',
  'roll',
  'tray',
  'pinch',
  'dash',
  'smidgen',
  'drop',
  'splash',
  'squeeze',
] as const

export type ValidUnit = (typeof VALID_UNITS)[number]

const VALID_SET = new Set<string>(VALID_UNITS)

/** Full registry matches for pickers; "each" is listed first for intake speed. */
export function unitComboSuggestions(query: string): string[] {
  const ranked = ['each', ...VALID_UNITS.filter((u) => u !== 'each')]
  const lower = query.trim().toLowerCase()
  if (!lower) return [...ranked]
  return ranked.filter((u) => {
    const ul = u.toLowerCase()
    return ul.startsWith(lower) || ul.includes(lower)
  })
}

const LOWER_TO_VALID = new Map<string, string>()
for (const u of VALID_UNITS) {
  LOWER_TO_VALID.set(u.toLowerCase(), u)
}

const ALIAS_TO_CANON: Record<string, string> = {
  gram: 'g',
  grams: 'g',
  milligram: 'mg',
  milligrams: 'mg',
  kilogram: 'kg',
  kilograms: 'kg',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  liter: 'l',
  litre: 'l',
  liters: 'l',
  litres: 'l',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  floz: 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  cups: 'cup',
  pint: 'pt',
  pints: 'pt',
  quart: 'qt',
  quarts: 'qt',
  gallon: 'gal',
  gallons: 'gal',
  ounce: 'oz',
  ounces: 'oz',
  pound: 'lb',
  pounds: 'lb',
  cloves: 'clove',
  pieces: 'piece',
  slices: 'slice',
  pats: 'pat',
  fillets: 'fillet',
  stalks: 'stalk',
  ribs: 'rib',
  heads: 'head',
  bulbs: 'bulb',
  bunches: 'bunch',
  sprigs: 'sprig',
  leaves: 'leaf',
  wedges: 'wedge',
  segments: 'segment',
  cans: 'can',
  jars: 'jar',
  tins: 'tin',
  bottles: 'bottle',
  bags: 'bag',
  packets: 'packet',
  packages: 'package',
  pkgs: 'package',
  packs: 'package',
  pouches: 'pouch',
  boxes: 'box',
  cartons: 'carton',
  tubs: 'tub',
  containers: 'container',
  sachets: 'sachet',
  sticks: 'stick',
  bars: 'bar',
  loaves: 'loaf',
  rolls: 'roll',
  trays: 'tray',
}

/** Normalize typed or pasted unit to a single `VALID_UNITS` entry, or `''` if unknown. */
export function normalizeStashUnitInput(raw: string): string {
  const collapsed = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!collapsed) return ''
  if (LOWER_TO_VALID.has(collapsed)) return LOWER_TO_VALID.get(collapsed)!
  const alias = ALIAS_TO_CANON[collapsed]
  if (alias && VALID_SET.has(alias)) return alias
  return ''
}

/** Abbreviated units that never pluralize (their symbol is invariant). */
const INVARIANT_UNITS = new Set<string>([
  'mg', 'g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'fl oz', 'pt', 'qt', 'gal',
  'dozen', 'each', 'unit', 'whole', 'half', 'quarter',
])

/** Irregular or non-`+s` plurals for spelled-out countable units. */
const IRREGULAR_PLURALS: Record<string, string> = {
  leaf: 'leaves',
  loaf: 'loaves',
  pinch: 'pinches',
  dash: 'dashes',
  bunch: 'bunches',
  box: 'boxes',
  pouch: 'pouches',
  squeeze: 'squeezes',
  splash: 'splashes',
}

/** Plural form of a spelled-out unit (e.g. `clove` → `cloves`, `leaf` → `leaves`). Abbreviations
 * and non-count units are returned unchanged. */
export function pluralizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase()
  if (!u || INVARIANT_UNITS.has(u)) return unit
  if (IRREGULAR_PLURALS[u]) return IRREGULAR_PLURALS[u]
  if (u.endsWith('s')) return unit
  return `${unit}s`
}

/** Chooses singular/plural unit for display based on the amount: plural for any quantity other
 * than exactly 1 (so "2 cloves", "0.5 cups", "1 clove"). Non-numeric amounts stay singular. */
export function displayUnitForAmount(amount: string | number | null | undefined, unit: string): string {
  const u = (unit ?? '').trim()
  if (!u) return ''
  let n: number | null = null
  if (typeof amount === 'number') n = amount
  else if (typeof amount === 'string' && amount.trim()) {
    const cleaned = amount.trim()
    const unicode: Record<string, number> = {
      '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
      '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6, '⅚': 5 / 6,
      '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
    }
    if (unicode[cleaned] != null) n = unicode[cleaned]
    else {
      const frac = cleaned.match(/^(\d+\s+)?(\d+)\s*\/\s*(\d+)$/)
      if (frac) {
        const whole = frac[1] ? parseFloat(frac[1]) : 0
        const den = parseFloat(frac[3])
        n = den ? whole + parseFloat(frac[2]) / den : null
      } else {
        const parsed = parseFloat(cleaned)
        n = Number.isFinite(parsed) ? parsed : null
      }
    }
  }
  if (n == null) return u
  return n === 1 ? u : pluralizeUnit(u)
}
