/** Shared shape for recipe/batch nutrition totals used by display and normalization. */
export type NutritionTotals = {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sodium_mg: number
  sugar_g: number
  saturated_fat_g: number
  cholesterol_mg: number
  potassium_mg: number
  iron_mg: number
  calcium_mg: number
}

function divideAll(totals: NutritionTotals, divisor: number): NutritionTotals {
  const d = divisor > 0 ? divisor : 1
  return {
    calories: totals.calories / d,
    protein_g: totals.protein_g / d,
    carbs_g: totals.carbs_g / d,
    fat_g: totals.fat_g / d,
    fiber_g: totals.fiber_g / d,
    sodium_mg: totals.sodium_mg / d,
    sugar_g: totals.sugar_g / d,
    saturated_fat_g: totals.saturated_fat_g / d,
    cholesterol_mg: totals.cholesterol_mg / d,
    potassium_mg: totals.potassium_mg / d,
    iron_mg: totals.iron_mg / d,
    calcium_mg: totals.calcium_mg / d,
  }
}

export function multiplyAll(totals: NutritionTotals, factor: number): NutritionTotals {
  const f = Number.isFinite(factor) ? factor : 1
  return {
    calories: totals.calories * f,
    protein_g: totals.protein_g * f,
    carbs_g: totals.carbs_g * f,
    fat_g: totals.fat_g * f,
    fiber_g: totals.fiber_g * f,
    sodium_mg: totals.sodium_mg * f,
    sugar_g: totals.sugar_g * f,
    saturated_fat_g: totals.saturated_fat_g * f,
    cholesterol_mg: totals.cholesterol_mg * f,
    potassium_mg: totals.potassium_mg * f,
    iron_mg: totals.iron_mg * f,
    calcium_mg: totals.calcium_mg * f,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** kcal / mg → integers; grams → 1 decimal. */
export function roundAll(totals: NutritionTotals): NutritionTotals {
  return {
    calories: Math.round(totals.calories),
    protein_g: round1(totals.protein_g),
    carbs_g: round1(totals.carbs_g),
    fat_g: round1(totals.fat_g),
    fiber_g: round1(totals.fiber_g),
    sodium_mg: Math.round(totals.sodium_mg),
    sugar_g: round1(totals.sugar_g),
    saturated_fat_g: round1(totals.saturated_fat_g),
    cholesterol_mg: Math.round(totals.cholesterol_mg),
    potassium_mg: Math.round(totals.potassium_mg),
    iron_mg: round1(totals.iron_mg),
    calcium_mg: Math.round(totals.calcium_mg),
  }
}

/** Batch totals → per-serving, with a hard sanity clamp for batch-accumulation bugs. */
export function normalizePerServing(totals: NutritionTotals, servings: number): NutritionTotals {
  const s = servings > 0 ? servings : 1
  let out = divideAll(totals, s)
  if (s > 1 && (out.calories > 2500 || out.sodium_mg > 4000)) out = divideAll(out, s)
  return roundAll(out)
}
