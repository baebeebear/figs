import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GripVertical, TriangleAlert, X } from 'lucide-react'
import { makeHeadingStep, makeIngredientToken, parseStep, tokenizeStepText } from '../../lib/stepFormatting'
import type { EditorIngredient } from './IngredientEditRow'
import MethodIngredientChipSheet from './MethodIngredientChipSheet'

export type EditorStep = { id: string; raw: string }

type Props = {
  step: EditorStep
  stepNumber: number | null
  warn: boolean
  active: boolean
  ingredients: EditorIngredient[]
  onChangeRaw: (raw: string) => void
  onUpdateIngredient: (index: number, patch: Partial<EditorIngredient>) => void
  onFocus: () => void
  onEnter: () => void
  onRemove: () => void
  onAddStepAfter?: () => void
  onDragHandlePointerDown: (e: React.PointerEvent) => void
  rowRef: (el: HTMLElement | null) => void
  textareaRef: (el: HTMLTextAreaElement | null) => void
  dragging?: boolean
}

const CHIP_ATTR = 'data-ing-chip'
const chipClass =
  'inline-flex max-w-full cursor-pointer select-none items-center rounded-full border border-[#CFE0D5] bg-[#E8F0EB] px-2 py-0.5 font-ui text-[13px] font-semibold leading-[1.35] text-[#1A0D40] align-baseline'

/** The button always reads as just the ingredient name (resolved live from the linked row) — the
 * `{{…}}` token is never shown to the user. */
function resolveChipLabel(
  name: string,
  index: number | undefined,
  ingredients: EditorIngredient[],
): string {
  const byIndex = index != null ? ingredients[index] : undefined
  const byName = byIndex ?? ingredients.find((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase())
  return (byName?.name?.trim() || name).toLowerCase()
}

function serializeEditable(root: HTMLElement): string {
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.getAttribute(CHIP_ATTR) != null) {
      // Serialize name-only tokens ({{name}}) — the ingredient is identified purely by the button's
      // name, resolved back to a row by name on display, so no @index syntax ever surfaces.
      const name = (el.getAttribute('data-ing-name') || el.textContent?.trim() || '').toLowerCase()
      const notes = el.getAttribute('data-ing-notes') || undefined
      if (name) out += makeIngredientToken(name, notes || undefined)
      return
    }
    if (el.tagName === 'BR') {
      out += '\n'
      return
    }
    for (const child of Array.from(el.childNodes)) walk(child)
  }
  for (const child of Array.from(root.childNodes)) walk(child)
  return out
}

function buildEditableDom(raw: string, ingredients: EditorIngredient[]): DocumentFragment {
  const frag = document.createDocumentFragment()
  const tokens = tokenizeStepText(raw)
  for (const token of tokens) {
    if (token.kind === 'ingredient') {
      const resolvedIndex =
        token.index != null
          ? token.index
          : ingredients.findIndex((i) => i.name.trim().toLowerCase() === token.name.trim().toLowerCase())
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.setAttribute(CHIP_ATTR, '1')
      chip.setAttribute('contenteditable', 'false')
      chip.setAttribute('data-ing-name', token.name.toLowerCase())
      if (resolvedIndex >= 0) chip.setAttribute('data-ing-index', String(resolvedIndex))
      if (token.notes) chip.setAttribute('data-ing-notes', token.notes)
      chip.className = chipClass
      chip.textContent = resolveChipLabel(token.name, resolvedIndex >= 0 ? resolvedIndex : undefined, ingredients)
      frag.appendChild(chip)
      continue
    }
    const text =
      token.kind === 'text'
        ? token.text
        : token.kind === 'bold' || token.kind === 'italic' || token.kind === 'underline' || token.kind === 'link'
          ? token.text
          : ''
    if (text) frag.appendChild(document.createTextNode(text))
  }
  return frag
}

