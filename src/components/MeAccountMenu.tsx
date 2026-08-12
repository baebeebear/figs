import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LogOut, User } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  username: string | null
  avatarUrl: string | null
  onSignOut: () => void
}

/** Frosted dropdown anchored to the Me tab username — trimmed to just the current user + sign out. */
export default function MeAccountMenu({ open, onClose, username, avatarUrl, onSignOut }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const page = typeof document !== 'undefined' ? (document.querySelector('.me-page') as HTMLElement | null) : null

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (menuRef.current?.contains(t)) return
      if (t.closest('[data-figs-glass-anchor]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, onClose])

  if (!open) return null

  const panel = (
    <div
      ref={menuRef}
      className="figs-glass-panel absolute left-1/2 top-full mt-2 w-64 -translate-x-1/2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ul className="m-0 list-none p-1.5">
        <li>
          <div className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-[30px] w-[30px] shrink-0 rounded-full object-cover" />
            ) : (
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: 'linear-gradient(165deg, #1A0D40 0%, #12082E 100%)' }}
              >
                <User size={15} strokeWidth={2} />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-ui text-sm font-semibold text-[#1A0D40]">
              {username ? `@${username}` : 'figs account'}
            </span>
          </div>
        </li>
        <li className="mx-2 my-1 h-px bg-[#1A0D40]/10" aria-hidden />
        <li>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-2.5 py-2 text-left transition hover:bg-[#1A0D40]/[0.04] active:bg-[#1A0D40]/[0.07]"
            onClick={() => {
              onClose()
              onSignOut()
            }}
          >
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#c0503a]/[0.08] text-[#c0503a]">
              <LogOut size={15} strokeWidth={2.25} />
            </span>
            <span className="font-ui text-sm font-medium text-[#c0503a]">Sign out</span>
          </button>
        </li>
      </ul>
    </div>
  )

  const scrim =
    page &&
    createPortal(
      <button type="button" aria-label="Close account menu" className="figs-glass-scrim figs-glass-scrim--in-page" onClick={onClose} />,
      page,
    )

  return (
    <>
      {scrim}
      {panel}
    </>
  )
}
