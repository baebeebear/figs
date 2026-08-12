import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Clock, ExternalLink, ListPlus, MoreHorizontal, Plus, Ruler, X } from 'lucide-react'
import { deleteRecipe, isCanonicalEditable, recipeCreatorLabel, useRecipe, type RecipeCleanedJson } from '../lib/recipes'
import {
  clearCustomization,
  customizationHasChanges,
  loadCustomization,
  swapsFromRecord,
  swapsToRecord,
  upsertCustomization,
  type RecipeCustomization,
} from '../lib/recipeCustomizations'
import { scaleAmount, scaleStepText, parseAmount } from '../utils/recipeMath'
import { convertToUnitSystem, type UnitSystem } from '../utils/unitConversion'
import { groceryIconFor } from '../lib/groceryIcons'
import { isPlatformLogoUrl } from '../lib/gemini'
import type { useStash } from '../lib/stash'
import type { GroceryList, useGroceryLists } from '../lib/groceryLists'
import SwipeIngredientRow from '../components/SwipeIngredientRow'
import IngredientSwapSheet from '../components/IngredientSwapSheet'
import CenteredPopup from '../components/CenteredPopup'
import AnchoredPopup, { type PopupAnchor } from '../components/AnchoredPopup'
import GroceryListEditSheet from '../components/GroceryListEditSheet'
import { RecipeNutritionSummary } from '../components/RecipeNutritionSummary'
import { deriveRecipeAttributes } from '../lib/attributeFormulas'
import { attributeColor, attributeIcon, sortAttributesByProminence } from '../lib/attributeIcons'
import { computeScaledExecutionTime } from '../utils/recipeMetrics'
import { parseStep, rewriteIngredientTokensInSteps, autoLinkIngredientsInSteps } from '../lib/stepFormatting'
import StepContent from '../components/StepContent'
import { buildSwapOptions } from '../lib/ingredientSwaps'
import { evaluateStashCoverage } from '../lib/stashCoverage'
import {
  childIdsFromBlocks,
  flatIngredientsFromJson,
  flatStepsFromJson,
  ingredientBlocksFromJson,
  loadRecipesByIds,
  stepBlocksFromJson,
  type ChildRecipeSummary,
} from '../lib/recipeRelationships'

type Props = {
  recipeId: string
  userId: string
  onBack: () => void
  onOpenRecipe: (recipeId: string) => void
  onEdit: (recipe: NonNullable<ReturnType<typeof useRecipe>['recipe']>) => void
  onDeleted: () => void
  stash: ReturnType<typeof useStash>
  groceries: ReturnType<typeof useGroceryLists>
}

type Ingredient = {
  name: string
  amount: string
  unit: string
  canonical_key?: string
  notes?: string | null
  alternatives?: string[]
  physical_equivalent?: string | null
}

const EMPTY_INGREDIENTS: Ingredient[] = []
const EMPTY_SWAPS: Record<string, string> = {}
const EMPTY_AFFORDANCES: Record<string, boolean> = {}

function parentSwapKey(flatIndex: number) {
  return `p:${flatIndex}`
}
function childSwapKey(childId: string, index: number) {
  return `c:${childId}:${index}`
}

