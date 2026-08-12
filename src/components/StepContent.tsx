import { sanitizeStepText, tokenizeStepText, ingredientNamesMatch } from '../lib/stepFormatting'
import { scaleAmount } from '../utils/recipeMath'
import { displayUnitForAmount } from '../lib/ingredientUnits'

export type StepIngredientContext = {
  name: string
  amount?: string
  unit?: string
}

/** Renders one method step's inline markup (bold/italic/underline/link/ingredient-chip) as styled
 * spans — the read-only counterpart to the plain-text syntax RecipeEditor's toolbar inserts.
 *
 * When `ingredients` / `scaleRatio` / `swappedNames` are provided, `{{@i:Name}}` chips resolve to
 * the live ingredient list (scaled amount + unit + current display name). */
export default function StepContent({
  text,
  ingredients,
  scaleRatio = 1,
  swappedNames,
  baseServings,
  targetServings,
}: {
  text: string
  ingredients?: StepIngredientContext[]
  scaleRatio?: number
  swappedNames?: Record<number, string> | Record<string, string>
  baseServings?: number
  targetServings?: number
}) {
  const tokens = tokenizeStepText(sanitizeStepText(text))

  const swapFor = (index: number | undefined): string | undefined => {
    if (index == null || !swappedNames) return undefined
    const rec = swappedNames as Record<string, string>
    return rec[`p:${index}`] ?? rec[String(index)] ?? (swappedNames as Record<number, string>)[index]
  }

  const resolveIngredient = (token: { name: string; notes?: string; index?: number }) => {
    let index = token.index
    if (index != null && ingredients?.length) {
      const at = ingredients[index]
      const display = at ? swapFor(index) ?? at.name : ''
      // Stale index after edits / reordering — fall back to name match.
      if (!at || (!ingredientNamesMatch(token.name, at.name) && !ingredientNamesMatch(token.name, display))) {
        index = undefined
      }
    }
    if (index == null && ingredients?.length) {
      const found = ingredients.findIndex((ing, i) => {
        const display = swapFor(i) ?? ing.name
        return ingredientNamesMatch(token.name, display) || ingredientNamesMatch(token.name, ing.name)
      })
      if (found >= 0) index = found
    }

    const ing = index != null && ingredients ? ingredients[index] : undefined
    const displayName = swapFor(index) ?? ing?.name ?? token.name

    let amount = ing?.amount?.trim() || ''
    const rawUnit = ing?.unit?.trim() || ''
    if (amount && baseServings != null && targetServings != null && baseServings > 0) {
      amount = scaleAmount(amount, baseServings, targetServings)
    } else if (amount && scaleRatio !== 1) {
      // Fallback when only ratio is known — scaleAmount needs base/target; use ratio via fake servings
      amount = scaleAmount(amount, 1, scaleRatio)
    }

    const unit = displayUnitForAmount(amount, rawUnit)
    const qty = [amount, unit].filter(Boolean).join(' ').trim()
    const label = qty ? `${qty} ${displayName}` : displayName
    return { label, notes: token.notes }
  }

  return (
    <>
      {tokens.map((token, i) => {
        switch (token.kind) {
          case 'bold':
            return (
              <strong key={i} className="font-semibold">
                {token.text}
              </strong>
            )
          case 'italic':
            return (
              <em key={i} className="italic">
                {token.text}
              </em>
            )
          case 'underline':
            return (
              <u key={i} className="underline">
                {token.text}
              </u>
            )
          case 'link':
            return (
              <a key={i} href={token.url} target="_blank" rel="noreferrer" className="font-semibold text-[#4C6A57] underline">
                {token.text}
              </a>
            )
          case 'ingredient': {
            const { label, notes } = resolveIngredient(token)
            return (
              <strong key={i} className="font-semibold text-[#1A0D40]">
                {label}
                {notes ? <span className="font-normal text-[#6b6575]"> ({notes})</span> : null}
              </strong>
            )
          }
          default:
            return <span key={i}>{token.text}</span>
        }
      })}
    </>
  )
}
