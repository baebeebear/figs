import { useEffect, useRef, type TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

/** Single-line-looking textarea that grows with content (including on mount / import). */
export default function AutoGrowTextarea({ value, onInput, className, style, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    resize()
  }, [value])

  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      rows={1}
      onInput={(e) => {
        resize()
        onInput?.(e)
      }}
      className={`resize-none overflow-hidden ${className ?? ''}`}
      style={style}
    />
  )
}
