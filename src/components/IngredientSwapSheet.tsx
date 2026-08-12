import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Check, ChevronDown, Info } from 'lucide-react'
import CenteredPopup from './CenteredPopup'
import { buildSwapOptions, recordSwapEvent, type SwapOption } from '../lib/ingredientSwaps'
import { deriveFlavorProfile, deriveNonFlavorAttributes } from '../lib/attributeFormulas'
import { attributeColor, attributeIcon, sortAttributesByProminence } from '../lib/attributeIcons'
import FlavorProfilePills from './FlavorProfilePills'

type Props = {
  ingredientName: string
  history: string[]
  amount?: string
  unit?: string
  authorNotes?: string | null
  /** Options named in the recipe source — shown as preferred swaps first. */
  preferredSwaps?: string[]
  /** AI-inferred real-world scale for a confusing volume/abstract measurement (e.g. "≈ 1-inch
   * knob") — shown as a low-profile "Physical Translation" line when present. */
  physicalEquivalent?: string | null
  userId: string
  stashItemNames: string[]
  recipeId?: string | null
  inStash: boolean
  onClose: () => void
  onSwap: (newName: string) => void
  onSelectHistory: (name: string) => void
}

const PANEL =
  'rounded-xl border border-[#ECE9E3] bg-white shadow-[0_12px_40px_rgba(26,13,64,0.14)]'

/** Strip leading qty/unit crumbs and light brand prefixes so grocery free-text still yields flavor tags. */
function normalizeIngredientInfoName(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^(organic|fresh|frozen|dried|canned|raw|extra\s+virgin)\s+/i, '')
  s = s.replace(/^(\d+\s*\/\s*\d+|\d+[.,]?\d*)\s*(cups?|tbsps?|tsps?|oz|lbs?|g|kg|ml|l|cloves?|pieces?|pcs?|cans?)?\s+/i, '')
  s = s.replace(/^[\d./\s-]+/, '').trim()
  return s || raw.trim()
}

