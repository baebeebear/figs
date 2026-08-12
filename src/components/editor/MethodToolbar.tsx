import { Bold, Image as ImageIcon, Italic, Link2, ListPlus, Underline } from 'lucide-react'

type Props = {
  disabled: boolean
  onBold: () => void
  onItalic: () => void
  onUnderline: () => void
  onLink: () => void
  onAddIngredient: () => void
  onAddImage: () => void
}

const btnClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-[#1A0D40] transition disabled:opacity-30 hover:not(:disabled):bg-[#1A0D40]/[0.06]'

/** Method formatting toolbar — applies to whichever step textarea is currently focused. Mirrors
 * figs_1.2.9's article-writing toolbar concept, trimmed to what recipe steps need. */
export default function MethodToolbar({ disabled, onBold, onItalic, onUnderline, onLink, onAddIngredient, onAddImage }: Props) {
  return (
    <div className="mb-2.5 flex items-center gap-0.5 rounded-xl border border-[#ECE9E3] bg-[#FAFAFA] p-1">
      <button type="button" aria-label="Bold" disabled={disabled} onClick={onBold} className={btnClass}>
        <Bold size={15} strokeWidth={2.2} />
      </button>
      <button type="button" aria-label="Italic" disabled={disabled} onClick={onItalic} className={btnClass}>
        <Italic size={15} strokeWidth={2.2} />
      </button>
      <button type="button" aria-label="Underline" disabled={disabled} onClick={onUnderline} className={btnClass}>
        <Underline size={15} strokeWidth={2.2} />
      </button>
      <div className="mx-1 h-5 w-px bg-[#ECE9E3]" />
      <button type="button" aria-label="Add link" disabled={disabled} onClick={onLink} className={btnClass}>
        <Link2 size={15} strokeWidth={2.2} />
      </button>
      <button type="button" aria-label="Add ingredient" disabled={disabled} onClick={onAddIngredient} className={btnClass}>
        <ListPlus size={15} strokeWidth={2.2} />
      </button>
      <button type="button" aria-label="Add image" disabled={disabled} onClick={onAddImage} className={btnClass}>
        <ImageIcon size={15} strokeWidth={2.2} />
      </button>
    </div>
  )
}
