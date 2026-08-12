import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { resolveNutritionForProduct } from '../lib/nutrition'
import { NutritionFactsPanel } from './NutritionFactsPanel'
import { NutritionPerServingGrid } from './NutritionPerServingGrid'
import { multiplyAll, normalizePerServing, roundAll, type NutritionTotals } from '../utils/nutritionNormalize'

type Totals = {
  calories: number
  fat: number
  carbs: number
  protein: number
  fiber: number
  sodium: number
  sugar: number
  saturatedFat: number
  cholesterol: number
  potassium: number
  iron: number
  calcium: number
}

const EMPTY_TOTALS: Totals = {
  calories: 0,
  fat: 0,
  carbs: 0,
  protein: 0,
  fiber: 0,
  sodium: 0,
  sugar: 0,
  saturatedFat: 0,
  cholesterol: 0,
  potassium: 0,
  iron: 0,
  calcium: 0,
}

type StatedNutrition = {
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g?: number | null
  sodium_mg?: number | null
  sugar_g?: number | null
  saturated_fat_g?: number | null
  cholesterol_mg?: number | null
}

function hasStatedValue(n: StatedNutrition | null | undefined): boolean {
  if (!n) return false
  return [n.calories, n.protein_g, n.carbs_g, n.fat_g].some((v) => v != null)
}

/** Nutrition for the recipe — prefers the source page's own published facts (`statedNutrition`,
 * scraped highest-priority: JSON-LD > stated text) when present; otherwise falls back to summing
 * a per-ingredient DB-cache/AI estimate for the base batch, normalized to per-serving (with a hard
 * clamp for batch-accumulation bugs). The "For N" label toggles between per-serving (For 1) and
 * the selected batch (For N = perServing × N). */
export function RecipeNutritionSummary({
  ingredients,
  servings,
  baseServings,
  statedNutrition,
}: {
  ingredients: { name: string }[]
  servings: number
  baseServings: number
  statedNutrition?: StatedNutrition | null
}) {
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [perServingView, setPerServingView] = useState(false)
  const namesKey = ingredients.map((i) => i.name.trim().toLowerCase()).join('|')
  const hasStated = hasStatedValue(statedNutrition)

  useEffect(() => {
    if (hasStated) {
      setTotals({
        ...EMPTY_TOTALS,
        calories: statedNutrition?.calories ?? 0,
        protein: statedNutrition?.protein_g ?? 0,
        carbs: statedNutrition?.carbs_g ?? 0,
        fat: statedNutrition?.fat_g ?? 0,
        fiber: statedNutrition?.fiber_g ?? 0,
        sodium: statedNutrition?.sodium_mg ?? 0,
        sugar: statedNutrition?.sugar_g ?? 0,
        saturatedFat: statedNutrition?.saturated_fat_g ?? 0,
        cholesterol: statedNutrition?.cholesterol_mg ?? 0,
      })
      setLoading(false)
      return
    }
    if (!supabase || !ingredients.length) {
      setTotals(null)
      return
    }
    const sb = supabase
    let cancelled = false
    setLoading(true)
    void Promise.all(ingredients.map((ing) => resolveNutritionForProduct(sb, ing.name))).then((results) => {
      if (cancelled) return
      const sums = results.reduce<Totals>((acc, m) => {
        if (m?.calories != null) acc.calories += m.calories
        if (m?.protein_g != null) acc.protein += m.protein_g
        if (m?.carbs_g != null) acc.carbs += m.carbs_g
        if (m?.fat_g != null) acc.fat += m.fat_g
        if (m?.fiber_g != null) acc.fiber += m.fiber_g
        if (m?.sodium_mg != null) acc.sodium += m.sodium_mg
        if (m?.sugar_g != null) acc.sugar += m.sugar_g
        if (m?.saturated_fat_g != null) acc.saturatedFat += m.saturated_fat_g
        if (m?.cholesterol_mg != null) acc.cholesterol += m.cholesterol_mg
        if (m?.potassium_mg != null) acc.potassium += m.potassium_mg
        if (m?.iron_mg != null) acc.iron += m.iron_mg
        if (m?.calcium_mg != null) acc.calcium += m.calcium_mg
        return acc
      }, { ...EMPTY_TOTALS })
      setTotals(sums)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, hasStated])

  if (!ingredients.length && !hasStated) return null
  if (loading) {
    return (
      <div className="px-[22px] pt-6">
        <h2 className="mb-3 font-editorial text-[20px] font-semibold text-[#1A0D40]">Nutrition</h2>
        <div className="h-[70px] animate-pulse rounded-lg bg-[#F5F5F7]" />
      </div>
    )
  }
  if (!totals || (!totals.calories && !totals.fat && !totals.carbs && !totals.protein)) return null

  const selectedServings = servings > 0 ? servings : 1
  const base = baseServings > 0 ? baseServings : selectedServings
  const batchAsTotals: NutritionTotals = {
    calories: totals.calories,
    protein_g: totals.protein,
    carbs_g: totals.carbs,
    fat_g: totals.fat,
    fiber_g: totals.fiber,
    sodium_mg: totals.sodium,
    sugar_g: totals.sugar,
    saturated_fat_g: totals.saturatedFat,
    cholesterol_mg: totals.cholesterol,
    potassium_mg: totals.potassium,
    iron_mg: totals.iron,
    calcium_mg: totals.calcium,
  }
  const perServing = normalizePerServing(batchAsTotals, base)
  const displayed = perServingView ? perServing : roundAll(multiplyAll(perServing, selectedServings))
  const batchLabel = perServingView ? 'For 1' : `For ${selectedServings}`
  const toggleView = () => setPerServingView((v) => !v)

  return (
    <div className="px-[22px] pt-6">
      {expanded ? (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-editorial text-[20px] font-semibold text-[#1A0D40]">Nutrition</h2>
            <button
              type="button"
              onClick={toggleView}
              className="cursor-pointer border-0 bg-transparent p-0 font-ui text-[11px] font-semibold text-[#6E6E73] underline decoration-[#1A0D40]/20 underline-offset-2 hover:text-[#1A0D40]"
            >
              {batchLabel}
            </button>
          </div>
          <button type="button" onClick={() => setExpanded(false)} className="w-full border-0 bg-transparent p-0 text-left">
            <NutritionFactsPanel totals={displayed} />
          </button>
        </>
      ) : (
        <NutritionPerServingGrid
          calories={displayed.calories}
          protein={displayed.protein_g}
          carbs={displayed.carbs_g}
          fat={displayed.fat_g}
          headerLabel="Nutrition"
          toggleLabel={batchLabel}
          onToggleLabel={toggleView}
          onTap={() => setExpanded(true)}
        />
      )}
    </div>
  )
}