export default function MethodStepEditor({
  step,
  stepNumber,
  warn,
  active,
  ingredients,
  onChangeRaw,
  onUpdateIngredient,
  onFocus,
  onEnter,
  onRemove,
  onAddStepAfter,
  onDragHandlePointerDown,
  rowRef,
  textareaRef,
  dragging,
}: Props) {
  const parsed = parseStep(step.raw)
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const editableRef = useRef<HTMLDivElement | null>(null)
  const lastExternalRaw = useRef(step.raw)
  const [chipEdit, setChipEdit] = useState<{
    ingredientIndex: number
    name: string
    amount: string
    unit: string
  } | null>(null)

  const setTextareaRef = (el: HTMLTextAreaElement | null) => {
    localTextareaRef.current = el
    textareaRef(el)
  }

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const hasIngredientChips = !parsed.kind || parsed.kind === 'text'
    ? /\{\{/.test(step.raw)
    : false

  useLayoutEffect(() => {
    if (!hasIngredientChips || !editableRef.current) return
    if (step.raw === lastExternalRaw.current && editableRef.current.childNodes.length > 0) {
      // Refresh chip labels when ingredient amounts/names change without rebuilding caret
      editableRef.current.querySelectorAll(`[${CHIP_ATTR}]`).forEach((node) => {
        const el = node as HTMLElement
        const name = el.getAttribute('data-ing-name') || ''
        const indexRaw = el.getAttribute('data-ing-index')
        const index = indexRaw != null && indexRaw !== '' ? Number(indexRaw) : undefined
        el.textContent = resolveChipLabel(name, index, ingredients)
      })
      return
    }
    lastExternalRaw.current = step.raw
    const el = editableRef.current
    el.replaceChildren(buildEditableDom(step.raw, ingredients))
  }, [step.raw, ingredients, hasIngredientChips])

  useEffect(() => {
    autoGrow(localTextareaRef.current)
  }, [step.raw])

  if (parsed.kind === 'image') {
    return (
      <div ref={rowRef} className={`flex items-start gap-1 ${dragging ? 'opacity-50' : ''}`}>
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={onDragHandlePointerDown}
          className="-ml-1 mt-1 flex h-7 w-5 shrink-0 touch-none items-center justify-center border-0 bg-transparent text-[#c4c2c8]"
        >
          <GripVertical size={16} strokeWidth={2} />
        </button>
        <div className="relative min-w-0 flex-1">
          <img src={parsed.url} alt="" className="w-full rounded-[14px] object-cover" />
          <button
            type="button"
            aria-label="Remove image"
            onClick={onRemove}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-0 bg-black/55 text-white"
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    )
  }

  const isHeading = parsed.kind === 'heading'

  const commitEditable = () => {
    const root = editableRef.current
    if (!root) return
    const next = serializeEditable(root)
    lastExternalRaw.current = next
    if (next !== step.raw) onChangeRaw(next)
  }

  return (
    <div ref={rowRef} className={`group flex flex-col gap-1 rounded-xl py-1 transition-colors ${active ? 'bg-[#F9F8F6]' : ''} ${dragging ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={onDragHandlePointerDown}
          className="-ml-1 flex h-6 w-5 shrink-0 touch-none items-center justify-center border-0 bg-transparent text-[#c4c2c8]"
        >
          <GripVertical size={16} strokeWidth={2} />
        </button>
        {isHeading ? null : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A0D40] font-editorial text-[12px] font-semibold leading-none text-white">
            {stepNumber}
          </span>
        )}

        {isHeading || !hasIngredientChips ? (
          <textarea
            ref={(el) => {
              setTextareaRef(el)
              autoGrow(el)
            }}
            rows={1}
            value={isHeading ? parsed.text : step.raw}
            placeholder={isHeading ? 'Section title' : 'Describe this step…'}
            onFocus={onFocus}
            onChange={(e) => {
              autoGrow(e.target)
              onChangeRaw(isHeading ? makeHeadingStep(e.target.value) : e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onEnter()
              }
            }}
            className={`min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent font-ui outline-none ${
              isHeading
                ? 'font-editorial text-[15px] font-semibold text-[#1A0D40]'
                : 'mt-0.5 text-[14.5px] leading-[1.5] text-[#332e3d]'
            }`}
          />
        ) : (
          <>
            <textarea ref={setTextareaRef} className="sr-only" value={step.raw} readOnly tabIndex={-1} aria-hidden />
            <div
              ref={editableRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline
              data-placeholder="Describe this step…"
              onFocus={onFocus}
              onBlur={commitEditable}
              onInput={() => {
                const root = editableRef.current
                if (!root) return
                const next = serializeEditable(root)
                lastExternalRaw.current = next
                onChangeRaw(next)
              }}
              onClick={(e) => {
                const target = (e.target as HTMLElement).closest(`[${CHIP_ATTR}]`) as HTMLElement | null
                if (!target) return
                e.preventDefault()
                e.stopPropagation()
                const name = target.getAttribute('data-ing-name') || ''
                let ingredientIndex = Number(target.getAttribute('data-ing-index'))
                if (!Number.isFinite(ingredientIndex) || ingredientIndex < 0) {
                  ingredientIndex = ingredients.findIndex((ing) => ing.name.trim().toLowerCase() === name.toLowerCase())
                }
                if (ingredientIndex < 0) ingredientIndex = 0
                const ing = ingredients[ingredientIndex]
                setChipEdit({
                  ingredientIndex,
                  name: ing?.name ?? name,
                  amount: ing?.amount ?? '',
                  unit: ing?.unit ?? '',
                })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  commitEditable()
                  onEnter()
                }
              }}
              className="mt-0.5 min-h-[1.5em] min-w-0 flex-1 whitespace-pre-wrap break-words font-ui text-[14.5px] leading-[1.55] text-[#332e3d] outline-none empty:before:text-[#c4c2c8] empty:before:content-[attr(data-placeholder)]"
            />
          </>
        )}

        <button
          type="button"
          aria-label="Remove step"
          onClick={onRemove}
          className="-mr-1 ml-auto mt-1 flex h-7 w-6 shrink-0 items-center justify-center border-0 bg-transparent text-[#9a9aa0] hover:text-[#c0503a]"
        >
          <X size={15} strokeWidth={2.3} />
        </button>
      </div>

      <div className={`ml-6 mt-1 flex items-center gap-3 font-ui text-[11.5px] font-semibold text-[#6E6E73] ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>
        {onAddStepAfter ? (
          <button type="button" onClick={onAddStepAfter} className="border-0 bg-transparent p-0 text-[#4C6A57] hover:underline">
            + Add Step
          </button>
        ) : null}
      </div>

      {warn ? (
        <p className="ml-5 flex items-center gap-1 font-ui text-[11.5px] font-medium text-[#c0824a]">
          <TriangleAlert size={12} strokeWidth={2.3} />
          This step doesn&apos;t mention an ingredient — is that intended?
        </p>
      ) : null}

      {chipEdit ? (
        <MethodIngredientChipSheet
          name={chipEdit.name}
          amount={chipEdit.amount}
          unit={chipEdit.unit}
          onClose={() => setChipEdit(null)}
          onSave={({ name, amount, unit }) => {
            const { ingredientIndex } = chipEdit
            const cleanName = name.trim().toLowerCase()
            onUpdateIngredient(ingredientIndex, { name: cleanName, amount, unit })
            const oldName = chipEdit.name.trim().toLowerCase()
            // Rewrite the matching name-only tokens in this step to the new name.
            const next = tokenizeStepText(step.raw)
              .map((t) => {
                if (t.kind === 'ingredient') {
                  const matches = t.index === ingredientIndex || t.name.trim().toLowerCase() === oldName
                  return makeIngredientToken(matches ? cleanName : t.name.toLowerCase(), t.notes)
                }
                if (t.kind === 'text') return t.text
                if (t.kind === 'bold') return `**${t.text}**`
                if (t.kind === 'italic') return `*${t.text}*`
                if (t.kind === 'underline') return `<u>${t.text}</u>`
                if (t.kind === 'link') return `[${t.text}](${t.url})`
                return ''
              })
              .join('')
            lastExternalRaw.current = ''
            onChangeRaw(next)
            setChipEdit(null)
          }}
        />
      ) : null}
    </div>
  )
}
