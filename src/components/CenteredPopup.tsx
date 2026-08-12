import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

type Props = {
  title?: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  widthClassName?: string
}

/** Always-centered popup (never a bottom sheet) that pops in with a slight scale — for quick,
 * single-purpose interactions (entering a number, swapping an ingredient) rather than a full
 * multi-field form, which still belongs in ModalSheet. */
export default function CenteredPopup({ title, subtitle, onClose, children, widthClassName = 'max-w-xs' }: Props) {
  return (
    <motion.div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-[#1A0D40]/28 p-4 backdrop-blur-[3px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className={`relative w-full ${widthClassName} rounded-[24px] bg-white p-5 shadow-[0_24px_70px_rgba(26,13,64,0.32)]`}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="font-editorial text-[17px] font-semibold text-[#1A0D40]">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 font-ui text-[12.5px] text-[#6E6E73]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-[#F5F5F7] text-[#1A0D40] transition hover:bg-[#ECE9E3]"
          >
            <X size={14} strokeWidth={2.25} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}
