import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { unitComboSuggestions } from '../lib/ingredientUnits'

type Props = {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}

/** Portal-rendered unit combobox — ported pattern from figs_1.0's StashUnitPicker/GroceryUnitField,
 * so the suggestion list floats above any swipe-row overflow-hidden clipping. */
export default function UnitDropdown({ value, onChange, className = '', placeholder = 'each' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    if (!open) return
    const update = () => setRect(inputRef.current?.getBoundingClientRect() ?? null)
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const options = unitComboSuggestions(open ? query : '')

  const commit = (v: string) => {
    onChange(v)
    setQuery(v)
    setOpen(false)
  }

  return (
    <>
      <input
        ref={inputRef}
        className={className}
        value={open ? query : value}
        placeholder={placeholder}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(query.trim() || value)
          }
        }}
      />
      {open && rect
        ? createPortal(
            <div
              className="fixed z-[600] max-h-52 overflow-y-auto rounded-xl border border-[#ECE9E3] bg-white py-1 shadow-[0_12px_40px_rgba(26,13,64,0.14)]"
              style={{ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 120) }}
            >
              {options.length === 0 ? (
                <p className="px-3 py-2 font-ui text-[12.5px] text-[#9a9aa0]">No matches</p>
              ) : (
                options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      commit(opt)
                    }}
                    className="block w-full px-3 py-2 text-left font-ui text-[13px] text-[#1A0D40] transition hover:bg-[#1A0D40]/[0.04]"
                  >
                    {opt}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