function formatCookTime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export default function RecipeDetailPage({ recipeId, userId, onBack, onOpenRecipe, onEdit, onDeleted, stash, groceries }: Props) {
  const { recipe, loading } = useRecipe(recipeId)
  const [customization, setCustomization] = useState<RecipeCustomization | null>(null)
  const [viewMode, setViewMode] = useState<'original' | 'customized'>('customized')
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [childById, setChildById] = useState<Map<string, ChildRecipeSummary>>(new Map())

  const activeJson: RecipeCleanedJson | null = useMemo(() => {
    if (!recipe) return null
    if (viewMode === 'customized' && customization?.cleaned_json_override) {
      return customization.cleaned_json_override
    }
    return recipe.cleaned_json
  }, [recipe, customization, viewMode])

  /** Canonical servings/times from the saved recipe — never mutated by per-user overlays. */
  const originalServings = recipe?.cleaned_json?.servings ?? null
  /** Servings the currently shown recipe content was authored for (override may differ). */
  const contentBaseServings = activeJson?.servings ?? originalServings
  const [servings, setServings] = useState<number>(originalServings ?? 0)
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('us')
  const [addedAllListId, setAddedAllListId] = useState<string | null>(null)
  const [editingList, setEditingList] = useState<GroceryList | null>(null)
  const [swapKey, setSwapKey] = useState<string | null>(null)
  const [swappedNames, setSwappedNames] = useState<Record<string, string>>({})
  /** Every distinct name ever active for a given ingredient slot (original first), so a swap can
   * be reverted — or re-picked from further back — via a dropdown instead of being one-way. */
  const [swapHistory, setSwapHistory] = useState<Record<string, string[]>>({})
  const [stashSwapAffordances, setStashSwapAffordances] = useState<Record<string, boolean>>({})
  const [servingsPopupOpen, setServingsPopupOpen] = useState(false)
  const [servingsDraft, setServingsDraft] = useState('')
  const [timeBreakdownOpen, setTimeBreakdownOpen] = useState(false)
  const [attributesExpanded, setAttributesExpanded] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<PopupAnchor | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let alive = true
    void loadCustomization(userId, recipeId).then((row) => {
      if (!alive) return
      setCustomization(row)
      if (row) {
        setViewMode('customized')
        if (row.servings != null) setServings(row.servings)
        if (row.unit_system === 'us' || row.unit_system === 'metric') setUnitSystem(row.unit_system)
        setSwappedNames(swapsFromRecord(row.ingredient_swaps))
      }
    })
    return () => {
      alive = false
    }
  }, [userId, recipeId])

  // Sync once the async recipe load supplies a real base servings count (and no overlay servings).
  useEffect(() => {
    if (customization?.servings != null) return
    if (originalServings != null && originalServings > 0) setServings(originalServings)
  }, [originalServings, customization?.servings])

  const schedulePersist = (patch: {
    servings?: number | null
    ingredient_swaps?: Record<string, string>
    unit_system?: string | null
  }) => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      void upsertCustomization(userId, recipeId, patch)
        .then(() => loadCustomization(userId, recipeId))
        .then((row) => {
          if (row) setCustomization(row)
        })
        .catch((err) => console.warn('[RecipeDetail] customization save failed', err))
    }, 300)
  }

  const effectiveBase = contentBaseServings ?? servings
  const ingredients: Ingredient[] = useMemo(() => {
    const list = flatIngredientsFromJson(activeJson)
    return list.length ? list : EMPTY_INGREDIENTS
  }, [activeJson])
  const ingredientBlocks = useMemo(() => ingredientBlocksFromJson(activeJson), [activeJson])
  const methodBlocks = useMemo(() => stepBlocksFromJson(activeJson), [activeJson])
  const steps = useMemo(() => {
    const raw = flatStepsFromJson(activeJson)
    if (!raw.length || !ingredients.length) return raw
    return autoLinkIngredientsInSteps(ingredients, raw)
  }, [activeJson, ingredients])

  useEffect(() => {
    const ids = childIdsFromBlocks(activeJson)
    if (!ids.length) {
      setChildById(new Map())
      return
    }
    let alive = true
    void loadRecipesByIds(ids).then((map) => {
      if (alive) setChildById(map)
    })
    return () => {
      alive = false
    }
  }, [activeJson])

  const basePrepMins = activeJson?.prep_time_mins ?? 0
  const baseCookMins = activeJson?.cook_time_mins ?? 0
  const baseInactiveMins = activeJson?.inactive_time_mins ?? 0
  const hasSplitTimes = basePrepMins > 0 || baseCookMins > 0 || baseInactiveMins > 0
  const legacyTotalMinutes = activeJson?.total_cook_minutes ?? null
  const baseCookMinutes = hasSplitTimes ? baseCookMins + baseInactiveMins : legacyTotalMinutes

  const showVersionToggle = Boolean(
    recipe &&
      (customizationHasChanges(customization) ||
        Object.keys(swappedNames).length > 0 ||
        (servings > 0 && originalServings != null && servings !== originalServings)),
  )
  const viewSwaps = viewMode === 'customized' ? swappedNames : EMPTY_SWAPS
  /** Original view always shows the recipe's authored servings; Customized shows the user's overlay. */
  const viewServings =
    viewMode === 'original' ? (originalServings ?? contentBaseServings ?? servings) : servings || effectiveBase
  const viewScaleRatio =
    viewMode === 'original' || !contentBaseServings || !viewServings || viewServings === contentBaseServings
      ? 1
      : viewServings / contentBaseServings

  /** Non-linear power-law time scaling (see recipeMetrics.ts) — keyed to the *visible* servings
   * so Original stays at authored times while Customized tracks the user's batch size. */
  const scaledTimes = useMemo(() => {
    if (!contentBaseServings || !viewServings || !hasSplitTimes) return null
    return computeScaledExecutionTime({
      baseServings: contentBaseServings,
      targetServings: viewServings,
      prepMins: basePrepMins,
      cookMins: baseCookMins,
      inactiveMins: baseInactiveMins,
    })
  }, [contentBaseServings, viewServings, hasSplitTimes, basePrepMins, baseCookMins, baseInactiveMins])

  const timeLabel = scaledTimes
    ? formatCookTime(scaledTimes.totalMins)
    : formatCookTime(legacyTotalMinutes ? Math.round(legacyTotalMinutes * viewScaleRatio) : legacyTotalMinutes)

  /** Per step-block linked text so later blocks never fall back to unlinked `block.text`. */
  const linkedStepByBlock = useMemo(() => {
    return methodBlocks.map((block) => {
      if (block.type !== 'step') return null
      const [linked] = autoLinkIngredientsInSteps(ingredients, [block.text])
      if (viewScaleRatio === 1) return linked
      return parseStep(linked).kind === 'text' ? scaleStepText(linked, viewScaleRatio) : linked
    })
  }, [methodBlocks, ingredients, viewScaleRatio])

  const scaledIngredients = useMemo(() => {
    if (!ingredients.length) return EMPTY_INGREDIENTS
    if (viewMode === 'original' || !contentBaseServings || !viewServings || viewServings === contentBaseServings) {
      return ingredients
    }
    return ingredients.map((ing) => ({
      ...ing,
      amount: ing.amount ? scaleAmount(ing.amount, contentBaseServings, viewServings) : ing.amount,
    }))
  }, [ingredients, contentBaseServings, viewServings, viewMode])

  const displayIngredients = useMemo(() => {
    if (!scaledIngredients.length) return EMPTY_INGREDIENTS
    return scaledIngredients.map((ing) => {
      if (!ing.amount || !ing.unit) return ing
      const converted = convertToUnitSystem(ing.amount, ing.unit, unitSystem)
      return { ...ing, amount: converted.amount, unit: converted.unit }
    })
  }, [scaledIngredients, unitSystem])

  const recipeAttributes = useMemo(
    () => sortAttributesByProminence(deriveRecipeAttributes(displayIngredients, steps, baseCookMinutes)),
    [displayIngredients, steps, baseCookMinutes],
  )

  /** Exact-name stash match: lowercase, punctuation→spaces, collapse whitespace, light
   * de-pluralize per word, then require the full word sequences to be equal. No prefix/subset
   * matching and no descriptor stripping — those were the source of false "in stash" hits. */
  const isStrictStashMatch = (recipeIngName: string, stashItemName: string): boolean => {
    const normalize = (raw: string) =>
      raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
        .join(' ')
    const r = normalize(recipeIngName)
    const s = normalize(stashItemName)
    return !!r && !!s && r === s
  }

  const stashItemForIngredient = (_ing: Ingredient, displayName: string) => {
    return stash.items.find((it) => isStrictStashMatch(displayName, it.name)) ?? null
  }

  const stashItemNames = useMemo(() => stash.items.map((it) => it.name), [stash.items])

  useEffect(() => {
    let cancelled = false
    if (!displayIngredients.length && childById.size === 0) {
      setStashSwapAffordances((prev) => (Object.keys(prev).length ? EMPTY_AFFORDANCES : prev))
      return
    }
    void (async () => {
      const next: Record<string, boolean> = {}
      await Promise.all([
        ...displayIngredients.map(async (ing, i) => {
          const key = parentSwapKey(i)
          const displayName = viewSwaps[key] ?? ing.name
          if (stashItemForIngredient(ing, displayName)) {
            next[key] = false
            return
          }
          try {
            const { options } = await buildSwapOptions(displayName, stashItemNames, ing.alternatives ?? [])
            next[key] = options.some((o) => o.inStash) || (ing.alternatives?.length ?? 0) > 0
          } catch {
            next[key] = (ing.alternatives?.length ?? 0) > 0
          }
        }),
        ...[...childById.entries()].flatMap(([childId, child]) => {
          const childIngs = flatIngredientsFromJson(child.cleaned_json)
          return childIngs.map(async (ing, ci) => {
            const key = childSwapKey(childId, ci)
            const displayName = viewSwaps[key] ?? ing.name
            if (stashItemForIngredient(ing, displayName)) {
              next[key] = false
              return
            }
            try {
              const { options } = await buildSwapOptions(displayName, stashItemNames, ing.alternatives ?? [])
              next[key] = options.some((o) => o.inStash) || (ing.alternatives?.length ?? 0) > 0
            } catch {
              next[key] = (ing.alternatives?.length ?? 0) > 0
            }
          })
        }),
      ])
      if (!cancelled) setStashSwapAffordances(next)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayIngredients, viewSwaps, stashItemNames, childById])

  const openServingsPopup = () => {
    setServingsDraft(String(servings || effectiveBase))
    setServingsPopupOpen(true)
  }

  const commitServingsDraft = () => {
    const n = Math.round(Number(servingsDraft))
    if (Number.isFinite(n) && n > 0) {
      const next = Math.min(20, n)
      setServings(next)
      setViewMode('customized')
      schedulePersist({ servings: next, ingredient_swaps: swapsToRecord(swappedNames), unit_system: unitSystem })
    }
    setServingsPopupOpen(false)
  }

  const addIngredientToList = async (
    listId: string,
    ing: Ingredient,
    opts: { originRecipeId: string; originRecipeTitle: string; originIngredientIndex: number; swapKey: string },
  ) => {
    const qty = parseAmount(ing.amount ?? '')
    await groceries.addItem(listId, {
      name: viewSwaps[opts.swapKey] ?? ing.name,
      qty: qty != null && qty > 0 ? qty : undefined,
      unit: ing.unit || undefined,
      originType: 'recipe',
      originRecipeId: opts.originRecipeId,
      originRecipeTitle: opts.originRecipeTitle,
      originIngredientIndex: opts.originIngredientIndex,
      notes: ing.notes ?? null,
    })
  }

  type GroceryTarget = {
    swapKey: string
    ing: Ingredient
    originRecipeId: string
    originRecipeTitle: string
    originIngredientIndex: number
  }

  type PendingGrocery = { kind: 'single'; target: GroceryTarget } | { kind: 'all' }
  const [pendingGrocery, setPendingGrocery] = useState<PendingGrocery | null>(null)
  const [groceryMissingOnly, setGroceryMissingOnly] = useState(true)
  const [creatingListForPending, setCreatingListForPending] = useState(false)
  /** swapKey -> grocery rows already added from this recipe tree. */
  const [addedByKey, setAddedByKey] = useState<Record<string, { listId: string; itemId: string }[]>>({})

  const childIdSet = useMemo(() => new Set(childIdsFromBlocks(activeJson)), [activeJson])

  useEffect(() => {
    const next: Record<string, { listId: string; itemId: string }[]> = {}
    for (const list of groceries.lists) {
      for (const item of groceries.itemsByList[list.id] ?? []) {
        if (item.origin_ingredient_index == null || !item.origin_recipe_id) continue
        let key: string | null = null
        if (item.origin_recipe_id === recipeId) key = parentSwapKey(item.origin_ingredient_index)
        else if (childIdSet.has(item.origin_recipe_id))
          key = childSwapKey(item.origin_recipe_id, item.origin_ingredient_index)
        if (!key) continue
        next[key] = next[key] ?? []
        next[key].push({ listId: list.id, itemId: item.id })
      }
    }
    setAddedByKey(next)
  }, [groceries.lists, groceries.itemsByList, recipeId, childIdSet])

  const eligibleGroceryLists = useMemo(
    () => groceries.lists.filter((l) => !l.linked_recipe_id || l.linked_recipe_id === recipeId),
    [groceries.lists, recipeId],
  )

  const listNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of groceries.lists) m.set(l.id, l.name)
    return m
  }, [groceries.lists])

  const nextLinkedListName = () => {
    const base = (recipe?.title ?? 'Recipe').trim() || 'Recipe'
    const names = new Set(groceries.lists.map((l) => l.name))
    if (!names.has(base)) return base
    let n = 2
    while (names.has(`${base} (${n})`)) n += 1
    return `${base} (${n})`
  }

  const alreadyOnList = (listId: string, swapKey: string) =>
    (addedByKey[swapKey] ?? []).some((m) => m.listId === listId)

  const collectAllGroceryTargets = (): GroceryTarget[] => {
    const out: GroceryTarget[] = []
    displayIngredients.forEach((ing, i) => {
      out.push({
        swapKey: parentSwapKey(i),
        ing,
        originRecipeId: recipeId,
        originRecipeTitle: recipe?.title || 'Recipe',
        originIngredientIndex: i,
      })
    })
    for (const block of ingredientBlocks) {
      if (block.type !== 'subrecipe') continue
      const child = childById.get(block.recipe_id)
      const childIngs = flatIngredientsFromJson(child?.cleaned_json)
      const childBase = child?.cleaned_json?.servings ?? contentBaseServings ?? 1
      const ratio =
        contentBaseServings && viewServings && viewServings !== contentBaseServings
          ? viewServings / contentBaseServings
          : 1
      childIngs.forEach((ing, ci) => {
        const amount =
          ratio !== 1 && ing.amount
            ? scaleAmount(ing.amount, childBase || 1, (childBase || 1) * ratio)
            : ing.amount
        let displayAmount = amount
        let displayUnit = ing.unit
        if (amount && ing.unit) {
          const converted = convertToUnitSystem(amount, ing.unit, unitSystem)
          displayAmount = converted.amount
          displayUnit = converted.unit
        }
        out.push({
          swapKey: childSwapKey(block.recipe_id, ci),
          ing: { ...ing, amount: displayAmount ?? '', unit: displayUnit ?? '' },
          originRecipeId: block.recipe_id,
          originRecipeTitle: child?.title || 'Subrecipe',
          originIngredientIndex: ci,
        })
      })
    }
    return out
  }

  const runGroceryAction = async (listId: string, action: PendingGrocery) => {
    const list = groceries.lists.find((l) => l.id === listId)
    const isLinkedToThis = list?.linked_recipe_id === recipeId

    if (action.kind === 'single') {
      const t = action.target
      if (isLinkedToThis && alreadyOnList(listId, t.swapKey)) return
      await addIngredientToList(listId, t.ing, t)
      await groceries.load()
      return
    }

    const targets = collectAllGroceryTargets().filter((t) => {
      if (isLinkedToThis && alreadyOnList(listId, t.swapKey)) return false
      if (!groceryMissingOnly) return true
      const name = viewSwaps[t.swapKey] ?? t.ing.name
      const cov = evaluateStashCoverage(
        { name, amount: t.ing.amount, unit: t.ing.unit },
        stash.items,
      )
      return cov.level !== 'full'
    })
    await Promise.all(targets.map((t) => addIngredientToList(listId, t.ing, t)))
    setAddedAllListId(listId)
    await groceries.load()
  }

  const startGroceryAction = async (action: PendingGrocery) => {
    setGroceryMissingOnly(true)
    setPendingGrocery(action)
  }

  const pickGroceryList = async (listId: string) => {
    const action = pendingGrocery
    setPendingGrocery(null)
    setCreatingListForPending(false)
    if (!action) return
    await runGroceryAction(listId, action)
  }

  const linkRecipeListAndAdd = async () => {
    const action = pendingGrocery
    if (!action) return
    const listId = await groceries.createList(nextLinkedListName(), {
      linkedRecipeId: recipeId,
      imageUrl: recipe?.source_image_url ?? null,
    })
    if (!listId) return
    setPendingGrocery(null)
    await runGroceryAction(listId, action)
  }

  const handleUncheckIngredient = async (swapKey: string) => {
    const marks = addedByKey[swapKey] ?? []
    for (const m of marks) {
      const item = (groceries.itemsByList[m.listId] ?? []).find((it) => it.id === m.itemId)
      if (item) await groceries.deleteItem(item)
    }
    await groceries.load()
  }

  const removeIngredientFromList = async (listId: string, swapKey: string) => {
    const mark = (addedByKey[swapKey] ?? []).find((m) => m.listId === listId)
    if (!mark) return
    const item = (groceries.itemsByList[listId] ?? []).find((it) => it.id === mark.itemId)
    if (item) await groceries.deleteItem(item)
    await groceries.load()
  }

  const removeAllIngredientsFromList = async (listId: string) => {
    for (const swapKey of Object.keys(addedByKey)) {
      const mark = (addedByKey[swapKey] ?? []).find((m) => m.listId === listId)
      if (!mark) continue
      const item = (groceries.itemsByList[listId] ?? []).find((it) => it.id === mark.itemId)
      if (item) await groceries.deleteItem(item)
    }
    if (addedAllListId === listId) setAddedAllListId(null)
    await groceries.load()
  }

  const handleAddToGrocery = (ing: Ingredient, index: number) =>
    void startGroceryAction({
      kind: 'single',
      target: {
        swapKey: parentSwapKey(index),
        ing,
        originRecipeId: recipeId,
        originRecipeTitle: recipe?.title || 'Recipe',
        originIngredientIndex: index,
      },
    })

  const handleAddChildToGrocery = (childId: string, childTitle: string, ing: Ingredient, ci: number) =>
    void startGroceryAction({
      kind: 'single',
      target: {
        swapKey: childSwapKey(childId, ci),
        ing,
        originRecipeId: childId,
        originRecipeTitle: childTitle,
        originIngredientIndex: ci,
      },
    })

  const handleAddAllToGrocery = () => void startGroceryAction({ kind: 'all' })

  const draftCreateList: GroceryList = {
    id: '',
    user_id: '',
    name: (() => {
      const d = new Date()
      return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - List`
    })(),
    created_at: '',
    archived_at: null,
    icon_key: 'shopping-cart',
    icon_color: '#F4F1F9',
    image_url: null,
    is_recurring: false,
    linked_recipe_id: null,
    position: null,
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[160] flex items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E8E8ED] border-t-[#1A0D40]" />
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="fixed inset-0 z-[160] flex flex-col items-center justify-center gap-3 bg-white p-6">
        <p className="font-ui text-[14px] text-[#6E6E73]">Recipe not found.</p>
        <button type="button" onClick={onBack} className="font-ui text-[13px] font-semibold text-[#1A0D40]">
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[160] flex flex-col bg-white">
      <main className="flex-1 overflow-y-auto pb-10">
        <div className="relative w-full bg-[#1A0D40]" style={{ aspectRatio: '1 / 1', background: 'linear-gradient(165deg, #1A0D40 0%, #12082E 100%)' }}>
          {recipe.source_image_url && !isPlatformLogoUrl(recipe.source_image_url) ? (
            <img
              src={recipe.source_image_url}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : null}
          {recipe.source_image_url && recipe.cleaned_json?.is_ai_generated_hero ? (
            <span className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-full border border-white/40 bg-black/25 px-2.5 py-1 font-ui text-[10px] font-bold uppercase tracking-[0.06em] text-white/85 backdrop-blur-[3px]">
              AI
            </span>
          ) : null}
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border-0 bg-black/30 text-white backdrop-blur-[4px] transition active:opacity-70"
            style={{ top: 'max(16px, env(safe-area-inset-top, 0px))' }}
          >
            <ChevronLeft size={22} strokeWidth={2.5} />
          </button>
          {showVersionToggle ? (
            <div
              className="pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 items-center rounded-full border border-white/35 bg-black/35 p-0.5 backdrop-blur-[8px]"
              style={{ top: 'max(16px, env(safe-area-inset-top, 0px))' }}
            >
              {(['original', 'customized'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`flex items-center gap-1 rounded-full border-0 px-3 py-1.5 font-ui text-[11px] font-semibold capitalize transition ${
                    viewMode === mode ? 'bg-white text-[#1A0D40]' : 'bg-transparent text-white/85'
                  }`}
                >
                  <span>{mode}</span>
                  {mode === 'customized' ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Delete customized version"
                      onClick={(e) => {
                        e.stopPropagation()
                        void (async () => {
                          try {
                            await clearCustomization(userId, recipeId)
                            setCustomization(null)
                            setSwappedNames({})
                            setSwapHistory({})
                            setViewMode('original')
                            if (originalServings != null) setServings(originalServings)
                            setUnitSystem('us')
                          } catch (err) {
                            console.warn('[RecipeDetail] clear customization failed', err)
                          }
                        })()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          ;(e.currentTarget as HTMLElement).click()
                        }
                      }}
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${
                        viewMode === 'customized' ? 'text-[#6E6E73]' : 'text-white/70'
                      }`}
                    >
                      <X size={11} strokeWidth={2.6} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            aria-label="More options"
            onClick={(e) => setMenuAnchor({ clientX: e.clientX, clientY: e.clientY })}
            className="absolute right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border-0 bg-black/30 text-white backdrop-blur-[4px] transition active:opacity-70"
            style={{ top: 'max(16px, env(safe-area-inset-top, 0px))' }}
          >
            <MoreHorizontal size={20} strokeWidth={2.4} />
          </button>
        </div>

        <div className="px-[22px] pt-[18px]">
          <h1 className="flex items-center gap-2 font-editorial text-[27px] font-semibold leading-[1.12] tracking-[-0.01em] text-[#1A0D40]">
            <span>{recipe.title || 'Untitled recipe'}</span>
            {recipe.source_url ? (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noreferrer"
                aria-label="View original recipe"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#9a9aa0] transition active:opacity-60"
              >
                <ExternalLink size={17} strokeWidth={2.2} />
              </a>
            ) : null}
          </h1>

          <div className="mt-[13px] flex items-center justify-between">
            <span className="font-ui text-[13.5px] font-semibold text-[#111]">
              {recipeCreatorLabel({ author_name: recipe.author_name, source_url: recipe.source_url })}
            </span>
            {timeLabel ? (
              <button
                type="button"
                onClick={() => setTimeBreakdownOpen(true)}
                className="flex items-center gap-1.5 border-0 bg-transparent p-0 font-ui text-[13px] font-semibold text-[#111] transition active:opacity-70"
              >
                <Clock size={15} strokeWidth={2.1} />
                {timeLabel}
              </button>
            ) : null}
          </div>
          <div className="mt-3 h-px w-full bg-[#ECE9E3]" />
        </div>

        {recipe.cleaned_json?.description ? (
          <div className="px-[22px] pt-4">
            <p className="font-ui text-[14.5px] leading-[1.55] text-[#332e3d]">{recipe.cleaned_json.description}</p>
          </div>
        ) : null}

        {ingredientBlocks.length > 0 ? (
          <div className="px-[22px] pt-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-editorial text-[20px] font-semibold text-[#1A0D40]">Ingredients</h2>
              <div className="flex items-center gap-2">
                {contentBaseServings || originalServings ? (
                  <div className="flex items-center rounded-full border border-white/60 bg-white/75 py-[2px] pl-1 pr-1 font-ui text-[12.5px] font-semibold text-[#111] backdrop-blur-[20px] backdrop-saturate-150">
                    <button
                      type="button"
                      aria-label="Fewer servings"
                      onClick={() => {
                        setServings((s) => {
                          const next = Math.max(1, (s || effectiveBase) - 1)
                          setViewMode('customized')
                          schedulePersist({
                            servings: next,
                            ingredient_swaps: swapsToRecord(swappedNames),
                            unit_system: unitSystem,
                          })
                          return next
                        })
                      }}
                      className="flex h-6 w-5 items-center justify-center rounded-full border-0 bg-transparent text-[15px] leading-none text-[#1A0D40]"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={openServingsPopup}
                      className="min-w-[52px] rounded-full border-0 bg-transparent px-1 text-center leading-none"
                    >
                      For {viewServings}
                    </button>
                    <button
                      type="button"
                      aria-label="More servings"
                      onClick={() => {
                        setServings((s) => {
                          const next = Math.min(20, (s || effectiveBase) + 1)
                          setViewMode('customized')
                          schedulePersist({
                            servings: next,
                            ingredient_swaps: swapsToRecord(swappedNames),
                            unit_system: unitSystem,
                          })
                          return next
                        })
                      }}
                      className="flex h-6 w-5 items-center justify-center rounded-full border-0 bg-transparent text-[15px] leading-none text-[#1A0D40]"
                    >
                      +
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  aria-label={unitSystem === 'us' ? 'Switch to metric units' : 'Switch to US units'}
                  onClick={() => {
                    setUnitSystem((s) => {
                      const next = s === 'us' ? 'metric' : 'us'
                      setViewMode('customized')
                      schedulePersist({
                        servings,
                        ingredient_swaps: swapsToRecord(swappedNames),
                        unit_system: next,
                      })
                      return next
                    })
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/60 bg-white/75 text-[#1A0D40] backdrop-blur-[20px] backdrop-saturate-150 transition hover:bg-white/90"
                >
                  <Ruler size={14} strokeWidth={2.1} />
                </button>
                <button
                  type="button"
                  aria-label="Add all ingredients to grocery list"
                  onClick={handleAddAllToGrocery}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/60 backdrop-blur-[20px] backdrop-saturate-150 transition hover:opacity-90"
                  style={
                    addedAllListId
                      ? { background: 'linear-gradient(165deg, #1A0D40 0%, #12082E 100%)', borderColor: 'transparent', color: '#fff' }
                      : { background: 'rgba(255,255,255,0.75)', color: '#1A0D40' }
                  }
                >
                  <ListPlus size={14} strokeWidth={2.1} />
                </button>
              </div>
            </div>
            <div className="mt-3.5 flex flex-col">
              {(() => {
                let flatIndex = 0
                return ingredientBlocks.map((block, bi) => {
                  if (block.type === 'subrecipe') {
                    const child = childById.get(block.recipe_id)
                    const childIngs = flatIngredientsFromJson(child?.cleaned_json)
                    const childBase = child?.cleaned_json?.servings ?? contentBaseServings ?? 1
                    const ratio =
                      contentBaseServings && viewServings && viewServings !== contentBaseServings
                        ? viewServings / contentBaseServings
                        : 1
                    return (
                      <div key={`sub-ing-${block.recipe_id}-${bi}`} className="mt-3">
                        <button
                          type="button"
                          onClick={() => onOpenRecipe(block.recipe_id)}
                          className="mb-1.5 flex w-full items-center border-0 bg-transparent px-0 py-1 text-left"
                        >
                          <span className="font-editorial text-[15px] font-semibold text-[#1A0D40]">
                            {child?.title || 'Subrecipe'}
                          </span>
                        </button>
                        {childIngs.map((ing, ci) => {
                          const swapId = childSwapKey(block.recipe_id, ci)
                          const amount =
                            ratio !== 1 && ing.amount
                              ? scaleAmount(ing.amount, childBase || 1, (childBase || 1) * ratio)
                              : ing.amount
                          let displayAmount = amount
                          let displayUnit = ing.unit
                          if (amount && ing.unit) {
                            const converted = convertToUnitSystem(amount, ing.unit, unitSystem)
                            displayAmount = converted.amount
                            displayUnit = converted.unit
                          }
                          const displayName = viewSwaps[swapId] ?? ing.name
                          const coverage = evaluateStashCoverage(
                            { name: displayName, amount: displayAmount, unit: displayUnit },
                            stash.items,
                          )
                          const displayIng = {
                            ...ing,
                            amount: displayAmount ?? '',
                            unit: displayUnit ?? '',
                          }
                          const marks = addedByKey[swapId] ?? []
                          const addedLabel =
                            marks.length === 1
                              ? listNameById.get(marks[0].listId) ?? null
                              : marks.length > 1
                                ? `${marks.length} lists`
                                : null
                          return (
                            <SwipeIngredientRow
                              key={swapId}
                              name={displayName}
                              amount={displayAmount}
                              unit={displayUnit}
                              coverageLevel={coverage.level}
                              coverageMessage={coverage.message}
                              inStash={coverage.level !== 'none'}
                              added={marks.length > 0}
                              addedListLabel={addedLabel}
                              notes={ing.notes}
                              alternatives={ing.alternatives}
                              showSwapAffordance={!!stashSwapAffordances[swapId] || (ing.alternatives?.length ?? 0) > 0}
                              onOpenSwap={() => setSwapKey(swapId)}
                              onLongPress={() => setSwapKey(swapId)}
                              onAddToGroceryList={() =>
                                void handleAddChildToGrocery(
                                  block.recipe_id,
                                  child?.title || 'Subrecipe',
                                  displayIng,
                                  ci,
                                )
                              }
                              onUncheck={() => void handleUncheckIngredient(swapId)}
                            />
                          )
                        })}
                      </div>
                    )
                  }
                  const i = flatIndex
                  flatIndex += 1
                  const swapId = parentSwapKey(i)
                  const ing = displayIngredients[i] ?? block
                  const displayName = viewSwaps[swapId] ?? ing.name
                  const coverage = evaluateStashCoverage(
                    { name: displayName, amount: ing.amount, unit: ing.unit },
                    stash.items,
                  )
                  const marks = addedByKey[swapId] ?? []
                  const addedLabel =
                    marks.length === 1
                      ? listNameById.get(marks[0].listId) ?? null
                      : marks.length > 1
                        ? `${marks.length} lists`
                        : null
                  return (
                    <SwipeIngredientRow
                      key={`ing-${i}`}
                      name={displayName}
                      amount={ing.amount}
                      unit={ing.unit}
                      coverageLevel={coverage.level}
                      coverageMessage={coverage.message}
                      inStash={coverage.level !== 'none'}
                      added={marks.length > 0}
                      addedListLabel={addedLabel}
                      notes={ing.notes}
                      alternatives={(ing as Ingredient).alternatives}
                      showSwapAffordance={
                        !!stashSwapAffordances[swapId] || ((ing as Ingredient).alternatives?.length ?? 0) > 0
                      }
                      onOpenSwap={() => setSwapKey(swapId)}
                      onLongPress={() => setSwapKey(swapId)}
                      onAddToGroceryList={() => void handleAddToGrocery(ing, i)}
                      onUncheck={() => void handleUncheckIngredient(swapId)}
                    />
                  )
                })
              })()}
            </div>
          </div>
        ) : null}

        {methodBlocks.length > 0 ? (
          <div className="px-[22px] pt-6">
            <h2 className="mb-3.5 font-editorial text-[20px] font-semibold text-[#1A0D40]">Method</h2>
            <div className="flex flex-col gap-[18px]">
              {(() => {
                let stepNumber = 0
                return methodBlocks.map((block, bi) => {
                  if (block.type === 'subrecipe') {
                    const child = childById.get(block.recipe_id)
                    const childIngs = flatIngredientsFromJson(child?.cleaned_json)
                    const childSteps = autoLinkIngredientsInSteps(
                      childIngs,
                      flatStepsFromJson(child?.cleaned_json),
                    )
                    return (
                      <div key={`sub-step-${block.recipe_id}-${bi}`} className="mt-1">
                        <button
                          type="button"
                          onClick={() => onOpenRecipe(block.recipe_id)}
                          className="mb-2 flex w-full items-center border-0 bg-transparent px-0 py-1 text-left"
                        >
                          <span className="font-editorial text-[15px] font-semibold text-[#1A0D40]">
                            {child?.title || 'Subrecipe'}
                          </span>
                        </button>
                        <div className="flex flex-col gap-[14px]">
                          {childSteps.map((step, si) => {
                            const parsed = parseStep(step)
                            if (parsed.kind === 'heading') {
                              return (
                                <h3 key={si} className="font-editorial text-[14px] font-semibold text-[#1A0D40]">
                                  {parsed.text}
                                </h3>
                              )
                            }
                            if (parsed.kind === 'image') {
                              return <img key={si} src={parsed.url} alt="" className="w-full rounded-[14px] object-cover" />
                            }
                            return (
                              <div key={si} className="flex gap-3">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4C6A57] font-editorial text-[12px] font-semibold text-white">
                                  {si + 1}
                                </span>
                                <p className="mt-0.5 font-ui text-[14.5px] leading-[1.55] text-[#332e3d]">
                                  <StepContent
                                    text={step}
                                    ingredients={flatIngredientsFromJson(child?.cleaned_json)}
                                    scaleRatio={viewScaleRatio}
                                    swappedNames={{}}
                                    baseServings={child?.cleaned_json?.servings ?? undefined}
                                    targetServings={viewServings || undefined}
                                  />
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                  const step = linkedStepByBlock[bi] ?? block.text
                  const parsed = parseStep(step)
                  if (parsed.kind === 'heading') {
                    return (
                      <h3 key={bi} className="font-editorial text-[15px] font-semibold text-[#1A0D40]">
                        {parsed.text}
                      </h3>
                    )
                  }
                  if (parsed.kind === 'image') {
                    return <img key={bi} src={parsed.url} alt="" className="w-full rounded-[14px] object-cover" />
                  }
                  stepNumber += 1
                  return (
                    <div key={bi} className="flex gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A0D40] font-editorial text-[14px] font-semibold text-white">
                        {stepNumber}
                      </span>
                      <p className="mt-0.5 font-ui text-[15px] leading-[1.55] text-[#332e3d]">
                        <StepContent
                          text={step}
                          ingredients={ingredients}
                          scaleRatio={viewScaleRatio}
                          swappedNames={viewSwaps}
                          baseServings={contentBaseServings ?? undefined}
                          targetServings={viewServings || undefined}
                        />
                      </p>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        ) : null}

        <RecipeNutritionSummary
          ingredients={displayIngredients}
          servings={viewServings}
          baseServings={contentBaseServings ?? effectiveBase}
          statedNutrition={recipe?.cleaned_json?.nutrition}
        />

        {recipeAttributes.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-1.5 px-[22px] pb-0.5">
            {(attributesExpanded ? recipeAttributes : recipeAttributes.slice(0, 3)).map((attr) => {
              const Icon = attributeIcon(attr)
              const color = attributeColor(attr)
              return (
                <span
                  key={attr}
                  className="flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 font-ui text-[11px] font-semibold capitalize"
                  style={{ borderColor: `${color}33`, background: `${color}14`, color }}
                >
                  <Icon size={11} strokeWidth={2.3} aria-hidden />#{attr}
                </span>
              )
            })}
            {!attributesExpanded && recipeAttributes.length > 3 ? (
              <button
                type="button"
                onClick={() => setAttributesExpanded(true)}
                className="flex shrink-0 items-center rounded-full border border-[#ECE9E3] bg-[#FAFAFA] px-2.5 py-1 font-ui text-[11px] font-semibold text-[#6E6E73]"
              >
                +{recipeAttributes.length - 3}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="h-8" />
      </main>

      {swapKey != null
        ? (() => {
            let originalName = ''
            let activeName = ''
            let amount: string | undefined
            let unit: string | undefined
            let authorNotes: string | null = null
            let preferredSwaps: string[] = []
            let parentFlatIndex: number | null = null
            let displayIng: Ingredient | null = null
            let physicalEquivalent: string | null = null

            if (swapKey.startsWith('p:')) {
              const i = Number(swapKey.slice(2))
              const ing = ingredients[i]
              if (!ing) return null
              originalName = ing.name
              activeName = swappedNames[swapKey] ?? originalName
              amount = displayIngredients[i]?.amount
              unit = displayIngredients[i]?.unit
              authorNotes = ing.notes ?? null
              preferredSwaps = ing.alternatives ?? []
              parentFlatIndex = i
              displayIng = displayIngredients[i] ?? ing
              physicalEquivalent = ing.physical_equivalent ?? null
            } else if (swapKey.startsWith('c:')) {
              const lastColon = swapKey.lastIndexOf(':')
              const childId = swapKey.slice(2, lastColon)
              const ci = Number(swapKey.slice(lastColon + 1))
              const child = childById.get(childId)
              const childIngs = flatIngredientsFromJson(child?.cleaned_json)
              const ing = childIngs[ci]
              if (!ing) return null
              originalName = ing.name
              activeName = swappedNames[swapKey] ?? originalName
              amount = ing.amount
              unit = ing.unit
              authorNotes = ing.notes ?? null
              preferredSwaps = ing.alternatives ?? []
              displayIng = ing
              physicalEquivalent = ing.physical_equivalent ?? null
            } else {
              return null
            }

            const history = swapHistory[swapKey]?.length ? swapHistory[swapKey] : [originalName]
            const stashItem = stashItemForIngredient(displayIng, activeName)

            const applySwap = (name: string) => {
              setSwappedNames((prev) => {
                const next = { ...prev, [swapKey]: name }
                setViewMode('customized')
                schedulePersist({
                  servings,
                  ingredient_swaps: swapsToRecord(next),
                  unit_system: unitSystem,
                })
                return next
              })
              if (parentFlatIndex != null) {
                void rewriteIngredientTokensInSteps(steps, {
                  index: parentFlatIndex,
                  oldName: originalName,
                  newName: name,
                })
                const qty = Number(displayIng?.amount)
                void groceries.syncItemsFromIngredientSwap(recipeId, parentFlatIndex, {
                  name,
                  qty: Number.isFinite(qty) && qty > 0 ? qty : undefined,
                  unit: displayIng?.unit || undefined,
                })
              }
            }

            return (
              <IngredientSwapSheet
                ingredientName={activeName}
                history={history}
                amount={amount}
                unit={unit}
                authorNotes={authorNotes}
                preferredSwaps={preferredSwaps}
                physicalEquivalent={physicalEquivalent}
                userId={userId}
                stashItemNames={stashItemNames}
                recipeId={recipeId}
                inStash={stashItem != null}
                onClose={() => setSwapKey(null)}
                onSwap={(newName) => {
                  setSwapHistory((prev) => {
                    const existing = prev[swapKey]?.length ? prev[swapKey] : [originalName]
                    return existing.includes(newName) ? prev : { ...prev, [swapKey]: [...existing, newName] }
                  })
                  applySwap(newName)
                }}
                onSelectHistory={(name) => applySwap(name)}
              />
            )
          })()
        : null}

      {servingsPopupOpen ? (
        <CenteredPopup title="Servings" onClose={() => setServingsPopupOpen(false)}>
          <div className="flex flex-col gap-3">
            <label className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-[#E8E8ED] bg-white px-3.5 font-ui text-[16px] font-semibold text-[#1A0D40]">
              <span>For</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                autoFocus
                value={servingsDraft}
                onChange={(e) => setServingsDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitServingsDraft()
                }}
                className="w-12 bg-transparent text-center outline-none"
              />
            </label>
            <button
              type="button"
              onClick={commitServingsDraft}
              className="h-11 w-full rounded-lg border-0 bg-[#1A0D40] font-ui text-[14px] font-semibold text-white transition hover:opacity-95"
            >
              Set
            </button>
          </div>
        </CenteredPopup>
      ) : null}

      {timeBreakdownOpen ? (
        <CenteredPopup title="Cooking time" onClose={() => setTimeBreakdownOpen(false)}>
          <div className="flex flex-col gap-2.5 font-ui text-[14px] text-[#1A0D40]">
            {hasSplitTimes ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[#6E6E73]">Prep</span>
                  <span className="font-semibold tabular-nums">
                    {scaledTimes?.prepMins ?? basePrepMins} min
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6E6E73]">Cook</span>
                  <span className="font-semibold tabular-nums">
                    {scaledTimes?.cookMins ?? baseCookMins} min
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6E6E73]">Idle</span>
                  <span className="font-semibold tabular-nums">
                    {scaledTimes?.inactiveMins ?? baseInactiveMins} min
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-[#ECE9E3] pt-2.5">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold tabular-nums">{timeLabel}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold tabular-nums">{timeLabel}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setTimeBreakdownOpen(false)}
              className="mt-2 h-11 w-full rounded-lg border-0 bg-[#1A0D40] font-ui text-[14px] font-semibold text-white"
            >
              Done
            </button>
          </div>
        </CenteredPopup>
      ) : null}

      {pendingGrocery && !creatingListForPending ? (
        <CenteredPopup title="Add to groceries" onClose={() => setPendingGrocery(null)}>
          <div className="flex flex-col gap-1.5">
            {pendingGrocery.kind === 'all' ? (
              <div className="mb-1 flex rounded-full border border-[#ECE9E3] bg-[#FAFAFA] p-0.5">
                <button
                  type="button"
                  onClick={() => setGroceryMissingOnly(true)}
                  className={`flex-1 rounded-full border-0 py-1.5 font-ui text-[12px] font-semibold transition ${
                    groceryMissingOnly ? 'bg-[#1A0D40] text-white' : 'bg-transparent text-[#6E6E73]'
                  }`}
                >
                  Missing Only
                </button>
                <button
                  type="button"
                  onClick={() => setGroceryMissingOnly(false)}
                  className={`flex-1 rounded-full border-0 py-1.5 font-ui text-[12px] font-semibold transition ${
                    !groceryMissingOnly ? 'bg-[#1A0D40] text-white' : 'bg-transparent text-[#6E6E73]'
                  }`}
                >
                  All Ingredients
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void linkRecipeListAndAdd()}
              className="flex items-center gap-2.5 rounded-xl border border-dashed border-[#1A0D40]/35 bg-[#F4F1F9] px-3.5 py-3 text-left font-ui text-[14px] font-semibold text-[#1A0D40] transition hover:bg-[#EDE8F5]"
            >
              <Plus size={16} strokeWidth={2.2} />
              Link recipe
            </button>
            <button
              type="button"
              onClick={() => setCreatingListForPending(true)}
              className="flex items-center gap-2.5 rounded-xl border border-dashed border-[#D4D0DD] bg-[#FAFAFA] px-3.5 py-3 text-left font-ui text-[14px] font-semibold text-[#1A0D40] transition hover:bg-[#F5F5F7]"
            >
              <Plus size={16} strokeWidth={2.2} />
              New list
            </button>
            {eligibleGroceryLists.map((list) => {
              const Icon = groceryIconFor(list.icon_key)
              const isCurrent = pendingGrocery.kind === 'all' && list.id === addedAllListId
              const singleBlocked =
                pendingGrocery.kind === 'single' &&
                list.linked_recipe_id === recipeId &&
                alreadyOnList(list.id, pendingGrocery.target.swapKey)
              return (
                <div
                  key={list.id}
                  className={`flex items-center gap-2.5 rounded-xl border border-[#ECE9E3] bg-white pr-3.5 transition ${
                    singleBlocked ? 'opacity-45' : 'hover:bg-[#FAF9FC]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingList(list)
                    }}
                    aria-label={`Edit ${list.name}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-l-xl border-0"
                    style={{ background: list.icon_color ?? '#F4F1F9' }}
                  >
                    <Icon size={16} strokeWidth={1.8} className="text-[#1A0D40]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (singleBlocked && pendingGrocery.kind === 'single') {
                        void removeIngredientFromList(list.id, pendingGrocery.target.swapKey)
                      } else if (isCurrent) {
                        void removeAllIngredientsFromList(list.id)
                      } else {
                        void pickGroceryList(list.id)
                      }
                    }}
                    className="flex flex-1 items-center justify-between border-0 bg-transparent py-3 text-left font-ui text-[14px] font-semibold text-[#1A0D40]"
                  >
                    <span className="min-w-0 truncate">
                      {list.name}
                      {list.linked_recipe_id === recipeId ? (
                        <span className="ml-1 font-ui text-[11px] font-medium text-[#9a9aa0]">Linked</span>
                      ) : null}
                    </span>
                    {isCurrent || singleBlocked ? (
                      <Check size={16} strokeWidth={2.6} className="shrink-0 text-[#4C6A57]" />
                    ) : null}
                  </button>
                </div>
              )
            })}
          </div>
        </CenteredPopup>
      ) : null}

      {creatingListForPending && pendingGrocery ? (
        <GroceryListEditSheet
          list={draftCreateList}
          createMode
          onClose={() => setCreatingListForPending(false)}
          onRename={() => undefined}
          onChangeAppearance={() => undefined}
          onCreate={async (input) => {
            const listId = await groceries.createList(input.name, {
              recurring: input.recurring,
              iconKey: input.iconKey,
              iconColor: input.iconColor,
            })
            setCreatingListForPending(false)
            if (listId) await pickGroceryList(listId)
          }}
        />
      ) : null}

      {editingList ? (
        <GroceryListEditSheet
          list={editingList}
          onClose={() => setEditingList(null)}
          onRename={(name) => groceries.renameList(editingList.id, name)}
          onChangeAppearance={(patch) => groceries.updateListAppearance(editingList.id, patch)}
        />
      ) : null}

      {menuAnchor ? (
        <AnchoredPopup anchor={menuAnchor} onClose={() => setMenuAnchor(null)} ariaLabel="Recipe options" widthPx={168}>
          <div className="flex flex-col p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuAnchor(null)
                if (recipe) {
                  const override = !isCanonicalEditable(recipe) ? customization?.cleaned_json_override : null
                  onEdit({
                    ...recipe,
                    cleaned_json: override ?? recipe.cleaned_json,
                  })
                }
              }}
              className="rounded-xl border-0 bg-transparent px-3 py-2.5 text-left font-ui text-[14px] font-semibold text-[#1A0D40] transition hover:bg-[#1A0D40]/[0.05]"
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuAnchor(null)
                setConfirmDelete(true)
              }}
              className="rounded-xl border-0 bg-transparent px-3 py-2.5 text-left font-ui text-[14px] font-semibold text-[#c0503a] transition hover:bg-[#c0503a]/[0.06]"
            >
              Delete
            </button>
          </div>
        </AnchoredPopup>
      ) : null}

      {confirmDelete ? (
        <CenteredPopup title="Remove recipe?" subtitle="Removes it from your shelf. Data stays in the system." onClose={() => setConfirmDelete(false)} widthClassName="max-w-xs">
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={deleting}
              onClick={() => void (async () => {
                setDeleting(true)
                try {
                  await deleteRecipe(recipeId, userId)
                  onDeleted()
                } catch {
                  setDeleting(false)
                }
              })()}
              className="flex h-11 w-full items-center justify-center rounded-xl border-0 bg-[#c0503a] font-ui text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {deleting ? 'Removing…' : 'Remove from shelf'}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className="flex h-11 w-full items-center justify-center rounded-xl border-0 bg-[#F5F5F7] font-ui text-[14px] font-semibold text-[#1A0D40]"
            >
              Cancel
            </button>
          </div>
        </CenteredPopup>
      ) : null}
    </div>
  )
}
