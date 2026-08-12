const BORDER = '#ECE9E3'
const ACCENT = '#4C6A57'

export type NutritionTotals = {
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sodium_mg?: number | null
  sugar_g?: number | null
  added_sugar_g?: number | null
  saturated_fat_g?: number | null
  cholesterol_mg?: number | null
  iron_mg?: number | null
  calcium_mg?: number | null
  vitamin_d_mcg?: number | null
  potassium_mg?: number | null
}

function formatAmount(value: number | null | undefined, unit: string): string {
  if (value == null) return '—'
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
  return unit ? `${rounded}${unit}` : rounded
}

function pctDv(value: number | null | undefined, daily: number): string | null {
  if (value == null || daily <= 0) return null
  return `${Math.round((value / daily) * 100)}%`
}

function NutrientRow({
  label,
  value,
  unit = 'g',
  dv,
  bold = false,
  indent = 0,
}: {
  label: string
  value: number | null | undefined
  unit?: string
  dv?: string | null
  bold?: boolean
  indent?: number
}) {
  return (
    <div
      className="flex items-baseline justify-between border-b py-1.5 font-ui text-[13px]"
      style={{ borderColor: BORDER, paddingLeft: indent ? `${indent * 0.9}rem` : undefined, color: '#1A0D40', fontWeight: bold ? 700 : 500 }}
    >
      <span>{label}</span>
      <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
        <span className={bold ? 'font-bold' : ''}>{formatAmount(value, unit)}</span>
        {dv ? <span className="w-10 text-right text-[11px] font-semibold text-[#9a9aa0]">{dv}</span> : <span className="w-10" aria-hidden />}
      </span>
    </div>
  )
}

/** Full nutrition-facts panel — calorie hero, %DV column, Vitamins & Minerals section — matching
 * the original figs 1.0 Stash design. Accepts a plain totals object so Stash items and aggregated
 * Recipe nutrition can share it. */
export function NutritionFactsPanel({ totals }: { totals: NutritionTotals }) {
  const hasData = [totals.calories, totals.fat_g, totals.carbs_g, totals.protein_g].some((v) => v != null)
  if (!hasData) return null

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: BORDER, background: '#FAFAFA' }}>
      <div className="border-b px-4 py-2.5" style={{ borderColor: BORDER }}>
        <p className="font-ui text-[11px] font-bold uppercase tracking-[0.1em] text-[#1A0D40]">Nutrition Facts</p>
      </div>

      <div className="px-4 pt-3">
        <div className="flex items-end justify-between border-b-4 pb-2" style={{ borderColor: ACCENT }}>
          <span className="font-ui text-sm font-bold text-[#1A0D40]">Calories</span>
          <span className="font-ui text-4xl font-black tabular-nums leading-none text-[#1A0D40]">{formatAmount(totals.calories, '')}</span>
        </div>

        <div className="flex justify-end border-b py-1.5 font-ui text-[10px] font-bold uppercase tracking-wide text-[#9a9aa0]" style={{ borderColor: BORDER }}>
          <span className="w-10 text-right">% DV*</span>
        </div>

        <NutrientRow label="Total Fat" value={totals.fat_g} dv={pctDv(totals.fat_g, 78)} bold />
        <NutrientRow label="Saturated Fat" value={totals.saturated_fat_g} dv={pctDv(totals.saturated_fat_g, 20)} indent={1} />
        <NutrientRow label="Cholesterol" value={totals.cholesterol_mg} unit="mg" dv={pctDv(totals.cholesterol_mg, 300)} bold />
        <NutrientRow label="Sodium" value={totals.sodium_mg} unit="mg" dv={pctDv(totals.sodium_mg, 2300)} bold />
        <NutrientRow label="Total Carbohydrate" value={totals.carbs_g} dv={pctDv(totals.carbs_g, 275)} bold />
        <NutrientRow label="Dietary Fiber" value={totals.fiber_g} dv={pctDv(totals.fiber_g, 28)} indent={1} />
        <NutrientRow label="Total Sugars" value={totals.sugar_g} indent={1} />
        <NutrientRow label="Protein" value={totals.protein_g} dv={pctDv(totals.protein_g, 50)} bold />
      </div>

      <div className="mx-4 my-3 h-[3px] rounded-full" style={{ background: ACCENT }} aria-hidden />

      <div className="px-4 pb-4">
        <p className="mb-1 font-ui text-[10px] font-bold uppercase tracking-wide text-[#9a9aa0]">Vitamins & Minerals</p>
        {[
          { label: 'Calcium', value: totals.calcium_mg, unit: 'mg', daily: 1300 },
          { label: 'Iron', value: totals.iron_mg, unit: 'mg', daily: 18 },
          { label: 'Potassium', value: totals.potassium_mg, unit: 'mg', daily: 4700 },
        ].map((row) => (
          <div key={row.label} className="flex items-baseline justify-between border-b py-2 font-ui text-[13px] text-[#1A0D40]" style={{ borderColor: BORDER }}>
            <span className="font-semibold">{row.label}</span>
            <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span>{formatAmount(row.value, row.unit)}</span>
              <span className="w-10 text-right text-[11px] font-semibold text-[#9a9aa0]">{pctDv(row.value, row.daily) ?? '—'}</span>
            </span>
          </div>
        ))}
        <p className="mt-2 font-ui text-[9px] leading-snug text-[#9a9aa0]">* Percent Daily Values are based on a 2,000 calorie diet.</p>
      </div>
    </div>
  )
}
