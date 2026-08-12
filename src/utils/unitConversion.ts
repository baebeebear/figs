/**
 * Cooking unit conversion — deliberately scoped to same-measurement-family
 * conversions only (volume↔volume, mass↔mass). Volume↔mass (e.g. cups→grams)
 * needs per-ingredient density data this app doesn't have, so it's left alone
 * rather than guessing.
 */

import { parseAmount, formatScaledAmount } from './recipeMath'
import { normalizeStashUnitInput } from '../lib/ingredientUnits'

export type UnitSystem = 'us' | 'metric'

type UnitFamily = 'volume' | 'mass' | 'unknown'

// Every unit's size relative to its family's base unit (ml for volume, g for mass).
const VOLUME_TO_ML: Record<string, number> = {
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  cup: 236.588,
  cups: 236.588,
  'fl oz': 29.5735,
  floz: 29.5735,
  pint: 473.176,
  pt: 473.176,
  quart: 946.353,
  qt: 946.353,
  gallon: 3785.41,
  gal: 3785.41,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
}

const MASS_TO_G: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
}

/** Picks a natural everyday unit for a given system based on the quantity's magnitude — a
 * fixed unit (always "cup", always "g", ...) reads badly once the amount is small (e.g.
 * "0.13 cup" of sugar instead of "2 tbsp"). */
function pickVolumeUnit(ml: number, system: UnitSystem): string {
  if (system === 'metric') return ml >= 1000 ? 'l' : 'ml'
  if (ml >= VOLUME_TO_ML.cup * 0.5) return 'cup'
  if (ml >= VOLUME_TO_ML.tbsp) return 'tbsp'
  return 'tsp'
}

function pickMassUnit(g: number, system: UnitSystem): string {
  if (system === 'metric') return g >= 1000 ? 'kg' : 'g'
  return g >= MASS_TO_G.lb * 0.5 ? 'lb' : 'oz'
}

/** Resolves any unit spelling (full word, plural, alias) down to a lookup key this file
 * recognizes — normalizes via the shared unit registry first (so "tablespoon"/"Tbsp."/etc. all
 * resolve the same way as they do everywhere else in the app), falling back to the raw
 * lowercased string for the handful of volume/mass spellings only this file's tables know. */
function resolveUnitKey(unit: string): string {
  const normalized = normalizeStashUnitInput(unit)
  const raw = unit.trim().toLowerCase()
  if (normalized && (normalized in VOLUME_TO_ML || normalized in MASS_TO_G)) return normalized
  return raw
}

function familyOf(key: string): UnitFamily {
  if (key in VOLUME_TO_ML) return 'volume'
  if (key in MASS_TO_G) return 'mass'
  return 'unknown'
}

function formatQty(n: number): string {
  return formatScaledAmount(n)
}

/**
 * Converts an ingredient amount+unit into the requested unit system, staying
 * within the same measurement family. Returns the original amount/unit
 * unchanged if the unit isn't recognized or has no counterpart in that family
 * (e.g. "each", "pinch", "clove").
 */
export function convertToUnitSystem(
  amount: string,
  unit: string,
  system: UnitSystem,
): { amount: string; unit: string } {
  const n = parseAmount(amount)
  if (n == null || !unit) return { amount, unit }

  const key = resolveUnitKey(unit)
  const family = familyOf(key)
  if (family === 'unknown') {
    // No volume/mass conversion applies (e.g. "clove", "each") — still normalize the unit
    // spelling itself to its canonical abbreviation so display is always consistent.
    const normalized = normalizeStashUnitInput(unit)
    return { amount, unit: normalized || unit }
  }

  if (family === 'volume') {
    const ml = n * VOLUME_TO_ML[key]
    const targetUnit = pickVolumeUnit(ml, system)
    const targetAmount = ml / VOLUME_TO_ML[targetUnit]
    return { amount: formatQty(targetAmount), unit: targetUnit }
  }

  const grams = n * MASS_TO_G[key]
  const targetUnit = pickMassUnit(grams, system)
  const targetAmount = grams / MASS_TO_G[targetUnit]
  return { amount: formatQty(targetAmount), unit: targetUnit }
}
