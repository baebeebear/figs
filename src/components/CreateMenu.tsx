import { useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import FigsGlassOverlay, { useShellAnchorRect } from './FigsGlassOverlay'

export type CreateMenuActionDef = { id: string; label: string; icon: LucideIcon }

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (action: string) => void
  actions: CreateMenuActionDef[]
  /** Plus / X control — menu anchors above it. */
  anchorRef: React.RefObject<HTMLElement | null>
}

/** Frosted create menu — opens above the + button. Actions vary by caller (Home vs Me). */
export default function CreateMenu({ open, onClose, onSelect, actions, anchorRef }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const rect = useShellAnchorRect(open, anchorRef)

  if (!open || !rect) return null

  return (
    <FigsGlassOverlay
      open={open}
      onClose={onClose}
      label="Close create menu"
      panelRef={menuRef}
      panelStyle={{
        position: 'absolute',
        right: Math.max(8, rect.shellW - rect.right),
        bottom: Math.max(8, rect.shellH - rect.top + 8),
        width: 224,
      }}
    >
      <ul className="m-0 flex list-none flex-col gap-1 p-2">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <li key={action.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-3 py-3 text-left transition hover:bg-[#1A0D40]/[0.04] active:bg-[#1A0D40]/[0.07]"
                onClick={() => onSelect(action.id)}
              >
                <Icon size={18} strokeWidth={2} className="shrink-0 text-black" aria-hidden />
                <span className="font-ui text-sm font-medium text-black">{action.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </FigsGlassOverlay>
  )
}
