import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'

type MinimalBackProps = {
  onClick: () => void
  light?: boolean
  className?: string
  'aria-label'?: string
  size?: number
}

export default function MinimalBack({
  onClick,
  light = false,
  className = '',
  'aria-label': ariaLabel = 'Back',
  size = 20,
}: MinimalBackProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center border-none bg-transparent p-0 transition active:opacity-70 ${
        light ? 'text-white' : 'text-[#1A0D40]'
      } ${className}`}
    >
      <ChevronLeft size={size} strokeWidth={2.25} aria-hidden />
    </button>
  )
}

/** Date / step navigation — chevron only, no box. */
export function PlainChevronButton({
  onClick,
  direction = 'left',
  'aria-label': ariaLabel,
  size = 18,
  className = '',
}: {
  onClick: () => void
  direction?: 'left' | 'right' | 'up'
  'aria-label': string
  size?: number
  className?: string
}) {
  const Icon = direction === 'right' ? ChevronRight : direction === 'up' ? ChevronUp : ChevronLeft
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center border-none bg-transparent p-0 text-[#1A0D40] transition active:opacity-70 ${className}`}
    >
      <Icon size={size} strokeWidth={2.25} aria-hidden />
    </button>
  )
}
