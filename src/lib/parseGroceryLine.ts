import { displayUnitForAmount, normalizeStashUnitInput } from './ingredientUnits'
import { formatScaledAmount, parseAmount, splitLeadingAmount } from '../utils/recipeMath'

export type ParsedGroceryLine = {
  name: string
  qty: number | null
  unit: string | null
}

const MASS_VOLUME_UNITS = new Set([
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
  'pinch',
  'dash',
  'smidgen',
  'drop',
  'splash',
  'squeeze',
])

/** Title-case a grocery name; keep short all-caps tokens (e.g. BBQ) as-is when ≤3 chars. */
export function titleCaseGroceryName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

function stripLeadingOf(rest: string): string {
  return rest.replace(/^(?:of\s+the|of)\s+/i, '').trim()
}

/** Parse a free-text grocery notepad line like `2 cups milk`, `milk`, or `1 dozen eggs`. */
export function parseGroceryLine(raw: string): ParsedGroceryLine | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (!trimmed) return null

  const { amount, extra } = splitLeadingAmount(trimmed)
  const qty = amount ? parseAmount(amount) : null

  let rest = extra
  let unit: string | null = null

  if (rest) {
    const tokens = rest.split(/\s+/)
    if (tokens.length >= 2) {
      const two = normalizeStashUnitInput(`${tokens[0]} ${tokens[1]}`)
      if (two) {
        unit = two
        rest = tokens.slice(2).join(' ')
      }
    }
    if (!unit && tokens.length >= 1) {
      const one = normalizeStashUnitInput(tokens[0])
      if (one) {
        unit = one
        rest = tokens.slice(1).join(' ')
      }
    }
  }

  rest = stripLeadingOf(rest)
  const name = titleCaseGroceryName(rest)
  if (!name) return null

  return { name, qty, unit }
}

/** Natural display phrase from stored qty / unit / name fields. */
export function formatGroceryDisplay(qty: number | null | undefined, unit: string | null | undefined, name: string): string {
  const label = name.trim()
  if (!label) return ''

  const u = (unit ?? '').trim()
  const hasQty = qty != null && Number.isFinite(qty)
  const qtyStr = hasQty ? formatScaledAmount(qty as number) : ''

  if (!u || u === 'each') {
    return hasQty ? `${qtyStr} ${label}` : label
  }

  const unitShown =
    u.toLowerCase() === 'lb' && (qty == null || qty !== 1)
      ? 'lbs'
      : displayUnitForAmount(qty, u)
  if (MASS_VOLUME_UNITS.has(u.toLowerCase())) {
    return hasQty ? `${qtyStr} ${unitShown} of ${label}` : `${unitShown} of ${label}`
  }

  // Countable units (slice, clove, can, …): "10 slices of Pizza"
  return hasQty ? `${qtyStr} ${unitShown} of ${label}` : `${unitShown} of ${label}`
}
