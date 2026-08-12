/** Ported from figs_1.0's Stash.tsx — a rounded, tinted "days left" bubble. */
export function urgencyPillStyle(color: string): { color: string; backgroundColor: string } {
  return {
    color,
    backgroundColor: `color-mix(in srgb, ${color} 24%, #f4f4f6)`,
  }
}

export function UrgencyPill({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-ui text-[10px] font-semibold tabular-nums"
      style={urgencyPillStyle(color)}
    >
      {text}
    </span>
  )
}
