/** Format a scaled quantity with culinary fractions, never raw JS floats. */
export function formatScaledAmount(n: number): string {
  if (!Number.isFinite(n)) return ''
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const whole = Math.floor(abs + 1e-9)
  const frac = abs - whole

  const FRACTIONS: Array<{ v: number; s: string }> = [
    { v: 0, s: '' },
    { v: 1 / 8, s: '⅛' },
    { v: 1 / 6, s: '⅙' },
    { v: 1 / 5, s: '⅕' },
    { v: 1 / 4, s: '¼' },
    { v: 1 / 3, s: '⅓' },
    { v: 3 / 8, s: '⅜' },
    { v: 2 / 5, s: '⅖' },
    { v: 1 / 2, s: '½' },
    { v: 3 / 5, s: '⅗' },
    { v: 5 / 8, s: '⅝' },
    { v: 2 / 3, s: '⅔' },
    { v: 3 / 4, s: '¾' },
    { v: 4 / 5, s: '⅘' },
    { v: 5 / 6, s: '⅚' },
    { v: 7 / 8, s: '⅞' },
    { v: 1, s: '' },
  ]

  let best = FRACTIONS[0]
  let bestDist = Math.abs(frac - best.v)
  for (const f of FRACTIONS) {
    const d = Math.abs(frac - f.v)
    if (d < bestDist) {
      best = f
      bestDist = d
    }
  }

  if (bestDist <= 0.03) {
    if (best.v === 0) return `${sign}${whole}`
    if (best.v === 1) return `${sign}${whole + 1}`
    return whole ? `${sign}${whole}${best.s}` : `${sign}${best.s}`
  }

  const rounded = Math.round(abs * 100) / 100
  if (rounded % 1 === 0) return `${sign}${rounded}`
  return `${sign}${rounded.toFixed(2).replace(/\.?0+$/, '')}`
}

/** Convert a decimal (or numeric string) to a culinary amount string. */
export function decimalToFraction(value: number | string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    // Already a fraction / mixed / unicode — leave alone if not a bare float.
    if (/[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞\/]/.test(trimmed) && !/^\d+\.\d+$/.test(trimmed)) return trimmed
    const n = parseFloat(trimmed)
    if (!Number.isFinite(n)) return trimmed
    return formatScaledAmount(n)
  }
  return formatScaledAmount(value)
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

