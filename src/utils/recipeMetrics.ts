/** Non-linear execution-time scaling when a user adjusts a recipe's serving size. Real kitchen
 * time doesn't scale 1:1 with batch size — chopping twice as many onions takes less than twice
 * as long (knife-work efficiency), a bigger pan/pot has thermal-capacity limits that slow cook
 * time scaling further, and truly passive time (oven bakes, resting, marinating) barely changes
 * at all regardless of batch size. Each component gets its own sub-linear power-law exponent. */

export interface TimeScalingParams {
  baseServings: number
  targetServings: number
  prepMins: number
  cookMins: number
  inactiveMins: number
}

export type ScaledExecutionTime = {
  prepMins: number
  cookMins: number
  inactiveMins: number
  totalMins: number
}

const PREP_EXPONENT = 0.65
const COOK_EXPONENT = 0.35
const INACTIVE_EXPONENT = 0.0

export function computeScaledExecutionTime({
  baseServings,
  targetServings,
  prepMins,
  cookMins,
  inactiveMins,
}: TimeScalingParams): ScaledExecutionTime {
  if (baseServings <= 0 || targetServings <= 0) {
    return {
      prepMins,
      cookMins,
      inactiveMins,
      totalMins: prepMins + cookMins + inactiveMins,
    }
  }

  const ratio = targetServings / baseServings

  const adjustedPrep = Math.round(prepMins * Math.pow(ratio, PREP_EXPONENT))
  const adjustedCook = Math.round(cookMins * Math.pow(ratio, COOK_EXPONENT))
  const adjustedInactive = Math.round(inactiveMins * Math.pow(ratio, INACTIVE_EXPONENT))

  return {
    prepMins: adjustedPrep,
    cookMins: adjustedCook,
    inactiveMins: adjustedInactive,
    totalMins: adjustedPrep + adjustedCook + adjustedInactive,
  }
}

/** Display-facing helper — the app only shows "Prep time" and "Cook time" (inactive time is
 * folded into the displayed "Cook time" so the UI doesn't need a third label), while the math
 * above still scales inactive time separately (at a ~0 exponent) internally so it stays correct. */
export function scaledDisplayTimes(params: TimeScalingParams): { prepMins: number; cookMins: number; totalMins: number } {
  const scaled = computeScaledExecutionTime(params)
  return {
    prepMins: scaled.prepMins,
    cookMins: scaled.cookMins + scaled.inactiveMins,
    totalMins: scaled.totalMins,
  }
}