function SwapCandidateInfoPopup({
  name,
  description: initialDescription,
  onClose,
}: {
  name: string
  description?: string
  onClose: () => void
}) {
  const infoName = useMemo(() => normalizeIngredientInfoName(name), [name])
  const flavor = useMemo(() => {
    const tags = deriveFlavorProfile(infoName)
    return tags.length ? tags : ['neutral']
  }, [infoName])
  const attrs = useMemo(() => sortAttributesByProminence(deriveNonFlavorAttributes(infoName)), [infoName])
  const [description, setDescription] = useState(initialDescription ?? '')
  const [physicalTranslation, setPhysicalTranslation] = useState('')
  const [descLoading, setDescLoading] = useState(!initialDescription)

  useEffect(() => {
    let alive = true
    setDescLoading(true)
    void buildSwapOptions(name, []).then(({ description: desc, physicalTranslation: phys }) => {
      if (!alive) return
      setDescription(initialDescription || desc)
      setPhysicalTranslation(phys)
      setDescLoading(false)
    })
    return () => {
      alive = false
    }
  }, [name, initialDescription])

  return (
    <CenteredPopup title={name} subtitle="About this ingredient" onClose={onClose} widthClassName="max-w-xs">
      <div className="flex flex-col gap-3.5">
        {descLoading ? (
          <p className="font-ui text-[13px] text-[#9a9aa0]">Loading description…</p>
        ) : description ? (
          <p className="font-ui text-[13.5px] leading-snug text-[#332e3d]">{description}</p>
        ) : (
          <p className="font-ui text-[13px] text-[#9a9aa0]">No description on file yet.</p>
        )}
        {physicalTranslation ? (
          <div className="flex items-center gap-1.5 -mt-1">
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.05em] text-[#9a9aa0]">
              Physical Translation
            </span>
            <span className="font-ui text-[12px] text-[#6E6E73]">{physicalTranslation}</span>
          </div>
        ) : null}
        <div>
          <p className="mb-1.5 font-ui text-[11px] font-semibold uppercase tracking-[0.05em] text-[#9a9aa0]">Flavor profile</p>
          <FlavorProfilePills tags={flavor} />
        </div>
        {attrs.length ? (
          <div>
            <p className="mb-1.5 font-ui text-[11px] font-semibold uppercase tracking-[0.05em] text-[#9a9aa0]">Attributes</p>
            <div className="flex flex-col gap-2">
              {attrs.map((attr) => {
                const Icon = attributeIcon(attr)
                const color = attributeColor(attr)
                return (
                  <div key={attr} className="flex items-center gap-2.5">
                    <Icon size={15} strokeWidth={2.2} style={{ color }} aria-hidden />
                    <span className="font-ui text-[13px] capitalize text-[#1A0D40]">{attr}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </CenteredPopup>
  )
}

function suggestionCardClass(active: boolean, inStash?: boolean): string {
  if (active) return 'border-2 border-[#1A0D40] bg-[#F4F1F9] shadow-[0_4px_16px_rgba(26,13,64,0.08)]'
  if (inStash) return 'border border-[#1A0D40] bg-white shadow-[0_2px_10px_rgba(26,13,64,0.04)]'
  return 'border border-[#ECE9E3] bg-white shadow-[0_2px_10px_rgba(26,13,64,0.04)]'
}

function InfoIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Ingredient info"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-[#F5F5F7] text-[#6E6E73] transition hover:bg-[#ECE9E3]"
    >
      <Info size={14} strokeWidth={2.2} />
    </button>
  )
}

export default function IngredientSwapSheet({
  ingredientName,
  history,
  amount,
  unit,
  authorNotes,
  preferredSwaps = [],
  physicalEquivalent,
  userId,
  stashItemNames,
  recipeId,
  onClose,
  onSwap,
  onSelectHistory,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState<SwapOption[]>([])
  const [description, setDescription] = useState('')
  const [cachedPhysical, setCachedPhysical] = useState('')
  const [selected, setSelected] = useState('')
  const [customQuery, setCustomQuery] = useState('')
  const [typeaheadOpen, setTypeaheadOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [infoName, setInfoName] = useState<string | null>(null)
  const historyWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setSelected('')
    setCustomQuery('')
    setHistoryOpen(false)
    void buildSwapOptions(ingredientName, stashItemNames, preferredSwaps).then(
      ({ options: opts, description: desc, physicalTranslation }) => {
        if (!active) return
        setOptions(opts)
        setDescription(desc)
        setCachedPhysical(physicalTranslation)
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredientName, preferredSwaps.join('|')])

  const physicalLine = (physicalEquivalent?.trim() || cachedPhysical.trim() || '').trim()

  useEffect(() => {
    if (!historyOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!historyWrapRef.current?.contains(e.target as Node)) setHistoryOpen(false)
    }
    document.addEventListener('pointerdown', onPointer, true)
    return () => document.removeEventListener('pointerdown', onPointer, true)
  }, [historyOpen])

  const topFour = options.slice(0, 4)
  const restOptions = options.slice(4)
  const filteredRest = useMemo(() => {
    const q = customQuery.trim().toLowerCase()
    const pool = restOptions.length ? restOptions : options
    if (!q) return pool
    return pool.filter((o) => o.name.toLowerCase().includes(q))
  }, [customQuery, restOptions, options])

  const commitSwap = () => {
    const name = selected.trim()
    if (!name || name.toLowerCase() === ingredientName.toLowerCase()) return
    onSwap(name)
    void recordSwapEvent(userId, ingredientName, name, recipeId ?? null)
    onClose()
  }

  const currentRow = (
    <div className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#E8E8ED] bg-[#FAFAFA] px-3 py-2 shadow-[0_2px_10px_rgba(26,13,64,0.04)]">
      <div className="min-w-0 flex-1 truncate font-ui text-[14px] font-semibold text-[#1A0D40]">{ingredientName}</div>
      <InfoIconButton onClick={() => setInfoName(ingredientName)} />
    </div>
  )

  return (
    <>
      <CenteredPopup title="Swap ingredient" subtitle={[amount, unit].filter(Boolean).join(' ') || undefined} onClose={onClose} widthClassName="max-w-sm">
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 font-ui text-[11px] font-semibold uppercase tracking-[0.05em] text-[#9a9aa0]">Current</p>
            {history.length > 1 ? (
              <div ref={historyWrapRef} className="relative">
                <button
                  type="button"
                  aria-expanded={historyOpen}
                  aria-haspopup="listbox"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex min-h-[48px] w-full min-w-0 items-center gap-2 rounded-xl border border-[#E8E8ED] bg-white px-3 py-2 text-left shadow-[0_2px_10px_rgba(26,13,64,0.04)] transition hover:border-[#D4D0DD]"
                >
                  <div className="min-w-0 flex-1 truncate font-ui text-[14px] font-semibold text-[#1A0D40]">{ingredientName}</div>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Ingredient info"
                    onClick={(e) => {
                      e.stopPropagation()
                      setInfoName(ingredientName)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        setInfoName(ingredientName)
                      }
                    }}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F5F5F7] text-[#6E6E73]"
                  >
                    <Info size={14} strokeWidth={2.2} />
                  </span>
                  <ChevronDown
                    size={16}
                    strokeWidth={2.2}
                    className="shrink-0 text-[#9a9aa0] transition-transform"
                    style={{ transform: historyOpen ? 'rotate(180deg)' : undefined }}
                  />
                </button>
                {historyOpen ? (
                  <div
                    role="listbox"
                    className={`absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-48 overflow-y-auto py-1 ${PANEL}`}
                  >
                    {history.map((name) => {
                      const active = name === ingredientName
                      return (
                        <button
                          key={name}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            onSelectHistory(name)
                            setHistoryOpen(false)
                          }}
                          className={`flex w-full items-center justify-between gap-2 border-0 px-3 py-2.5 text-left transition hover:bg-[#1A0D40]/[0.04] ${
                            active ? 'bg-[#F4F1F9]' : 'bg-transparent'
                          }`}
                        >
                          <span className="min-w-0 truncate font-ui text-[13.5px] font-semibold text-[#1A0D40]">{name}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`${name} info`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setInfoName(name)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                e.stopPropagation()
                                setInfoName(name)
                              }
                            }}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F5F5F7] text-[#6E6E73]"
                          >
                            <Info size={13} strokeWidth={2.2} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              currentRow
            )}
          </div>

          {loading ? (
            <p className="font-ui text-[12.5px] leading-snug text-[#9a9aa0]">Loading description…</p>
          ) : description ? (
            <p className="font-ui text-[12.5px] leading-snug text-[#6E6E73]">{description}</p>
          ) : (
            <p className="font-ui text-[12.5px] leading-snug text-[#9a9aa0]">No description on file yet.</p>
          )}

          {physicalLine ? (
            <div className="flex items-center gap-1.5 -mt-2">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.05em] text-[#9a9aa0]">
                Physical Translation
              </span>
              <span className="font-ui text-[12px] text-[#6E6E73]">{physicalLine}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F5F5F7] text-[#9a9aa0]">
              <ArrowDown size={16} strokeWidth={2.2} />
            </span>
          </div>

          <div>
            <p className="mb-2 font-ui text-[11px] font-semibold uppercase tracking-[0.05em] text-[#9a9aa0]">Swap to</p>
            {loading ? (
              <p className="py-3 font-ui text-[13px] text-[#9a9aa0]">Loading suggestions…</p>
            ) : (
              <div className="flex flex-col gap-2">
                {topFour.length === 0 ? (
                  <p className="py-1 font-ui text-[13px] text-[#9a9aa0]">No suggestions yet — type a swap below.</p>
                ) : null}
                {topFour.map((o) => {
                  const active = selected === o.name
                  return (
                    <button
                      key={o.token + o.name}
                      type="button"
                      onClick={() => {
                        setSelected(o.name)
                        setCustomQuery('')
                        setTypeaheadOpen(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left transition ${suggestionCardClass(
                        active,
                        o.inStash,
                      )}`}
                    >
                      <span className="min-w-0 truncate font-ui text-[13.5px] font-semibold text-[#1A0D40]">{o.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {o.inStash && !active ? (
                          <span className="rounded-full bg-[#1A0D40]/[0.08] px-2 py-0.5 font-ui text-[10px] font-bold uppercase tracking-wide text-[#1A0D40]">
                            Stash
                          </span>
                        ) : null}
                        {active ? <Check size={16} strokeWidth={2.6} className="text-[#1A0D40]" /> : null}
                        <InfoIconButton onClick={() => setInfoName(o.name)} />
                      </span>
                    </button>
                  )
                })}

                <div className="relative">
                  <input
                    value={customQuery || (selected && !topFour.some((o) => o.name === selected) ? selected : '')}
                    onChange={(e) => {
                      setCustomQuery(e.target.value)
                      setSelected(e.target.value)
                      setTypeaheadOpen(true)
                    }}
                    onFocus={() => setTypeaheadOpen(true)}
                    onBlur={() => window.setTimeout(() => setTypeaheadOpen(false), 120)}
                    placeholder="Type another swap…"
                    className="h-12 w-full rounded-xl border border-[#ECE9E3] bg-white px-3.5 font-ui text-[13.5px] text-[#1A0D40] shadow-[0_2px_10px_rgba(26,13,64,0.04)] outline-none transition focus:border-[#1A0D40]"
                  />
                  {typeaheadOpen && filteredRest.length > 0 ? (
                    <div className={`absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-44 overflow-y-auto py-1 ${PANEL}`}>
                      {filteredRest.map((o) => (
                        <button
                          key={o.token + o.name}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            setSelected(o.name)
                            setCustomQuery(o.name)
                            setTypeaheadOpen(false)
                          }}
                          className="flex w-full items-center justify-between gap-2 border-0 px-3 py-2.5 text-left transition hover:bg-[#1A0D40]/[0.04]"
                        >
                          <span className="truncate font-ui text-[13px] font-semibold text-[#1A0D40]">{o.name}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {o.inStash ? (
                              <span className="font-ui text-[10px] font-bold uppercase tracking-wide text-[#1A0D40]">Stash</span>
                            ) : null}
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`${o.name} info`}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setInfoName(o.name)
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F5F5F7] text-[#6E6E73]"
                            >
                              <Info size={13} strokeWidth={2.2} />
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {authorNotes ? (
            <div>
              <p className="font-ui text-[12px] font-semibold text-[#6E6E73]">Notes from the author</p>
              <p className="mt-1 font-ui text-[13.5px] leading-snug text-[#332e3d]">{authorNotes}</p>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!selected.trim() || selected.trim().toLowerCase() === ingredientName.toLowerCase()}
            onClick={commitSwap}
            className="mt-1 flex h-12 w-full items-center justify-center rounded-xl border-0 bg-[#1A0D40] font-ui text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(26,13,64,0.28)] transition active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
          >
            Swap ingredient
          </button>
        </div>
      </CenteredPopup>
      {infoName ? (
        <SwapCandidateInfoPopup
          name={infoName}
          description={infoName === ingredientName ? description : undefined}
          onClose={() => setInfoName(null)}
        />
      ) : null}
    </>
  )
}
