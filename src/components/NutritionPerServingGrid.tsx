function formatAmount(value: number | null | undefined): string {
  if (value == null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

type Props = {
  calories: number | null | undefined
  protein: number | null | undefined
  carbs: number | null | undefined
  fat: number | null | undefined
  /** Header label on the left, e.g. "Nutrition". */
  headerLabel?: string
  /** Right-aligned toggle text (e.g. "6 servings" / "1 serving") — omit for no toggle. */
  toggleLabel?: string
  onToggleLabel?: () => void
  onTap?: () => void
}

/** Compact nutrition card — matches figs_1.0's `RecipeNutritionPanel` exactly: editorial-font
 * header, abbreviated Cal/P/C/F cells with the unit inlined next to the value (not its own row),
 * tight padding, the whole card as one tap target. Reused identically for Stash items (with a
 * "Per {unit}" label instead of a serving toggle, since a stash item has no serving count). */
export function NutritionPerServingGrid({ calories, protein, carbs, fat, headerLabel = 'Nutrition', toggleLabel, onToggleLabel, onTap }: Props) {
  const hasData = [calories, protein, carbs, fat].some((v) => v != null)
  if (!hasData) return null

  const cells = [
    { label: 'Cal', value: formatAmount(calories), unit: '' },
    { label: 'P', value: formatAmount(protein), unit: 'g' },
    { label: 'C', value: formatAmount(carbs), unit: 'g' },
    { label: 'F', value: formatAmount(fat), unit: 'g' },
  ]

  const Wrapper = onTap ? 'button' : 'div'

  return (
    <Wrapper
      type={onTap ? 'button' : undefined}
      onClick={onTap}
      className={`w-full rounded-lg border border-[#E8E8ED] bg-white px-2.5 py-1.5 text-left transition ${onTap ? 'active:bg-[#F5F5F7]' : ''}`}
      aria-label={onTap ? 'View full nutrition details' : undefined}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-editorial text-xs font-bold text-[#1A0D40]">{headerLabel}</span>
        {toggleLabel ? (
          <span
            role={onToggleLabel ? 'button' : undefined}
            tabIndex={onToggleLabel ? 0 : undefined}
            onClick={(e) => {
              if (!onToggleLabel) return
              e.stopPropagation()
              onToggleLabel()
            }}
            className={`font-ui text-[9px] font-semibold text-[#6E6E73] ${onToggleLabel ? 'cursor-pointer underline decoration-[#1A0D40]/20 underline-offset-2 hover:text-[#1A0D40]' : ''}`}
          >
            {toggleLabel}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-4 divide-x divide-[#E8E8ED]">
        {cells.map((cell) => (
          <div key={cell.label} className="flex flex-col items-center px-1 py-0.5 text-center">
            <span className="font-ui text-[15px] font-bold tabular-nums leading-none text-[#1A0D40]">
              {cell.value}
              {cell.unit && cell.value !== '—' ? <span className="ml-0.5 text-[9px] font-semibold text-[#6E6E73]">{cell.unit}</span> : null}
            </span>
            <span className="mt-0.5 font-ui text-[8px] font-bold uppercase tracking-wide text-[#6E6E73]">{cell.label}</span>
          </div>
        ))}
      </div>
    </Wrapper>
  )
}
