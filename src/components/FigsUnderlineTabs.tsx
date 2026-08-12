import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

type TabOption<T extends string> = {
  value: T
  label: string
  disabled?: boolean
}

type Props<T extends string> = {
  value: T
  onChange: (next: T) => void
  options: TabOption<T>[]
  ariaLabel: string
  className?: string
  scrollable?: boolean
  gapClass?: string
  underlineColor?: string
  tightUnderline?: boolean
}

/** Text tabs with animated underline — ported from figs_1.2.9's Me tab for Stash's zone row. */
export default function FigsUnderlineTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
  scrollable = false,
  gapClass = 'gap-5',
  underlineColor = '#1A0D40',
  tightUnderline = false,
}: Props<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const [underline, setUnderline] = useState({ x: 0, w: 0 })

  const measure = useCallback(() => {
    const container = containerRef.current
    const btn = tabRefs.current.get(value)
    if (!container || !btn) return
    const cr = container.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    const w = Math.max(18, br.width * (tightUnderline ? 0.88 : 0.72))
    const x = br.left - cr.left + (br.width - w) / 2
    setUnderline({ x, w })
  }, [value, tightUnderline])

  useLayoutEffect(() => {
    measure()
  }, [measure, options])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => measure())
    ro.observe(container)
    for (const btn of tabRefs.current.values()) ro.observe(btn)
    return () => ro.disconnect()
  }, [measure, options])

  const tabRow = (
    <div className={`flex items-center ${gapClass} ${scrollable ? 'min-w-max' : ''}`.trim()}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) tabRefs.current.set(opt.value, el)
              else tabRefs.current.delete(opt.value)
            }}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`shrink-0 border-0 bg-transparent px-0 font-ui text-[13px] font-semibold tracking-[-0.1px] transition-colors duration-200 disabled:opacity-40 ${
              tightUnderline ? 'pb-[2px] pt-0.5' : 'pb-1 pt-0.5'
            } ${active ? 'text-[#111111]' : 'text-[#AEAEB2]'}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative ${tightUnderline ? 'pb-0' : 'pb-0.5'} ${className}`.trim()}
    >
      {scrollable ? <div className="k-hide-scroll -mx-1 overflow-x-auto px-1">{tabRow}</div> : tabRow}
      <span
        aria-hidden
        className={`pointer-events-none absolute bottom-0 left-0 rounded-full transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          tightUnderline ? 'h-[1.5px]' : 'h-[2px]'
        }`}
        style={{ width: underline.w, transform: `translateX(${underline.x}px)`, background: underlineColor }}
      />
    </div>
  )
}