/** Parses an ingredient amount string into a number — plain `parseFloat` silently mis-parses
 * fractions ("1/2" → 1, dropping the "/2") and ranges, which was why scaling/unit-conversion
 * visibly did nothing for most real recipe amounts. Handles plain decimals, simple fractions
 * ("1/2"), mixed numbers ("1 1/2"), unicode fraction glyphs ("1½"), and ranges ("2-3", via
 * midpoint). Returns null for genuinely non-numeric amounts ("to taste"). */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const unicodeMatch = trimmed.match(/^(\d+\s*)?([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/)
  if (unicodeMatch) {
    const whole = unicodeMatch[1] ? parseFloat(unicodeMatch[1]) : 0
    return whole + UNICODE_FRACTIONS[unicodeMatch[2]]
  }

  const fractionMatch = trimmed.match(/^(\d+\s+)?(\d+)\s*\/\s*(\d+)$/)
  if (fractionMatch) {
    const whole = fractionMatch[1] ? parseFloat(fractionMatch[1]) : 0
    const num = parseFloat(fractionMatch[2])
    const den = parseFloat(fractionMatch[3])
    if (!den) return null
    return whole + num / den
  }

  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (rangeMatch) {
    return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2
  }

  const n = parseFloat(trimmed)
  return Number.isFinite(n) ? n : null
}

/** Leading-quantity matcher: mixed number ("1 1/2"), fraction ("1/2"), decimal/int with optional
 * range ("2", "2.5", "2-3"), or a unicode fraction glyph, optionally preceded by a whole number. */
const LEADING_AMOUNT_RE =
  /^\s*(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?|\d+\s*[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+(?:\.\d+)?)/

/** Splits a free-text amount into a clean numeric quantity string plus any leftover descriptive
 * text ("2 cloves" → { amount: "2", extra: "cloves" }, "a handful" → { amount: "", extra: "a
 * handful" }). Used to keep the amount field numbers-only and push everything else into notes. */
export function splitLeadingAmount(raw: string): { amount: string; extra: string } {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { amount: '', extra: '' }
  const m = trimmed.match(LEADING_AMOUNT_RE)
  if (!m) return { amount: '', extra: trimmed }
  const amount = m[0].trim().replace(/\s*\/\s*/g, '/').replace(/\s*-\s*/g, '-')
  const extra = trimmed.slice(m[0].length).trim().replace(/^[,;:]\s*/, '')
  return { amount, extra }
}

/** Units recognized when parsing free-text ingredient lines into amount / unit / name / notes. */
const INGREDIENT_UNIT_ALIASES: Array<{ unit: string; pattern: RegExp }> = [
  { unit: 'tbsp', pattern: /^(tablespoons?|tbsps?|tbs\.?|T)\b/i },
  { unit: 'tsp', pattern: /^(teaspoons?|tsps?|t\.?)\b/i },
  { unit: 'cup', pattern: /^(cups?|c\.?)\b/i },
  { unit: 'oz', pattern: /^(ounces?|oz\.?)\b/i },
  { unit: 'lb', pattern: /^(pounds?|lbs?\.?)\b/i },
  { unit: 'g', pattern: /^(grams?|grammes?|g\.?)\b/i },
  { unit: 'kg', pattern: /^(kilograms?|kilos?|kg\.?)\b/i },
  { unit: 'ml', pattern: /^(milliliters?|millilitres?|mls?\.?)\b/i },
  { unit: 'l', pattern: /^(liters?|litres?|l\.?)\b/i },
  { unit: 'pt', pattern: /^(pints?|pt\.?)\b/i },
  { unit: 'qt', pattern: /^(quarts?|qt\.?)\b/i },
  { unit: 'gal', pattern: /^(gallons?|gal\.?)\b/i },
  { unit: 'pinch', pattern: /^(pinches|pinch)\b/i },
  { unit: 'bunch', pattern: /^(bunches|bunch)\b/i },
  { unit: 'clove', pattern: /^(cloves?)\b/i },
  { unit: 'head', pattern: /^(heads?)\b/i },
  { unit: 'slice', pattern: /^(slices?)\b/i },
  { unit: 'piece', pattern: /^(pieces?|pcs?\.?)\b/i },
  { unit: 'can', pattern: /^(cans?)\b/i },
  { unit: 'jar', pattern: /^(jars?)\b/i },
  { unit: 'tin', pattern: /^(tins?)\b/i },
  { unit: 'bottle', pattern: /^(bottles?)\b/i },
  { unit: 'bag', pattern: /^(bags?)\b/i },
  { unit: 'packet', pattern: /^(packets?)\b/i },
  { unit: 'package', pattern: /^(packages?|pkgs?\.?|packs?)\b/i },
  { unit: 'box', pattern: /^(boxes|box)\b/i },
  { unit: 'carton', pattern: /^(cartons?)\b/i },
  { unit: 'tub', pattern: /^(tubs?)\b/i },
  { unit: 'each', pattern: /^(each|ea\.?)\b/i },
]

function peelParentheticalNotes(text: string): { core: string; notes: string | null } {
  const notes: string[] = []
  const core = text
    .replace(/\(([^)]+)\)/g, (_m, inner: string) => {
      const t = String(inner).trim()
      // Keep "(or …)" on the name so splitIngredientOptions can promote options → alternatives.
      if (/^or\b/i.test(t)) return `(${t})`
      if (t) notes.push(t)
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { core, notes: notes.length ? notes.join('; ') : null }
}

/** Short trailing prep after a comma — "garlic, minced" → notes. */
const COMMA_PREP_NOTE_RE =
  /^(?:finely|roughly|thinly|freshly|coarsely)?\s*(?:minced|chopped|sliced|diced|grated|crushed|peeled|seeded|softened|melted|ground|divided|optional|to taste|room temperature|at room temperature|plus more(?:\s+for\s+\w+)?)$/i

/** Product texture / style adjectives that belong in notes, not the grocery name. */
const PRODUCT_TEXTURE_PREFIX_RE =
  /^(silken|silkin|extra[\s-]?firm|firm|soft|smoked|pressed|dried|fresh|frozen|canned|jarred|organic)\s+/i

/**
 * Normalize notes / alternatives on a stored ingredient so the Info button can show
 * whenever the source had extras — even if they were left jammed in `name` / `note`.
 */
export function enrichIngredientFields<T extends { name: string; notes?: string | null; alternatives?: string[] }>(
  ing: T & { note?: unknown; prep_note?: unknown },
): T & { notes: string | null; alternatives?: string[] } {
  const legacyNote =
    (typeof ing.note === 'string' && ing.note.trim()) ||
    (typeof ing.prep_note === 'string' && String(ing.prep_note).trim()) ||
    null
  const baseNotes = [ing.notes?.trim() || null, legacyNote].filter(Boolean).join('; ') || null

  let name = String(ing.name ?? '').trim()
  const existingAlts = Array.isArray(ing.alternatives)
    ? ing.alternatives.map((a) => String(a).trim()).filter(Boolean)
    : []

  const { primary, alternatives: fromOr } = splitIngredientOptions(name)
  name = primary || name

  const peeled = peelParentheticalNotes(name)
  name = peeled.core || name

  let notes = [baseNotes, peeled.notes].filter(Boolean).join('; ') || null

  const comma = name.match(/^(.+?)[,;]\s+(.+)$/)
  if (comma && COMMA_PREP_NOTE_RE.test(comma[2].trim())) {
    name = comma[1].trim()
    notes = [notes, comma[2].trim()].filter(Boolean).join('; ')
  }

  // "silken tofu" → name tofu, notes silken (fix typo silkin → silken)
  for (let i = 0; i < 3; i++) {
    const m = name.match(PRODUCT_TEXTURE_PREFIX_RE)
    if (!m) break
    let texture = m[1].toLowerCase().replace(/\s+/g, ' ')
    if (texture === 'silkin') texture = 'silken'
    notes = [texture, notes].filter(Boolean).join('; ')
    name = name.slice(m[0].length).trim()
  }

  name = sanitizeIngredientName(name)
  // Keep "to taste" / "as needed" in notes, never as the grocery name prefix.
  const tasteOf = name.match(/^(to taste|as needed|as desired|optional)(?:\s+of)?\s+(.+)$/i)
  if (tasteOf) {
    notes = [tasteOf[1].toLowerCase(), notes].filter(Boolean).join('; ')
    name = sanitizeIngredientName(tasteOf[2])
  } else if (/^(to taste|as needed|as desired|optional)\b/i.test(name)) {
    notes = [name, notes].filter(Boolean).join('; ')
    name =
      sanitizeIngredientName(name.replace(/^(to taste|as needed|as desired|optional)(?:\s+of)?\s*/i, '')) ||
      name
  }
  if (/^of\s+/i.test(name)) name = sanitizeIngredientName(name.replace(/^of\s+/i, ''))

  const alternatives = [...new Set([...existingAlts, ...fromOr])]
  return {
    ...ing,
    name,
    notes,
    alternatives: alternatives.length ? alternatives : undefined,
  }
}

function sanitizeIngredientName(name: string): string {
  return name
    .trim()
    .replace(/[,.;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function peelUnitFromStart(text: string): { unit: string; rest: string } {
  const working = text.trim()
  for (const { unit, pattern } of INGREDIENT_UNIT_ALIASES) {
    const m = working.match(pattern)
    if (m) {
      return { unit, rest: working.slice(m[0].length).trim().replace(/^of\s+/i, '') }
    }
  }
  return { unit: '', rest: working }
}

function normalizeKnownUnit(raw: string): string {
  const u = raw.trim().toLowerCase().replace(/\.$/, '')
  if (!u) return ''
  for (const { unit, pattern } of INGREDIENT_UNIT_ALIASES) {
    if (pattern.test(u) || u === unit) return unit
  }
  return u
}

export type ParsedIngredientLine = {
  amount: string
  unit: string
  name: string
  notes: string | null
  alternatives?: string[]
}

/**
 * When a source lists options (“butter or margarine”, “olive oil (or vegetable oil)”),
 * pick the first as primary and return the rest as preferred swap alternatives.
 */
export function splitIngredientOptions(rawName: string): { primary: string; alternatives: string[] } {
  let name = (rawName ?? '').trim()
  if (!name) return { primary: '', alternatives: [] }

  const parenOr = name.match(/^(.+?)\s*\(\s*or\s+([^)]+)\)\s*$/i)
  if (parenOr) {
    const primary = parenOr[1].trim()
    const alts = parenOr[2]
      .split(/\s*(?:,|\/|\bor\b)\s*/i)
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== primary.toLowerCase())
    return { primary, alternatives: alts }
  }

  // Avoid splitting cooking phrases like "salt or to taste"
  if (/\bor\s+(to taste|as needed|as desired|more)\b/i.test(name)) {
    return { primary: name, alternatives: [] }
  }

  const parts = name
    .split(/\s+or\s+/i)
    .map((s) => s.replace(/^[,;:\s]+|[,;:\s]+$/g, '').trim())
    .filter(Boolean)
  if (parts.length >= 2 && parts.every((p) => p.split(/\s+/).length <= 6)) {
    const primary = parts[0]
    const alternatives = parts.slice(1).filter((p) => p.toLowerCase() !== primary.toLowerCase())
    return { primary, alternatives }
  }

  return { primary: name, alternatives: [] }
}

/**
 * Parse a free-text ingredient line into structured fields.
 * "2 cups flour (sifted)" → { amount: "2", unit: "cup", name: "flour", notes: "sifted" }
 * Always strips leading qty/unit from the name even when amount/unit were pre-filled.
 */
export function parseIngredientLine(
  raw: string,
  opts: { amount?: string; unit?: string; name?: string; notes?: string | null } = {},
): ParsedIngredientLine {
  const existingNotes = opts.notes?.trim() || null
  let amount = (opts.amount ?? '').trim()
  let unit = normalizeKnownUnit(opts.unit ?? '')
  let name = (opts.name ?? '').trim()

  // Prefer the raw line, else the name field alone — never rejoin amount+unit+name (that
  // re-pollutes name with qty/unit that were already extracted).
  let working = (raw.trim() || name || '').trim()
  if (!working && !amount && !unit) {
    return { amount: '', unit: '', name: '', notes: existingNotes }
  }

  const peeled = peelParentheticalNotes(working || name)
  working = peeled.core || working
  let notes = [existingNotes, peeled.notes].filter(Boolean).join('; ') || null

  // Amount from dedicated field, or peel from working text.
  if (amount) {
    const split = splitLeadingAmount(amount)
    if (split.amount) {
      amount = split.amount
      if (split.extra && !unit) {
        const fromExtra = peelUnitFromStart(split.extra)
        if (fromExtra.unit) {
          unit = fromExtra.unit
          // leftover after unit in amount field goes into working only if name empty
          if (!working && fromExtra.rest) working = fromExtra.rest
        } else if (!working) {
          working = split.extra
        }
      }
    }
  }
  if (!amount && working) {
    const split = splitLeadingAmount(working)
    amount = split.amount
    working = split.extra
  }

  // Unit from dedicated field, or peel from start of working (the name remnant).
  if (!unit && working) {
    const peeledUnit = peelUnitFromStart(working)
    if (peeledUnit.unit) {
      unit = peeledUnit.unit
      working = peeledUnit.rest
    }
  } else if (unit && working) {
    // Strip a leading unit from name when it duplicates the structured unit.
    const peeledUnit = peelUnitFromStart(working)
    if (peeledUnit.unit && peeledUnit.unit === unit) {
      working = peeledUnit.rest
    }
  }

  // Strip a leading amount that still sits on the name (common when amount was pre-filled
  // but name kept the full "2 cups flour" dump).
  if (working) {
    const again = splitLeadingAmount(working)
    if (again.amount) {
      if (!amount) amount = again.amount
      working = again.extra
      if (!unit && working) {
        const peeledUnit = peelUnitFromStart(working)
        if (peeledUnit.unit) {
          unit = peeledUnit.unit
          working = peeledUnit.rest
        }
      } else if (unit && working) {
        const peeledUnit = peelUnitFromStart(working)
        if (peeledUnit.unit && peeledUnit.unit === unit) working = peeledUnit.rest
      }
    }
  }

  name = sanitizeIngredientName(working || name)

  // Non-numeric amount/unit phrases (e.g. model put "to taste" in amount) → notes.
  const QUALIFIER_RE = /^(to taste|as needed|as desired|optional|for serving|for garnish)(?:\s+of)?$/i
  if (amount && !parseAmount(amount) && QUALIFIER_RE.test(amount.trim())) {
    notes = [amount.trim(), notes].filter(Boolean).join('; ')
    amount = ''
  }
  if (unit && QUALIFIER_RE.test(unit.trim())) {
    notes = [unit.trim(), notes].filter(Boolean).join('; ')
    unit = ''
  }
  // "to taste of salt & pepper" / "to taste salt" jammed into name
  const tasteOf = name.match(/^(to taste|as needed|as desired|optional)(?:\s+of)?\s+(.+)$/i)
  if (tasteOf) {
    notes = [tasteOf[1].toLowerCase(), notes].filter(Boolean).join('; ')
    name = sanitizeIngredientName(tasteOf[2])
  } else if (/^(to taste|as needed|as desired|optional)\b/i.test(name)) {
    notes = [name, notes].filter(Boolean).join('; ')
    name =
      sanitizeIngredientName(name.replace(/^(to taste|as needed|as desired|optional)(?:\s+of)?\s*/i, '')) ||
      name
  }
  // Strip a leftover leading "of " from bad parses
  if (/^of\s+/i.test(name)) name = sanitizeIngredientName(name.replace(/^of\s+/i, ''))

  // Amount must be numeric (or empty); unknown non-numeric amounts go to notes.
  if (amount && parseAmount(amount) == null) {
    notes = [amount, notes].filter(Boolean).join('; ')
    amount = ''
  }

  const { primary, alternatives } = splitIngredientOptions(name || sanitizeIngredientName(opts.name ?? raw) || '')
  return {
    amount: amount ? decimalToFraction(amount) : '',
    unit: unit || '',
    name: primary,
    notes: notes ? sanitizeIngredientName(notes) : null,
    alternatives: alternatives.length ? alternatives : undefined,
  }
}

export type IngredientLike = {
  name: string
  amount: string
  unit: string
  notes?: string | null
  canonical_key?: string
}

/** Drop exact duplicates; merge same-name rows with different qty/unit. */
export function dedupeIngredients<T extends IngredientLike>(list: T[]): T[] {
  const out: T[] = []
  const indexByName = new Map<string, number>()

  for (const raw of list) {
    const nameKey = sanitizeIngredientName(raw.name).toLowerCase()
    if (!nameKey) continue
    const amount = (raw.amount ?? '').trim()
    const unit = (raw.unit ?? '').trim().toLowerCase()
    const existingIdx = indexByName.get(nameKey)
    if (existingIdx == null) {
      indexByName.set(nameKey, out.length)
      out.push({ ...raw, name: sanitizeIngredientName(raw.name), amount, unit })
      continue
    }
    const prev = out[existingIdx]
    const prevAmount = (prev.amount ?? '').trim()
    const prevUnit = (prev.unit ?? '').trim().toLowerCase()
    // Exact duplicate → drop
    if (prevAmount === amount && prevUnit === unit) continue

    const nPrev = parseAmount(prevAmount)
    const nNext = parseAmount(amount)
    if (nPrev != null && nNext != null && prevUnit && prevUnit === unit) {
      out[existingIdx] = {
        ...prev,
        amount: formatScaledAmount(nPrev + nNext),
        unit: prevUnit,
      }
      continue
    }
    // Different units / non-numeric → combine into amount string, keep first unit if any
    const left = [prevAmount, prevUnit].filter(Boolean).join(' ')
    const right = [amount, unit].filter(Boolean).join(' ')
    const combined = [left, right].filter(Boolean).join(' + ')
    const noteBits = [prev.notes, raw.notes].filter(Boolean)
    out[existingIdx] = {
      ...prev,
      amount: combined || prevAmount || amount,
      unit: prevUnit && unit && prevUnit !== unit ? '' : prevUnit || unit,
      notes: noteBits.length ? noteBits.join('; ') : prev.notes ?? null,
    }
  }
  return out
}

/** Scales a numeric ingredient amount (e.g. "3", "1/2", "1½") for a new serving count against a
 * base serving count. */
export function scaleAmount(baseAmount: string, baseServings: number, targetServings: number): string {
  const n = parseAmount(baseAmount)
  if (n == null || baseServings <= 0) return baseAmount
  return formatScaledAmount((n * targetServings) / baseServings)
}

const STEP_NUMBER_PATTERN = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g

/** A number/unit word (or a "8-10 minutes" range) that reads as a temperature or duration rather
 * than an ingredient quantity — cooking time and oven temperature stay fixed regardless of
 * servings, only ingredient amounts scale. Matches the WHOLE span (both numbers in a range, the
 * unit word) so `scaleStepText` can blanket-protect it rather than only checking the text
 * immediately trailing a single number — a bare "followed by" check misses the first number in
 * "8-10 minutes" (the hyphen breaks the lookahead) and hyphenated compounds like "10-minute". */
const TIME_TEMP_UNIT = String.raw`(?:°\s*[FC]?|degrees?(?:\s*(?:fahrenheit|celsius|[FC]))?\b|min(?:ute)?s?\b|hours?\b|hrs?\b|sec(?:ond)?s?\b|[FC]\b)`
const PROTECTED_SPAN_PATTERN = new RegExp(
  String.raw`\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*-?\s*${TIME_TEMP_UNIT}`,
  'gi',
)

/** Best-effort scales the plain numbers/fractions found in a free-text Method step by the same
 * ratio used for ingredient amounts (e.g. "add 2 cups flour" at 2x servings → "add 4 cups
 * flour") — skips numbers/ranges that read as a temperature or duration rather than a quantity,
 * and never rewrites digits inside `{{@N:Name}}` ingredient tokens. */
export function scaleStepText(step: string, ratio: number): string {
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.001) return step

  // Non-numeric sentinels (letter-length index) so STEP_NUMBER_PATTERN cannot corrupt placeholders.
  const TOKEN_RE = /\{\{[\s\S]*?\}\}/g
  const placeholders: string[] = []
  const withPlaceholders = step.replace(TOKEN_RE, (token) => {
    const i = placeholders.length
    placeholders.push(token)
    return `\u0000TOK${'A'.repeat(i + 1)}\u0000`
  })

  const protectedRanges: [number, number][] = []
  const spanRe = new RegExp(PROTECTED_SPAN_PATTERN.source, 'gi')
  let spanMatch: RegExpExecArray | null
  while ((spanMatch = spanRe.exec(withPlaceholders))) {
    protectedRanges.push([spanMatch.index, spanMatch.index + spanMatch[0].length])
  }
  // Also protect placeholder spans themselves
  const phRe = /\u0000TOKA+\u0000/g
  let phMatch: RegExpExecArray | null
  while ((phMatch = phRe.exec(withPlaceholders))) {
    protectedRanges.push([phMatch.index, phMatch.index + phMatch[0].length])
  }
  const isProtected = (idx: number) => protectedRanges.some(([s, e]) => idx >= s && idx < e)

  const scaled = withPlaceholders.replace(STEP_NUMBER_PATTERN, (match, _group: string, offset: number) => {
    if (isProtected(offset)) return match
    const n = parseAmount(match)
    if (n == null) return match
    return formatScaledAmount(n * ratio)
  })

  return scaled.replace(/\u0000TOK(A+)\u0000/g, (_m, a: string) => placeholders[a.length - 1] ?? _m)
}
