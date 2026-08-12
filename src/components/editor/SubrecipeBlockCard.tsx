import { ChevronDown, ChevronUp, GripVertical, Pencil, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  flatIngredientsFromJson,
  flatStepsFromJson,
  loadRecipesByIds,
  type ChildRecipeSummary,
} from '../../lib/recipeRelationships'
import { stepPlainText } from '../../lib/stepFormatting'
import IngredientEditRow, { type EditorIngredient } from './IngredientEditRow'

type Props = {
  title: string
  child: ChildRecipeSummary | null | undefined
  childId: string
  mode: 'ingredients' | 'method'
  collapsed: boolean
  dragging?: boolean
  onToggleCollapsed: () => void
  onRemove: () => void
  onDragHandlePointerDown: (e: React.PointerEvent) => void
  rowRef: (el: HTMLElement | null) => void
  /** When set (ingredients mode), rows are editable and persist via parent draft state. */
  editableIngredients?: EditorIngredient[] | null
  onChangeIngredient?: (id: string, patch: Partial<EditorIngredient>) => void
  onRemoveIngredient?: (id: string) => void
  onAddIngredient?: () => void
  /** Open nested editor for this child recipe. */
  onEdit?: () => void
}

/** Collapsible subrecipe embed — same inline chrome as ingredient rows (grip + title + chevron + X). */
export default function SubrecipeBlockCard({
  title,
  child: childProp,
  childId,
  mode,
  collapsed,
  dragging,
  onToggleCollapsed,
  onRemove,
  onDragHandlePointerDown,
  rowRef,
  editableIngredients,
  onChangeIngredient,
  onRemoveIngredient,
  onAddIngredient,
  onEdit,
}: Props) {
  const [fetchedChild, setFetchedChild] = useState<ChildRecipeSummary | null>(null)
  const child = childProp ?? fetchedChild

  useEffect(() => {
    if (childProp || !childId) return
    let alive = true
    void loadRecipesByIds([childId]).then((map) => {
      if (!alive) return
      setFetchedChild(map.get(childId) ?? null)
    })
    return () => {
      alive = false
    }
  }, [childProp, childId])

  const displayTitle = (child?.title || title || 'Subrecipe').trim() || 'Subrecipe'
  const headerLabel = `${displayTitle} · Subrecipe`
  const readonlyIngredients = flatIngredientsFromJson(child?.cleaned_json)
  const steps = flatStepsFromJson(child?.cleaned_json)
  const canEdit = mode === 'ingredients' && Array.isArray(editableIngredients) && onChangeIngredient && onRemoveIngredient

  return (
    <div
      ref={rowRef}
      className={`flex flex-col gap-1.5 border-b border-[#F4F3F6] py-2 last:border-b-0 ${dragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={onDragHandlePointerDown}
          className="-ml-1 flex h-9 w-6 shrink-0 touch-none items-center justify-center border-0 bg-transparent text-[#c4c2c8]"
        >
          <GripVertical size={16} strokeWidth={2} />
        </button>
        <span className="min-w-0 flex-1 truncate font-editorial text-[14.5px] font-semibold text-[#1A0D40]">
          {headerLabel}
        </span>
        {onEdit ? (
          <button
            type="button"
            aria-label="Edit subrecipe"
            onClick={onEdit}
            className="flex h-9 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-[#9a9aa0]"
          >
            <Pencil size={14} strokeWidth={2.2} />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={collapsed ? 'Expand subrecipe' : 'Collapse subrecipe'}
          onClick={onToggleCollapsed}
          className="flex h-9 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-[#9a9aa0]"
        >
          {collapsed ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronUp size={16} strokeWidth={2.2} />}
        </button>
        <button
          type="button"
          aria-label="Remove subrecipe"
          onClick={onRemove}
          className="-mr-1 flex h-9 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-[#9a9aa0]"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </div>

      {!collapsed ? (
        <div className="ml-[30px] pb-1 pr-1">
          {mode === 'ingredients' ? (
            canEdit ? (
              <div className="flex flex-col gap-0">
                {editableIngredients!.length === 0 ? (
                  <p className="py-1 font-ui text-[12.5px] text-[#9a9aa0]">No ingredients</p>
                ) : (
                  editableIngredients!.map((ing) => (
                    <IngredientEditRow
                      key={ing.id}
                      ingredient={ing}
                      onChange={(patch) => onChangeIngredient!(ing.id, patch)}
                      onRemove={() => onRemoveIngredient!(ing.id)}
                      onEnterName={() => onAddIngredient?.()}
                      nameInputRef={() => {}}
                      onDragHandlePointerDown={(e) => e.preventDefault()}
                      rowRef={() => {}}
                    />
                  ))
                )}
                {onAddIngredient ? (
                  <button
                    type="button"
                    onClick={onAddIngredient}
                    className="mt-1 flex h-8 items-center gap-1.5 border-0 bg-transparent px-0 font-ui text-[12px] font-semibold text-[#4C6A57]"
                  >
                    <Plus size={13} strokeWidth={2.4} />
                    Add ingredient
                  </button>
                ) : null}
              </div>
            ) : readonlyIngredients.length === 0 ? (
              <p className="font-ui text-[12.5px] text-[#9a9aa0]">No ingredients</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {readonlyIngredients.map((ing, i) => (
                  <li
                    key={`${ing.name}-${i}`}
                    className="flex items-baseline gap-2 font-ui text-[13px] text-[#332e3d]"
                  >
                    <span className="w-10 shrink-0 tabular-nums text-[#6b6575]">
                      {ing.amount?.trim() || '—'}
                    </span>
                    <span className="w-12 shrink-0 text-[#6b6575]">{ing.unit?.trim() || ''}</span>
                    <span className="min-w-0 flex-1">{ing.name}</span>
                  </li>
                ))}
              </ul>
            )
          ) : steps.length === 0 ? (
            <p className="font-ui text-[12.5px] text-[#9a9aa0]">No steps</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {steps.map((raw, i) => {
                const plain = stepPlainText(raw).trim()
                const isHeading = raw.trim().startsWith('## ')
                if (isHeading) {
                  return (
                    <li
                      key={i}
                      className="list-none font-editorial text-[13px] font-semibold text-[#1A0D40]"
                    >
                      {plain}
                    </li>
                  )
                }
                return (
                  <li key={i} className="ml-4 list-decimal font-ui text-[13px] leading-snug text-[#332e3d]">
                    {plain || '…'}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  )
}
