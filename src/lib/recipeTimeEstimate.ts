/** Deterministic fallback estimator for prep/cook/inactive time when a recipe source (photo
 * transcription or link scrape) doesn't give an explicit split. Three tiers, cheapest/most
 * reliable first:
 *   1. Regex-harvest explicit "N minutes"/"N hours" mentions from the step text, bucketed by
 *      nearby thermal (cook) vs. wait (inactive) verbs.
 *   2. Prep-time formula from ingredient count/complexity (base station setup + per-ingredient
 *      knife-work cost, discounted if a food processor/blender is mentioned).
 *   3. Verb-heuristic defaults for any step that names a cooking technique but no explicit time.
 * Runs after (never instead of) whatever the extraction source already gave explicitly.
 *
 * Cook = thermal execution (sauté, bake, roast, simmer, boil, grill…).
 * Inactive = passive waiting that is not cooking (chill, marinate, rest, rise). */

export type RecipeTimeFields = {
  prepMins: number
  cookMins: number
  inactiveMins: number
}

const FINE_KNIFE_WORK = /\b(minced|diced|chopped|julienned|finely\s+grated|finely\s+chopped|shredded)\b/i
const LOW_PREP = /\b(canned|can of|jarred|olive oil|oil|spice|seasoning|sauce|soy sauce|salt|pepper|vinegar)\b/i

const ACTIVE_VERB_TIMES: [RegExp, number][] = [
  [/\b(sauté|saute|sear|brown)\b/i, 6],
  [/\bstir-?fr(y|ied|ying)\b/i, 5],
  [/\b(whisk|emulsify)\b/i, 3],
  [/\b(grill|pan-?fr(y|ied|ying))\b/i, 10],
  [/\b(deglaze|reduce)\b/i, 4],
  [/\b(bake|roast)\b/i, 35],
  [/\b(simmer|boil)\b/i, 15],
]
/** Non-thermal waits — never counted as cook. */
const INACTIVE_VERB_TIMES: [RegExp, number][] = [
  [/\b(chill|refrigerate)\b/i, 60],
  [/\bmarinate\b/i, 30],
  [/\brest(ing)?\b/i, 8],
  [/\b(rise|proof|prove)\b/i, 45],
]

const TIME_TOKEN = /\b(\d+)\s*(mins?|minutes?|hours?|hrs?)\b/gi

function isInactiveStep(step: string): boolean {
  return INACTIVE_VERB_TIMES.some(([re]) => re.test(step))
}

/** Tier 1 — regex-harvest explicit time mentions from step text. */
function harvestExplicitStepTimes(steps: string[]): { cook: number; inactive: number; stepsWithExplicitTime: Set<number> } {
  let cook = 0
  let inactive = 0
  const stepsWithExplicitTime = new Set<number>()
  steps.forEach((step, i) => {
    let match: RegExpExecArray | null
    const re = new RegExp(TIME_TOKEN.source, 'gi')
    let sawTime = false
    while ((match = re.exec(step))) {
      sawTime = true
      const n = Number(match[1])
      const unit = match[2].toLowerCase()
      const minutes = unit.startsWith('h') ? n * 60 : n
      if (isInactiveStep(step)) inactive += minutes
      else cook += minutes
    }
    if (sawTime) stepsWithExplicitTime.add(i)
  })
  return { cook, inactive, stepsWithExplicitTime }
}

/** Tier 3 — for steps with no explicit time mention, apply a default per named technique. */
function verbHeuristicTimes(steps: string[], skip: Set<number>): { cook: number; inactive: number } {
  let cook = 0
  let inactive = 0
  steps.forEach((step, i) => {
    if (skip.has(i)) return
    const inactiveHit = INACTIVE_VERB_TIMES.find(([re]) => re.test(step))
    if (inactiveHit) {
      inactive += inactiveHit[1]
      return
    }
    const active = ACTIVE_VERB_TIMES.find(([re]) => re.test(step))
    if (active) cook += active[1]
  })
  return { cook, inactive }
}

/** Fixed tool-preheat/wait overhead, applied once per recipe (not per step) if the technique is
 * mentioned anywhere in the method. Counts toward cook (thermal readiness). */
function toolOverhead(allStepsText: string): number {
  let overhead = 0
  if (/\boven\b/i.test(allStepsText)) overhead += 10
  if (/\b(pot of water|boiling pot|bring .* to a boil)\b/i.test(allStepsText)) overhead += 8
  if (/\bair fryer\b/i.test(allStepsText)) overhead += 3
  return overhead
}

/** Tier 2 — prep-time formula from ingredient count/complexity, discounted by food-prep tools. */
function estimatePrepMins(ingredients: { name: string }[], allStepsText: string): number {
  const hasProcessor = /\b(food processor|mandoline)\b/i.test(allStepsText)
  const hasBlender = /\bblender\b/i.test(allStepsText)
  let total = 5 // base station setup
  for (const ing of ingredients) {
    const name = ing.name
    if (LOW_PREP.test(name)) {
      total += 0.25
    } else if (FINE_KNIFE_WORK.test(name)) {
      total += hasProcessor ? 2.5 * 0.4 : 2.5
    } else {
      total += hasProcessor ? 1.5 * 0.4 : 1.5
    }
  }
  if (hasBlender) total *= 0.5
  return Math.round(total)
}

export function estimateRecipeTimes(params: {
  ingredients: { name: string }[]
  steps: string[]
  explicitPrepMins?: number | null
  explicitCookMins?: number | null
  explicitInactiveMins?: number | null
}): RecipeTimeFields {
  const { ingredients, steps, explicitPrepMins, explicitCookMins, explicitInactiveMins } = params
  const allStepsText = steps.join(' ')
  const hadExplicitCook = explicitCookMins != null && explicitCookMins > 0

  const prepMins = explicitPrepMins != null && explicitPrepMins > 0 ? Math.round(explicitPrepMins) : estimatePrepMins(ingredients, allStepsText)

  let cookMins = hadExplicitCook ? Math.round(explicitCookMins!) : null
  let inactiveMins = explicitInactiveMins != null && explicitInactiveMins > 0 ? Math.round(explicitInactiveMins) : null

  if (cookMins == null || inactiveMins == null) {
    const harvested = harvestExplicitStepTimes(steps)
    const heuristic = verbHeuristicTimes(steps, harvested.stepsWithExplicitTime)
    if (cookMins == null) cookMins = Math.round(harvested.cook + heuristic.cook + toolOverhead(allStepsText))
    if (inactiveMins == null) inactiveMins = Math.round(harvested.inactive + heuristic.inactive)
  }

  // Never leave cook empty when there is thermal/wait work and no explicit cook from the source.
  if (!hadExplicitCook && cookMins === 0 && inactiveMins > 0 && steps.length > 0) {
    cookMins = inactiveMins
    inactiveMins = 0
  }
  if (cookMins === 0 && inactiveMins === 0 && steps.length > 0) cookMins = 10

  return { prepMins, cookMins, inactiveMins }
}
