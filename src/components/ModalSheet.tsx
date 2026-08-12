import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

type Props = {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  maxWidthClassName?: string
}

/** Spring-animated bottom sheet (frosted scrim, drag handle) — the shared shell for every Quick Add / Scan / Create / Upload sheet. */
export default function ModalSheet({ title, subtitle, onClose, children, maxWidthClassName = 'max-w-sm' }: Props) {
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-[#1A0D40]/28 backdrop-blur-[3px] sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        className={`relative flex max-h-[88dvh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_24px_70px_rgba(26,13,64,0.32)] sm:rounded-[24px]`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-6 w-full shrink-0 items-center justify-center sm:hidden">
          <div className="h-1.5 w-11 rounded-full bg-[#ECE9E3]" />
        </div>

        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-1 sm:pt-5">
          <div>
            <h2 className="font-editorial text-[20px] font-semibold leading-tight text-[#1A0D40]">{title}</h2>
            {subtitle ? <p className="mt-1 font-ui text-[12.5px] leading-snug text-[#6E6E73]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 bg-[#F5F5F7] text-[#1A0D40] transition hover:bg-[#ECE9E3] active:scale-95"
          >
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </motion.div>
    </motion.div>
  )
}
