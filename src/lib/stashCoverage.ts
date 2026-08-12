import { parseAmount } from '../utils/recipeMath'
import type { StashItem } from './stash'

export type StashCoverageLevel = 'none' | 'partial' | 'full'

export type StashCoverageResult = {
  level: StashCoverageLevel
  haveQty: number | null
  haveUnit: string
  needQty: number | null
  needUnit: string
  /** Short popup copy, e.g. "You have 2 cups in your stash (recipe needs 3 cups)." */
  message: string
}

function normalizeName(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''′]/g, "'")
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[^a-z0-9'\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // Light de-pluralize last word
  const strip = (s: string) =>
    s
      .split(' ')
      .map((w) => (w.endsWith('s') && !w.endsWith('ss') && w.length > 3 ? w.slice(0, -1) : w))
      .join(' ')
  return strip(na) === strip(nb)
}

function formatQty(qty: number | null, unit: string): string {
  if (qty == null) return unit ? `some ${unit}`.trim() : 'some'
  const n = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100)
  return [n, unit].filter(Boolean).join(' ').trim()
}

/**
 * Compare a recipe/grocery need against stash inventory.
 * Same-unit numeric compare when possible; name-only match without comparable units → partial.
 */
export function evaluateStashCoverage(
  need: { name: string; amount?: string | null; unit?: string | null },
  stashItems: Pick<StashItem, 'name' | 'quantity' | 'unit' | 'status'>[],
): StashCoverageResult {
  const needName = String(need.name ?? '').trim()
  const needUnit = String(need.unit ?? '').trim().toLowerCase()
  const needQty = need.amount != null && String(need.amount).trim() ? parseAmount(String(need.amount)) : null

  const matches = stashItems.filter(
    (s) => s.status === 'available' && namesMatch(needName, s.name),
  )

  if (!matches.length) {
    return {
      level: 'none',
      haveQty: null,
      haveUnit: '',
      needQty,
      needUnit,
      message: 'Not in your stash.',
    }
  }

  const sameUnit = matches.filter((s) => {
    const u = String(s.unit ?? '').trim().toLowerCase()
    if (!needUnit && !u) return true
    return needUnit && u && needUnit === u
  })

  let haveQty: number | null = null
  let haveUnit = ''

  if (sameUnit.length) {
    haveQty = sameUnit.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
    haveUnit = String(sameUnit[0].unit ?? '').trim()
  } else {
    // Different units — sum raw quantities for messaging only; treat as partial if any stock.
    haveQty = matches.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
    haveUnit = String(matches[0].unit ?? '').trim()
  }

  let level: StashCoverageLevel = 'partial'
  if (needQty != null && needQty > 0 && haveQty != null && sameUnit.length) {
    level = haveQty + 1e-9 >= needQty ? 'full' : haveQty > 0 ? 'partial' : 'none'
  } else if (haveQty != null && haveQty > 0) {
    // Have stock but can't prove full coverage (no need qty or unit mismatch).
    level = needQty == null || needQty <= 0 ? 'full' : 'partial'
  } else {
    level = 'none'
  }

  const haveLabel = formatQty(haveQty, haveUnit)
  const needLabel = formatQty(needQty, needUnit)
  const message =
    level === 'none'
      ? 'Not in your stash.'
      : `You have ${haveLabel} in your stash (recipe needs ${needLabel}).`

  return { level, haveQty, haveUnit, needQty, needUnit, message }
}
