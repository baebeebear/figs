import { useEffect, useRef, useState } from 'react'
import { Camera, Clock, ExternalLink, Image as ImageIcon, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { supabase } from '../services/supabase'
import { insertRecipe, recipeCreatorLabel, updateRecipe, type RecipeShelfOrigin } from '../lib/recipes'
import { upsertCustomization } from '../lib/recipeCustomizations'
import { uploadRecipeImage } from '../lib/recipeImageStorage'
import { pickPhotoNativeOrFallback } from '../lib/nativeCamera'
import { generateAndUploadRecipeHeroImage } from '../lib/recipeImageGeneration'
import { generateRecipeFromPrompt } from '../lib/gemini'
import { estimateRecipeTimes } from '../lib/recipeTimeEstimate'
import { dedupeIngredients, parseIngredientLine } from '../utils/recipeMath'
import { titleCaseGroceryName } from '../lib/parseGroceryLine'
import { inferIngredientToken } from '../lib/ingredientTokens'
import { warmIngredientSwaps } from '../lib/ingredientSwaps'
import { makeImageStep, makeIngredientToken, rewriteIngredientTokensInSteps, sanitizeStepText, stepPlainText } from '../lib/stepFormatting'
import { useDragReorder } from '../hooks/useDragReorder'
import AutoGrowTextarea from '../components/AutoGrowTextarea'
import IngredientEditRow, { type EditorIngredient } from '../components/editor/IngredientEditRow'
import MethodStepEditor, { type EditorStep } from '../components/editor/MethodStepEditor'
import SubrecipeBlockCard from '../components/editor/SubrecipeBlockCard'
import MethodToolbar from '../components/editor/MethodToolbar'
import CenteredPopup from '../components/CenteredPopup'
import RecipePickerSheet from '../components/RecipePickerSheet'
import type { StashItem } from '../lib/stash'
import {
  childIdsFromBlocks,
  flatIngredientsFromJson,
  loadRecipesByIds,
  recipeRowToChild,
  syncParentChildren,
  withMirroredBlocks,
  type ChildRecipeSummary,
} from '../lib/recipeRelationships'
import type { RecipeCleanedJson } from '../lib/recipes'

export type IngredientSectionItem =
  | ({ kind: 'ingredient' } & EditorIngredient)
  | { kind: 'subrecipe'; id: string; recipe_id: string; collapsed: boolean }

export type MethodSectionItem =
  | ({ kind: 'step' } & EditorStep)
  | { kind: 'subrecipe'; id: string; recipe_id: string; collapsed: boolean }

export type RecipeEditorInitialDraft = {
  title?: string
  description?: string | null
  author_name?: string | null
  source_image_url?: string | null
  source_url?: string | null
  ingredients?: { name: string; amount: string; unit: string; notes?: string | null }[]
  steps?: string[]
  ingredient_blocks?: import('../lib/recipes').IngredientBlock[]
  step_blocks?: import('../lib/recipes').StepBlock[]
  servings?: number | null
  total_cook_minutes?: number | null
  prep_time_mins?: number | null
  cook_time_mins?: number | null
  inactive_time_mins?: number | null
  tags?: string[]
  nutrition?: {
    calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fat_g?: number | null
    fiber_g?: number | null
    sodium_mg?: number | null
    sugar_g?: number | null
  } | null
  is_ai_generated_hero?: boolean
  /** Shared with App when Imagen uploads before editor open — keeps storage path stable. */
  recipeId?: string
  /** When set, Save updates this existing recipe instead of inserting a new one. */
  existingId?: string
  shelf_origin?: RecipeShelfOrigin
  /** canonical = mutate recipes row; override = per-user customization only */
  editTarget?: 'canonical' | 'override'
}

type Props = {
  userId: string
  /** Logged-in username — stamped as author_name for hand-created recipes. */
  username?: string | null
  initialDraft?: RecipeEditorInitialDraft
  onClose: (createdRecipeId: string | null) => void
  /** Active stash inventory for the AI “choose ingredients” checklist. */
  stashItems?: StashItem[]
  /** Shelf recipes for Add Subrecipe picker. */
  recipes?: import('../lib/recipes').RecipeRow[]
  /** Open a nested create-recipe editor above the subrecipe picker. */
  onRequestCreateFromPicker?: () => void
  /** Open nested editor to edit an existing embedded subrecipe. */
  onRequestEditSubrecipe?: (recipeId: string) => void
  /** Bumped when a nested child editor saves so parent reloads child summaries/drafts. */
  nestedChildRefreshKey?: number
  /** Newly created recipe to embed after returning from nested create. */
  preferSelectRecipeId?: string | null
  onConsumedPreferSelect?: () => void
}

function formatStashPickLine(item: StashItem): string {
  const qty = item.quantity > 0 ? String(item.quantity) : ''
  const unit = (item.unit || '').trim()
  const name = item.name.trim()
  if (qty && unit) return `${qty} ${unit} ${name}`
  if (qty) return `${qty} ${name}`
  if (unit) return `${unit} of ${name}`
  return name
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function initIngredientItems(draft?: RecipeEditorInitialDraft): IngredientSectionItem[] {
  const blocks = draft?.ingredient_blocks
  if (blocks && blocks.length > 0) {
    return blocks.map((b) => {
      if (b.type === 'subrecipe') {
        return { kind: 'subrecipe' as const, id: genId(), recipe_id: b.recipe_id, collapsed: true }
      }
      return {
        kind: 'ingredient' as const,
        id: genId(),
        name: b.name,
        amount: b.amount?.trim() ? b.amount : '',
        unit: b.unit,
        notes: b.notes ?? null,
      }
    })
  }
  return (draft?.ingredients ?? []).map((i) => ({
    kind: 'ingredient' as const,
    id: genId(),
    name: i.name,
    amount: i.amount?.trim() ? i.amount : '',
    unit: i.unit,
    notes: i.notes ?? null,
  }))
}

function initMethodItems(draft?: RecipeEditorInitialDraft): MethodSectionItem[] {
  const blocks = draft?.step_blocks
  if (blocks && blocks.length > 0) {
    return blocks.map((b) => {
      if (b.type === 'subrecipe') {
        return { kind: 'subrecipe' as const, id: genId(), recipe_id: b.recipe_id, collapsed: true }
      }
      return { kind: 'step' as const, id: genId(), raw: b.text }
    })
  }
  return (draft?.steps ?? []).map((raw) => ({ kind: 'step' as const, id: genId(), raw }))
}

const FRACTION_STEPS = ['1/32', '1/16', '1/8', '1/4', '1/2', '1']

function stepServingsDown(val: string): string {
  const trimmed = val.trim()
  const idx = FRACTION_STEPS.indexOf(trimmed)
  if (idx > 0) return FRACTION_STEPS[idx - 1]
  if (idx === 0) return FRACTION_STEPS[0]
  const num = parseFloat(trimmed)
  if (!isNaN(num)) {
    if (num <= 1 / 16) return '1/32'
    if (num <= 1 / 8) return '1/16'
    if (num <= 1 / 4) return '1/8'
    if (num <= 1 / 2) return '1/4'
    if (num <= 1) return '1/2'
    return String(Math.max(1, Math.floor(num - 1)))
  }
  return '1/2'
}

function stepServingsUp(val: string): string {
  const trimmed = val.trim()
  const idx = FRACTION_STEPS.indexOf(trimmed)
  if (idx !== -1 && idx < FRACTION_STEPS.length - 1) return FRACTION_STEPS[idx + 1]
  const num = parseFloat(trimmed)
  if (!isNaN(num)) {
    if (num < 1) return '1'
    return String(Math.floor(num + 1))
  }
  return '2'
}

export default function RecipeEditor({
  userId,
  username,
  initialDraft,
  onClose,
  stashItems = [],
  recipes = [],
  onRequestCreateFromPicker,
  onRequestEditSubrecipe,
  nestedChildRefreshKey = 0,
  preferSelectRecipeId,
  onConsumedPreferSelect,
}: Props) {
  const isEditing = Boolean(initialDraft?.existingId)
  const editTarget = initialDraft?.editTarget ?? 'canonical'
  const shelfOrigin = initialDraft?.shelf_origin ?? 'created'
  const [recipeId] = useState(() => initialDraft?.existingId ?? initialDraft?.recipeId ?? crypto.randomUUID())

  const [title, setTitle] = useState(initialDraft?.title ?? '')
  const [description, setDescription] = useState(initialDraft?.description ?? '')
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(initialDraft?.source_image_url ?? null)
  const [heroUploading, setHeroUploading] = useState(false)
  const [heroIsAiGenerated, setHeroIsAiGenerated] = useState(Boolean(initialDraft?.is_ai_generated_hero))
  const [servings, setServings] = useState(initialDraft?.servings ? String(initialDraft.servings) : '4')

  // Keep hero in sync if parent updates initialDraft after mount (or remount key misses).
  useEffect(() => {
    if (initialDraft?.source_image_url) {
      setHeroImageUrl(initialDraft.source_image_url)
      setHeroIsAiGenerated(Boolean(initialDraft.is_ai_generated_hero))
    }
  }, [initialDraft?.source_image_url, initialDraft?.is_ai_generated_hero])

  const [prepMins, setPrepMins] = useState(initialDraft?.prep_time_mins ? String(initialDraft.prep_time_mins) : '')
  const [cookMins, setCookMins] = useState(initialDraft?.cook_time_mins ? String(initialDraft.cook_time_mins) : '')
  const [inactiveMins, setInactiveMins] = useState(initialDraft?.inactive_time_mins ? String(initialDraft.inactive_time_mins) : '')

  const n0 = initialDraft?.nutrition
  const [calories, setCalories] = useState(n0?.calories != null ? String(n0.calories) : '')
  const [proteinG, setProteinG] = useState(n0?.protein_g != null ? String(n0.protein_g) : '')
  const [carbsG, setCarbsG] = useState(n0?.carbs_g != null ? String(n0.carbs_g) : '')
  const [fatG, setFatG] = useState(n0?.fat_g != null ? String(n0.fat_g) : '')
  const [fiberG, setFiberG] = useState(n0?.fiber_g != null ? String(n0.fiber_g) : '')
  const [sodiumMg, setSodiumMg] = useState(n0?.sodium_mg != null ? String(n0.sodium_mg) : '')
  const [sugarG, setSugarG] = useState(n0?.sugar_g != null ? String(n0.sugar_g) : '')

  const [selectedTags, setSelectedTags] = useState<string[]>(initialDraft?.tags ?? [])
  const [customTagInput, setCustomTagInput] = useState('')

  const [timePopupOpen, setTimePopupOpen] = useState(false)
  const [nutritionPopupOpen, setNutritionPopupOpen] = useState(false)

  const sourceUrlRef = useRef(initialDraft?.source_url ?? null)
  const [authorName] = useState<string | null>(() => {
    if (initialDraft?.author_name?.trim()) return initialDraft.author_name.trim()
    if (shelfOrigin === 'created' && username?.trim()) return username.trim()
    return null
  })
  const authorNameRef = useRef(authorName)
  authorNameRef.current = authorName
  const heroGenPromiseRef = useRef<Promise<string | null> | null>(null)

  const [ingredientItems, setIngredientItems] = useState<IngredientSectionItem[]>(() => initIngredientItems(initialDraft))
  const [methodItems, setMethodItems] = useState<MethodSectionItem[]>(() => initMethodItems(initialDraft))
  const [subrecipePickerFor, setSubrecipePickerFor] = useState<null | 'ingredients' | 'method'>(null)
  /** Editable ingredient drafts keyed by child recipe id. */
  const [childIngredientDrafts, setChildIngredientDrafts] = useState<Record<string, EditorIngredient[]>>({})
  const [dirtyChildIds, setDirtyChildIds] = useState<Record<string, true>>({})
  /** Children missing from the shelf `recipes` prop (e.g. unsaved components). */
  const [extraChildren, setExtraChildren] = useState<Record<string, ChildRecipeSummary>>({})

  useEffect(() => {
    const ids = [
      ...ingredientItems.filter((i): i is Extract<IngredientSectionItem, { kind: 'subrecipe' }> => i.kind === 'subrecipe').map((i) => i.recipe_id),
      ...methodItems.filter((i): i is Extract<MethodSectionItem, { kind: 'subrecipe' }> => i.kind === 'subrecipe').map((i) => i.recipe_id),
    ]
    const missing = [...new Set(ids)].filter((id) => !recipes.some((r) => r.id === id) && !extraChildren[id])
    if (!missing.length) return
    let alive = true
    void loadRecipesByIds(missing).then((map) => {
      if (!alive) return
      setExtraChildren((prev) => {
        const next = { ...prev }
        let changed = false
        for (const id of missing) {
          const c = map.get(id)
          if (c && !next[id]) {
            next[id] = c
            changed = true
          }
        }
        return changed ? next : prev
      })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredientItems, methodItems, recipes])

  useEffect(() => {
    if (!nestedChildRefreshKey) return
    setExtraChildren({})
    setChildIngredientDrafts({})
    setDirtyChildIds({})
  }, [nestedChildRefreshKey])

  const resolveChildRow = (recipeId: string) => {
    const shelf = recipes.find((r) => r.id === recipeId)
    if (shelf) return shelf
    return extraChildren[recipeId] ?? null
  }

  const ensureChildIngredientDraft = (recipeId: string) => {
    setChildIngredientDrafts((prev) => {
      if (prev[recipeId]) return prev
      const row = resolveChildRow(recipeId)
      const ings = flatIngredientsFromJson(row?.cleaned_json ?? null)
      return {
        ...prev,
        [recipeId]: ings.map((ing) => ({
          id: genId(),
          name: ing.name ?? '',
          amount: ing.amount?.trim() ? ing.amount : '',
          unit: ing.unit ?? '',
          notes: ing.notes ?? null,
        })),
      }
    })
  }

  const childSummaryFor = (recipeId: string) => {
    const row = resolveChildRow(recipeId)
    if (!row) return null
    const draft = childIngredientDrafts[recipeId]
    if (!draft) {
      return 'title' in row && 'cleaned_json' in row
        ? recipeRowToChild({
            id: row.id,
            title: row.title,
            source_image_url: row.source_image_url,
            cleaned_json: row.cleaned_json,
          })
        : null
    }
    const ingredients = draft
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        amount: i.amount || '',
        unit: i.unit || '',
        canonical_key: '',
        notes: i.notes,
      }))
    const base = (row.cleaned_json ?? {}) as RecipeCleanedJson
    return recipeRowToChild({
      id: row.id,
      title: row.title,
      source_image_url: row.source_image_url,
      cleaned_json: withMirroredBlocks({
        ...base,
        ingredients,
        ingredient_blocks: ingredients.map((ing) => ({ type: 'ingredient' as const, ...ing })),
        steps: base.steps ?? [],
        step_blocks: base.step_blocks,
      }),
    })
  }

  const ingredients: EditorIngredient[] = ingredientItems
    .filter((i): i is Extract<IngredientSectionItem, { kind: 'ingredient' }> => i.kind === 'ingredient')
    .map(({ kind: _k, ...ing }) => ing)
  const steps: EditorStep[] = methodItems
    .filter((i): i is Extract<MethodSectionItem, { kind: 'step' }> => i.kind === 'step')
    .map(({ kind: _k, ...s }) => s)

  const hasIngredients = ingredients.some((i) => i.name.trim())

  const addSubrecipeToBoth = (recipeIdToAdd: string) => {
    setIngredientItems((prev) =>
      prev.some((p) => p.kind === 'subrecipe' && p.recipe_id === recipeIdToAdd)
        ? prev
        : [...prev, { kind: 'subrecipe', id: genId(), recipe_id: recipeIdToAdd, collapsed: true }],
    )
    setMethodItems((prev) =>
      prev.some((p) => p.kind === 'subrecipe' && p.recipe_id === recipeIdToAdd)
        ? prev
        : [...prev, { kind: 'subrecipe', id: genId(), recipe_id: recipeIdToAdd, collapsed: true }],
    )
  }

  const removeSubrecipeFromBoth = (recipeIdToRemove: string) => {
    setIngredientItems((prev) =>
      prev.filter((p) => !(p.kind === 'subrecipe' && p.recipe_id === recipeIdToRemove)),
    )
    setMethodItems((prev) =>
      prev.filter((p) => !(p.kind === 'subrecipe' && p.recipe_id === recipeIdToRemove)),
    )
  }

  useEffect(() => {
    if (!preferSelectRecipeId || !subrecipePickerFor) return
    addSubrecipeToBoth(preferSelectRecipeId)
    setSubrecipePickerFor(null)
    onConsumedPreferSelect?.()
  }, [preferSelectRecipeId, subrecipePickerFor, onConsumedPreferSelect])

  const autoEstimateTimes = () => {
    const finalIngredients = ingredients.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), amount: i.amount, unit: i.unit }))
    const finalSteps = steps.map((s) => s.raw).filter((s) => s.trim())
    const est = estimateRecipeTimes({ ingredients: finalIngredients, steps: finalSteps })
    setPrepMins(String(est.prepMins))
    setCookMins(String(est.cookMins))
    setInactiveMins(String(est.inactiveMins))
  }

  const autoEstimateNutrition = () => {
    // Quick auto estimate for nutrition
    setCalories('380')
    setProteinG('24')
    setCarbsG('42')
    setFatG('14')
  }

  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const [warnStepIds, setWarnStepIds] = useState<Set<string>>(new Set())
  const [ingredientPickerOpen, setIngredientPickerOpen] = useState(false)
  const [linkPromptOpen, setLinkPromptOpen] = useState(false)
  const [linkUrlDraft, setLinkUrlDraft] = useState('')
  const [aiPromptOpen, setAiPromptOpen] = useState(false)
  const [aiPromptText, setAiPromptText] = useState('')
  const [aiStashPicks, setAiStashPicks] = useState<Set<string>>(() => new Set())
  const [aiOnlyUseSelectedStash, setAiOnlyUseSelectedStash] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const heroFileInputRef = useRef<HTMLInputElement>(null)
  const stepImageInputRef = useRef<HTMLInputElement>(null)
  const stepTextareaRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const nameInputRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusIngredientId = useRef<string | null>(null)
  const pendingFocusStepId = useRef<string | null>(null)

  const ingredientDrag = useDragReorder(ingredientItems, setIngredientItems)
  const stepDrag = useDragReorder(methodItems, setMethodItems)

  useEffect(() => {
    if (pendingFocusIngredientId.current) {
      nameInputRefs.current.get(pendingFocusIngredientId.current)?.focus()
      pendingFocusIngredientId.current = null
    }
    if (pendingFocusStepId.current) {
      stepTextareaRefs.current.get(pendingFocusStepId.current)?.focus()
      pendingFocusStepId.current = null
    }
  })

  /** Nothing is written to the DB until this fires — a single insert, not an autosave. */
  const handleCreate = async () => {
    if (creating) return
    if (!title.trim()) {
      setCreateError('Give your recipe a name.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const ingredient_blocks: import('../lib/recipes').IngredientBlock[] = []
      for (const item of ingredientItems) {
        if (item.kind === 'subrecipe') {
          ingredient_blocks.push({ type: 'subrecipe', recipe_id: item.recipe_id })
          continue
        }
        if (!item.name.trim()) continue
        const final = parseIngredientLine('', {
          amount: item.amount,
          unit: item.unit,
          name: item.name.trim(),
          notes: item.notes,
        })
        const name = titleCaseGroceryName(final.name.trim())
        if (!name) continue
        ingredient_blocks.push({
          type: 'ingredient',
          name,
          amount: final.amount || '',
          unit: final.unit.trim(),
          canonical_key: inferIngredientToken(final.name),
          notes: final.notes,
        })
      }
      const step_blocks: import('../lib/recipes').StepBlock[] = []
      for (const item of methodItems) {
        if (item.kind === 'subrecipe') {
          step_blocks.push({ type: 'subrecipe', recipe_id: item.recipe_id })
          continue
        }
        const text = sanitizeStepText(item.raw)
        if (!text.trim()) continue
        step_blocks.push({ type: 'step', text })
      }

      const cleaned_json = withMirroredBlocks({
        description: description.trim() || null,
        ingredients: [],
        steps: [],
        ingredient_blocks,
        step_blocks,
        servings: servings ? Number(servings) || null : null,
        total_cook_minutes: null,
        prep_time_mins: null,
        cook_time_mins: null,
        inactive_time_mins: null,
        is_ai_generated_hero: false,
      })

      const finalIngredients = dedupeIngredients(cleaned_json.ingredients ?? [])
      const finalSteps = cleaned_json.steps ?? []

      let prep = Number(prepMins) || null
      let cook = Number(cookMins) || null
      let inactive = Number(inactiveMins) || null
      let total =
        prep != null || cook != null || inactive != null
          ? (prep ?? 0) + (cook ?? 0) + (inactive ?? 0)
          : null
      if (total == null && prep == null && cook == null && inactive == null) {
        const estimate = estimateRecipeTimes({ ingredients: finalIngredients, steps: finalSteps })
        prep = estimate.prepMins
        cook = estimate.cookMins
        inactive = estimate.inactiveMins
        total = prep + cook + inactive
      }

      let finalHeroImageUrl = heroImageUrl
      let isAiGeneratedHero = heroIsAiGenerated
      if (!finalHeroImageUrl && heroGenPromiseRef.current) {
        const generated = await heroGenPromiseRef.current
        if (generated) {
          finalHeroImageUrl = generated
          isAiGeneratedHero = true
        }
      }
      // Only auto-generate a hero when creating a new AI recipe — never block an edit save.
      const shouldGenerateHero =
        !finalHeroImageUrl &&
        !isEditing &&
        (shelfOrigin === 'ai' || authorNameRef.current === 'figs AI') &&
        Boolean(supabase)
      if (shouldGenerateHero && supabase) {
        const generated = await generateAndUploadRecipeHeroImage(supabase, userId, recipeId, {
          title: title.trim(),
          description: description.trim() || null,
          ingredients: finalIngredients.map((i) => i.name),
        })
        if (generated) {
          finalHeroImageUrl = generated
          isAiGeneratedHero = true
          setHeroImageUrl(generated)
          setHeroIsAiGenerated(true)
        }
      }

      const cleaned_json_final = withMirroredBlocks({
        ...cleaned_json,
        ingredients: finalIngredients,
        steps: finalSteps,
        ingredient_blocks,
        step_blocks,
        servings: servings ? Number(servings) || null : null,
        total_cook_minutes: total,
        prep_time_mins: prep,
        cook_time_mins: cook,
        inactive_time_mins: inactive,
        is_ai_generated_hero: isAiGeneratedHero,
      })

      if (isEditing && editTarget === 'override') {
        await upsertCustomization(userId, recipeId, { cleaned_json_override: cleaned_json_final })
        warmIngredientSwaps(finalIngredients.map((i) => i.name))
        onClose(recipeId)
        return
      }

      const payload = {
        title: title.trim(),
        source_image_url: finalHeroImageUrl,
        source_url: sourceUrlRef.current,
        author_name: authorNameRef.current,
        cleaned_json: cleaned_json_final,
        shelf_origin: shelfOrigin,
      }
      const savedId = isEditing
        ? (await updateRecipe(recipeId, userId, payload), recipeId)
        : await insertRecipe(recipeId, userId, payload)
      try {
        await syncParentChildren(savedId, childIdsFromBlocks(cleaned_json_final))
      } catch (relErr) {
        console.warn('[RecipeEditor] sync relationships', relErr)
      }
      // Persist edited subrecipe ingredient lists onto child recipe rows.
      for (const childId of Object.keys(dirtyChildIds)) {
        const draft = childIngredientDrafts[childId]
        const row = recipes.find((r) => r.id === childId)
        if (!draft || !row) continue
        const ingredients = draft
          .filter((i) => i.name.trim())
          .map((i) => {
            const final = parseIngredientLine('', {
              amount: i.amount,
              unit: i.unit,
              name: i.name.trim(),
              notes: i.notes,
            })
            return {
              name: titleCaseGroceryName(final.name.trim()),
              amount: final.amount || '',
              unit: final.unit.trim(),
              canonical_key: inferIngredientToken(final.name),
              notes: final.notes,
            }
          })
          .filter((i) => i.name)
        const base = (row.cleaned_json ?? {}) as RecipeCleanedJson
        await updateRecipe(childId, userId, {
          cleaned_json: withMirroredBlocks({
            ...base,
            ingredients,
            ingredient_blocks: ingredients.map((ing) => ({ type: 'ingredient' as const, ...ing })),
            steps: base.steps ?? [],
            step_blocks: base.step_blocks,
          }),
        })
      }
      warmIngredientSwaps(finalIngredients.map((i) => i.name))
      onClose(savedId)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : isEditing ? 'Could not save recipe.' : 'Could not create recipe.')
    } finally {
      setCreating(false)
    }
  }

  const handleClose = () => onClose(null)

  // ---- Hero image ----
  const handleHeroFile = async (file: File | undefined) => {
    if (!file || !supabase) return
    setHeroUploading(true)
    try {
      const url = await uploadRecipeImage(supabase, userId, recipeId, 'hero', file)
      if (url) {
        setHeroImageUrl(url)
        setHeroIsAiGenerated(false)
      }
    } finally {
      setHeroUploading(false)
    }
  }

  // ---- Ingredients ----
  const addIngredientRow = (focus = true) => {
    const id = genId()
    setIngredientItems((prev) => [...prev, { kind: 'ingredient', id, name: '', amount: '', unit: '', notes: null }])
    if (focus) pendingFocusIngredientId.current = id
  }
  const updateIngredient = (id: string, patch: Partial<EditorIngredient>) => {
    const oldIng = ingredients.find((i) => i.id === id)
    const oldName = oldIng?.name.trim()
    const ingIndex = ingredients.findIndex((i) => i.id === id)
    setIngredientItems((prev) =>
      prev.map((item) => (item.kind === 'ingredient' && item.id === id ? { ...item, ...patch } : item)),
    )
    if (patch.name !== undefined && oldName && ingIndex >= 0) {
      const newName = patch.name.trim()
      if (newName && oldName !== newName) {
        setMethodItems((prevSteps) =>
          prevSteps.map((s) =>
            s.kind === 'step'
              ? {
                  ...s,
                  raw: rewriteIngredientTokensInSteps([s.raw], { index: ingIndex, oldName, newName })[0] ?? s.raw,
                }
              : s,
          ),
        )
      }
    }
  }
  const removeIngredient = (id: string) =>
    setIngredientItems((prev) => prev.filter((i) => !(i.kind === 'ingredient' && i.id === id)))
  const handleEnterName = (id: string) => {
    const ingOnly = ingredientItems.filter((i) => i.kind === 'ingredient')
    const isLast = ingOnly[ingOnly.length - 1]?.id === id
    if (isLast) addIngredientRow()
  }

  // ---- Method steps ----
  const addStep = (raw: string, afterId?: string | null, focus = true) => {
    const id = genId()
    setMethodItems((prev) => {
      if (!afterId) return [...prev, { kind: 'step', id, raw }]
      const idx = prev.findIndex((s) => s.kind === 'step' && s.id === afterId)
      if (idx === -1) return [...prev, { kind: 'step', id, raw }]
      const next = [...prev]
      next.splice(idx + 1, 0, { kind: 'step', id, raw })
      return next
    })
    if (focus) pendingFocusStepId.current = id
    return id
  }
  const updateStepRaw = (id: string, raw: string) => {
    setMethodItems((prev) =>
      prev.map((s) => (s.kind === 'step' && s.id === id ? { ...s, raw } : s)),
    )
    setWarnStepIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }
  const removeStep = (id: string) =>
    setMethodItems((prev) => prev.filter((s) => !(s.kind === 'step' && s.id === id)))

  const handleStepEnter = (id: string) => {
    const step = steps.find((s) => s.id === id)
    if (step) {
      const plain = stepPlainText(step.raw).trim()
      const mentionsIngredient =
        /\{\{/.test(step.raw) || ingredients.some((ing) => ing.name.trim() && plain.toLowerCase().includes(ing.name.trim().toLowerCase()))
      if (plain && !mentionsIngredient) {
        setWarnStepIds((prev) => new Set(prev).add(id))
      }
    }
    const stepOnly = methodItems.filter((s) => s.kind === 'step')
    const isLast = stepOnly[stepOnly.length - 1]?.id === id
    if (isLast) addStep('', id)
    else {
      const idx = stepOnly.findIndex((s) => s.id === id)
      const next = stepOnly[idx + 1]
      if (next) pendingFocusStepId.current = next.id
    }
  }



  // ---- Method toolbar (applies to the active step's selection) ----
  const applyToActiveStep = (transform: (value: string, start: number, end: number) => { next: string; cursor: number; selLen: number }) => {
    if (!activeStepId) return
    const el = stepTextareaRefs.current.get(activeStepId)
    const step = steps.find((s) => s.id === activeStepId)
    if (!el || !step) return
    const start = el.selectionStart ?? step.raw.length
    const end = el.selectionEnd ?? step.raw.length
    const { next, cursor, selLen } = transform(step.raw, start, end)
    updateStepRaw(activeStepId, next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor + selLen)
    })
  }

  const wrapSelection = (before: string, after: string, placeholder: string) =>
    applyToActiveStep((value, start, end) => {
      const selected = value.slice(start, end) || placeholder
      const next = value.slice(0, start) + before + selected + after + value.slice(end)
      return { next, cursor: start + before.length, selLen: selected.length }
    })

  const insertAtCursor = (text: string) =>
    applyToActiveStep((value, start, end) => {
      const next = value.slice(0, start) + text + value.slice(end)
      return { next, cursor: start + text.length, selLen: 0 }
    })

  const handleAddImageClick = () => {
    if (!activeStepId) return
    void (async () => {
      const file = await pickPhotoNativeOrFallback(() => stepImageInputRef.current?.click())
      if (file) void handleStepImageFile(file)
    })()
  }
  const handleStepImageFile = async (file: File | undefined) => {
    if (!file || !supabase || !activeStepId) return
    const stepIdAtUpload = activeStepId
    const url = await uploadRecipeImage(supabase, userId, recipeId, `step-${genId()}`, file)
    if (url) addStep(makeImageStep(url), stepIdAtUpload, false)
  }

  const commitLink = () => {
    const url = linkUrlDraft.trim()
    setLinkPromptOpen(false)
    setLinkUrlDraft('')
    if (!url) return
    wrapSelection('[', `](${url})`, 'link text')
  }

  const pickIngredientForStep = (name: string) => {
    setIngredientPickerOpen(false)
    if (!activeStepId) {
      if (steps.length > 0) {
        setActiveStepId(steps[steps.length - 1].id)
      } else {
        const newId = addStep('', null, true)
        setActiveStepId(newId)
      }
    }
    const index = ingredients.findIndex((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase())
    insertAtCursor(makeIngredientToken(name, undefined, index >= 0 ? index : undefined))
  }

  // ---- AI assist ----
  /** AI generate from a blank create: auto-save and open RecipeDetail (skip editor review). */
  const runAiGenerate = async () => {
    if (!aiPromptText.trim()) {
      setAiError('Describe what you want first.')
      return
    }
    setAiBusy(true)
    setAiError('')
    try {
      const picked = stashItems.filter((item) => aiStashPicks.has(item.id))
      const pickLines = picked.map(formatStashPickLine)
      const prompt =
        pickLines.length > 0
          ? aiOnlyUseSelectedStash
            ? `${aiPromptText.trim()}\n\nONLY use these ingredients — do not add any others: ${pickLines.join('; ')}. Treat the description above as cooking direction only, not as a license to invent pantry items.`
            : `${aiPromptText.trim()}\n\nPrefer using these stash ingredients: ${pickLines.join('; ')}.`
          : aiPromptText.trim()
      const draft = await generateRecipeFromPrompt(prompt)
      const finalIngredients = draft.ingredients.map((i) => ({
        name: i.name,
        amount: i.amount?.trim() ? i.amount : '',
        unit: i.unit,
        canonical_key: inferIngredientToken(i.name),
        notes: i.notes ?? null,
      }))
      const finalSteps = draft.steps

      let heroUrl = draft.source_image_url
      let isAiHero = false
      if (!heroUrl && supabase) {
        setHeroUploading(true)
        heroUrl =
          (await generateAndUploadRecipeHeroImage(supabase, userId, recipeId, {
            title: draft.name || 'Recipe',
            description: draft.description,
            ingredients: finalIngredients.map((i) => i.name),
          }).finally(() => setHeroUploading(false))) ?? null
        isAiHero = Boolean(heroUrl)
      }

      const savedId = await insertRecipe(recipeId, userId, {
        title: draft.name.trim() || 'Untitled recipe',
        source_image_url: heroUrl,
        source_url: null,
        author_name: 'figs AI',
        shelf_origin: 'ai',
        cleaned_json: {
          description: draft.description,
          ingredients: finalIngredients,
          steps: finalSteps,
          servings: draft.servings,
          total_cook_minutes: draft.total_cook_minutes,
          prep_time_mins: draft.prep_time_mins,
          cook_time_mins: draft.cook_time_mins,
          inactive_time_mins: draft.inactive_time_mins,
          is_ai_generated_hero: isAiHero,
        },
      })
      warmIngredientSwaps(finalIngredients.map((i) => i.name))
      setAiPromptOpen(false)
      setAiPromptText('')
      onClose(savedId)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Could not generate that recipe.')
    } finally {
      setAiBusy(false)
    }
  }

  let stepNumber = 0

  return (
    <div className="fixed inset-0 z-[170] flex flex-col bg-white">
      {/* Match RecipeDetail: scroll lives on the body, not the outer shell — otherwise the
          aspect-square hero collapses to 0 height as a flex child and the cover never appears. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div
        className="relative aspect-square w-full shrink-0 overflow-hidden bg-[#1A0D40]"
        style={{
          background: heroImageUrl ? undefined : 'linear-gradient(165deg, #1A0D40 0%, #12082E 100%)',
        }}
      >
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              setHeroImageUrl(null)
            }}
          />
        ) : null}
        {heroImageUrl ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(10,5,25,0.28) 0%, rgba(10,5,25,0) 22%, rgba(10,5,25,0) 82%, rgba(10,5,25,0.25) 100%)' }}
          />
        ) : null}
        {heroImageUrl && heroIsAiGenerated ? (
          <span className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-full border border-white/40 bg-black/25 px-2.5 py-1 font-ui text-[10px] font-bold uppercase tracking-[0.06em] text-white/85 backdrop-blur-[3px]">
            AI
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const file = await pickPhotoNativeOrFallback(() => heroFileInputRef.current?.click())
              if (file) void handleHeroFile(file)
            })()
          }}
          disabled={heroUploading}
          className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 border-0 bg-transparent text-white disabled:opacity-70"
        >
          {heroUploading ? (
            <Loader2 size={26} className="animate-spin text-white" />
          ) : !heroImageUrl ? (
            <>
              <Camera size={32} strokeWidth={1.6} className="text-white" />
              <span className="font-ui text-[14px] font-semibold text-white">Add a photo</span>
            </>
          ) : null}
        </button>
        <input
          ref={heroFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleHeroFile(e.target.files?.[0])}
        />

        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute left-4 z-20 flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)] transition active:opacity-70"
          style={{ top: 'max(16px, env(safe-area-inset-top, 0px))' }}
        >
          <X size={22} strokeWidth={2.4} />
        </button>
        <div
          className="absolute right-4 z-20 flex items-center gap-2"
          style={{ top: 'max(16px, env(safe-area-inset-top, 0px))' }}
        >
          <button
            type="button"
            onClick={() => {
              void (async () => {
                const file = await pickPhotoNativeOrFallback(() => heroFileInputRef.current?.click())
                if (file) void handleHeroFile(file)
              })()
            }}
            aria-label="Replace photo"
            className="flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)] transition active:opacity-70"
          >
            <ImageIcon size={20} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setAiPromptOpen(true)}
            aria-label="AI assist"
            className="flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)] transition active:opacity-70"
          >
            <Sparkles size={20} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="px-3 pt-[18px] sm:px-4">
        <div className="flex items-start gap-2">
          <AutoGrowTextarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Recipe name"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-editorial text-[27px] font-normal leading-[1.12] tracking-[-0.01em] text-[#1A0D40] outline-none placeholder:text-[#c4c2c8]"
          />
          {sourceUrlRef.current ? (
            <a
              href={sourceUrlRef.current}
              target="_blank"
              rel="noreferrer"
              aria-label="View original recipe"
              className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#9a9aa0] transition active:opacity-60"
            >
              <ExternalLink size={17} strokeWidth={2.2} />
            </a>
          ) : null}
        </div>
        <div className="mt-[13px] flex items-center justify-between gap-3">
          <span className="font-ui text-[13.5px] font-semibold text-[#111]">
            {recipeCreatorLabel({ author_name: authorName, source_url: sourceUrlRef.current })}
          </span>
          <button
            type="button"
            onClick={() => setTimePopupOpen(true)}
            className="flex items-center gap-1.5 border-0 bg-transparent p-0 font-ui text-[13px] font-semibold text-[#111] transition active:opacity-70"
          >
            <Clock size={15} strokeWidth={2.1} />
            {prepMins || cookMins || inactiveMins
              ? `${(Number(prepMins) || 0) + (Number(cookMins) || 0) + (Number(inactiveMins) || 0)}m`
              : '+ Add time'}
          </button>
        </div>
        <div className="mt-3 h-px w-full bg-[#ECE9E3]" />
        <AutoGrowTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a short description…"
          className="mt-4 w-full border-0 bg-transparent p-0 font-ui text-[14.5px] leading-[1.55] text-[#332e3d] outline-none placeholder:text-[#9ca3af]"
        />
      </div>

      <div className="px-3 pt-6 sm:px-4">
        <div className="flex items-center justify-between">
          <h2 className="font-editorial text-[20px] font-semibold text-[#1A0D40]">Ingredients</h2>
          <div className="flex items-center rounded-full border border-white/60 bg-white/75 py-[2px] pl-1 pr-1 font-ui text-[12.5px] font-semibold text-[#111] backdrop-blur-[20px] backdrop-saturate-150">
            <button
              type="button"
              aria-label="Fewer servings"
              onClick={() => setServings((s) => stepServingsDown(s))}
              className="flex h-6 w-5 items-center justify-center rounded-full border-0 bg-transparent text-[15px] leading-none text-[#1A0D40]"
            >
              −
            </button>
            <label className="flex min-w-[52px] cursor-pointer items-center justify-center gap-0.5 px-1">
              <span>For</span>
              <input
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="4"
                inputMode="decimal"
                className="w-7 bg-transparent text-center font-ui text-[12.5px] font-semibold text-[#111] outline-none"
              />
            </label>
            <button
              type="button"
              aria-label="More servings"
              onClick={() => setServings((s) => stepServingsUp(s))}
              className="flex h-6 w-5 items-center justify-center rounded-full border-0 bg-transparent text-[15px] leading-none text-[#1A0D40]"
            >
              +
            </button>
          </div>
        </div>

        <div
          className="mt-2 flex flex-col gap-2"
          onPointerMove={ingredientDrag.draggingIndex != null ? ingredientDrag.onDragMove : undefined}
          onPointerUp={ingredientDrag.draggingIndex != null ? ingredientDrag.endDrag : undefined}
          onPointerCancel={ingredientDrag.draggingIndex != null ? ingredientDrag.endDrag : undefined}
        >
          {ingredientItems.map((item, i) => {
            if (item.kind === 'subrecipe') {
              const row = resolveChildRow(item.recipe_id)
              return (
                <SubrecipeBlockCard
                  key={item.id}
                  title={row?.title || 'Subrecipe'}
                  childId={item.recipe_id}
                  child={childSummaryFor(item.recipe_id)}
                  mode="ingredients"
                  collapsed={item.collapsed}
                  dragging={ingredientDrag.draggingIndex === i}
                  rowRef={ingredientDrag.setRef(i)}
                  onDragHandlePointerDown={ingredientDrag.startDrag(i)}
                  onToggleCollapsed={() => {
                    if (item.collapsed) ensureChildIngredientDraft(item.recipe_id)
                    setIngredientItems((prev) =>
                      prev.map((p) =>
                        p.kind === 'subrecipe' && p.id === item.id ? { ...p, collapsed: !p.collapsed } : p,
                      ),
                    )
                  }}
                  onRemove={() => removeSubrecipeFromBoth(item.recipe_id)}
                  onEdit={
                    onRequestEditSubrecipe ? () => onRequestEditSubrecipe(item.recipe_id) : undefined
                  }
                  editableIngredients={childIngredientDrafts[item.recipe_id] ?? null}
                  onChangeIngredient={(ingId, patch) => {
                    setDirtyChildIds((d) => ({ ...d, [item.recipe_id]: true }))
                    setChildIngredientDrafts((prev) => ({
                      ...prev,
                      [item.recipe_id]: (prev[item.recipe_id] ?? []).map((ing) =>
                        ing.id === ingId ? { ...ing, ...patch } : ing,
                      ),
                    }))
                  }}
                  onRemoveIngredient={(ingId) => {
                    setDirtyChildIds((d) => ({ ...d, [item.recipe_id]: true }))
                    setChildIngredientDrafts((prev) => ({
                      ...prev,
                      [item.recipe_id]: (prev[item.recipe_id] ?? []).filter((ing) => ing.id !== ingId),
                    }))
                  }}
                  onAddIngredient={() => {
                    ensureChildIngredientDraft(item.recipe_id)
                    setDirtyChildIds((d) => ({ ...d, [item.recipe_id]: true }))
                    setChildIngredientDrafts((prev) => ({
                      ...prev,
                      [item.recipe_id]: [
                        ...(prev[item.recipe_id] ?? []),
                        { id: genId(), name: '', amount: '', unit: '', notes: null },
                      ],
                    }))
                  }}
                />
              )
            }
            return (
              <IngredientEditRow
                key={item.id}
                ingredient={item}
                dragging={ingredientDrag.draggingIndex === i}
                rowRef={ingredientDrag.setRef(i)}
                onDragHandlePointerDown={ingredientDrag.startDrag(i)}
                onChange={(patch) => updateIngredient(item.id, patch)}
                onRemove={() => removeIngredient(item.id)}
                onEnterName={() => handleEnterName(item.id)}
                nameInputRef={(el) => {
                  if (el) nameInputRefs.current.set(item.id, el)
                  else nameInputRefs.current.delete(item.id)
                }}
              />
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => addIngredientRow()}
            className="flex h-9 items-center gap-1.5 border-0 bg-transparent px-0 font-ui text-[12.5px] font-semibold text-[#4C6A57]"
          >
            <Plus size={14} strokeWidth={2.4} />
            Add ingredient
          </button>
          <button
            type="button"
            onClick={() => setSubrecipePickerFor('ingredients')}
            className="flex h-9 items-center gap-1.5 border-0 bg-transparent px-0 font-ui text-[12.5px] font-semibold text-[#4C6A57]"
          >
            <Plus size={14} strokeWidth={2.4} />
            Add Subrecipe
          </button>
        </div>
      </div>

      <div className="px-3 pt-6 sm:px-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-editorial text-[20px] font-semibold text-[#1A0D40]">Method</h2>
        </div>

        <MethodToolbar
          disabled={false}
          onBold={() => wrapSelection('**', '**', 'bold text')}
          onItalic={() => wrapSelection('*', '*', 'italic text')}
          onUnderline={() => wrapSelection('<u>', '</u>', 'underlined text')}
          onLink={() => setLinkPromptOpen(true)}
          onAddIngredient={() => setIngredientPickerOpen(true)}
          onAddImage={handleAddImageClick}
        />
        <input
          ref={stepImageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleStepImageFile(e.target.files?.[0])}
        />

        <div
          className="flex flex-col gap-[14px]"
          onPointerMove={stepDrag.draggingIndex != null ? stepDrag.onDragMove : undefined}
          onPointerUp={stepDrag.draggingIndex != null ? stepDrag.endDrag : undefined}
          onPointerCancel={stepDrag.draggingIndex != null ? stepDrag.endDrag : undefined}
        >
          {methodItems.map((item, i) => {
            if (item.kind === 'subrecipe') {
              const row = resolveChildRow(item.recipe_id)
              return (
                <SubrecipeBlockCard
                  key={item.id}
                  title={row?.title || 'Subrecipe'}
                  childId={item.recipe_id}
                  child={childSummaryFor(item.recipe_id)}
                  mode="method"
                  collapsed={item.collapsed}
                  dragging={stepDrag.draggingIndex === i}
                  rowRef={stepDrag.setRef(i)}
                  onDragHandlePointerDown={stepDrag.startDrag(i)}
                  onToggleCollapsed={() =>
                    setMethodItems((prev) =>
                      prev.map((p) =>
                        p.kind === 'subrecipe' && p.id === item.id ? { ...p, collapsed: !p.collapsed } : p,
                      ),
                    )
                  }
                  onRemove={() => removeSubrecipeFromBoth(item.recipe_id)}
                  onEdit={
                    onRequestEditSubrecipe ? () => onRequestEditSubrecipe(item.recipe_id) : undefined
                  }
                />
              )
            }
            const isNumbered = !item.raw.trim().startsWith('## ') && !/^!\[\]\(/.test(item.raw.trim())
            if (isNumbered) stepNumber += 1
            return (
              <MethodStepEditor
                key={item.id}
                step={item}
                stepNumber={isNumbered ? stepNumber : null}
                warn={warnStepIds.has(item.id)}
                active={activeStepId === item.id}
                ingredients={ingredients}
                dragging={stepDrag.draggingIndex === i}
                rowRef={stepDrag.setRef(i)}
                onDragHandlePointerDown={stepDrag.startDrag(i)}
                onChangeRaw={(raw) => updateStepRaw(item.id, raw)}
                onUpdateIngredient={(index, patch) => {
                  const target = ingredients[index]
                  if (!target) return
                  updateIngredient(target.id, patch)
                }}
                onFocus={() => setActiveStepId(item.id)}
                onEnter={() => handleStepEnter(item.id)}
                onRemove={() => removeStep(item.id)}
                onAddStepAfter={() => addStep('', item.id)}
                textareaRef={(el) => {
                  if (el) stepTextareaRefs.current.set(item.id, el)
                  else stepTextareaRefs.current.delete(item.id)
                }}
              />
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => addStep('')}
            className="flex h-9 items-center gap-1.5 border-0 bg-transparent px-0 font-ui text-[12.5px] font-semibold text-[#4C6A57]"
          >
            <Plus size={14} strokeWidth={2.4} />
            Add step
          </button>
          <button
            type="button"
            onClick={() => setSubrecipePickerFor('method')}
            className="flex h-9 items-center gap-1.5 border-0 bg-transparent px-0 font-ui text-[12.5px] font-semibold text-[#4C6A57]"
          >
            <Plus size={14} strokeWidth={2.4} />
            Add Subrecipe
          </button>
        </div>
      </div>

      <div className="px-[22px] pt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-editorial text-[20px] font-semibold text-[#1A0D40]">Nutrition</h2>
        </div>
        <button
          type="button"
          onClick={() => setNutritionPopupOpen(true)}
          className="mt-3 flex h-9 items-center gap-1.5 rounded-full border border-[#E8E8ED] bg-[#F5F5F7] px-4 py-1.5 font-ui text-[13px] font-semibold text-[#1A0D40] hover:bg-[#EAE8F0]"
        >
          {calories || proteinG ? `${calories || '0'} kcal · ${proteinG || '0'}g Protein` : '+ Add Nutrition Facts'}
        </button>
      </div>

      <div className="px-[22px] pt-6">
        <h2 className="font-editorial text-[20px] font-semibold text-[#1A0D40]">Tags</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1A0D40] px-3.5 py-1.5 font-ui text-[12.5px] font-semibold text-white shadow-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                className="border-0 bg-transparent p-0 text-white/80 transition hover:text-white"
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={customTagInput}
            onChange={(e) => setCustomTagInput(e.target.value)}
            placeholder="Add a tag…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customTagInput.trim()) {
                e.preventDefault()
                const val = customTagInput.trim()
                if (!selectedTags.includes(val)) setSelectedTags((prev) => [...prev, val])
                setCustomTagInput('')
              }
            }}
            className="h-9 min-w-0 flex-1 rounded-xl border border-[#E8E8ED] bg-white px-3 font-ui text-[13px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
          />
          <button
            type="button"
            onClick={() => {
              if (customTagInput.trim()) {
                const val = customTagInput.trim()
                if (!selectedTags.includes(val)) setSelectedTags((prev) => [...prev, val])
                setCustomTagInput('')
              }
            }}
            className="h-9 rounded-xl border-0 bg-[#1A0D40] px-3.5 font-ui text-[12.5px] font-semibold text-white transition hover:opacity-95"
          >
            + Add
          </button>
        </div>
      </div>

      <div className="px-[22px] pb-12 pt-8">
        {createError ? <p className="mb-2 font-ui text-[12px] font-medium text-[#c0503a]">{createError}</p> : null}
        <button
          type="button"
          disabled={creating}
          onClick={() => void handleCreate()}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border-0 bg-[#1A0D40] font-ui text-[15px] font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span key={creating ? 'busy' : 'idle'} className="inline-flex items-center gap-2">
            {creating ? <Loader2 size={17} className="animate-spin" /> : null}
            {creating ? (isEditing ? 'Saving…' : 'Creating…') : isEditing ? 'Save Recipe' : 'Create Recipe'}
          </span>
        </button>
      </div>
      </div>

      {timePopupOpen ? (
        <CenteredPopup title="Cooking time" onClose={() => setTimePopupOpen(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-ui text-[13px] font-semibold text-[#9a9aa0]">Estimate times</span>
              <button
                type="button"
                disabled={!hasIngredients}
                onClick={autoEstimateTimes}
                aria-label="AI estimate time"
                className="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-[#1A0D40] text-white disabled:opacity-40"
              >
                <Sparkles size={15} strokeWidth={2.2} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-xl border border-[#E8E8ED] bg-[#F5F5F7] px-3 py-2">
                <span className="font-ui text-[13.5px] font-semibold text-[#1A0D40]">Prep time</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="10"
                    value={prepMins}
                    onChange={(e) => setPrepMins(e.target.value)}
                    className="w-14 bg-transparent text-right font-ui text-[14px] font-bold text-[#1A0D40] outline-none"
                  />
                  <span className="font-ui text-[12px] text-[#9a9aa0]">mins</span>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[#E8E8ED] bg-[#F5F5F7] px-3 py-2">
                <span className="font-ui text-[13.5px] font-semibold text-[#1A0D40]">Cook time</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="20"
                    value={cookMins}
                    onChange={(e) => setCookMins(e.target.value)}
                    className="w-14 bg-transparent text-right font-ui text-[14px] font-bold text-[#1A0D40] outline-none"
                  />
                  <span className="font-ui text-[12px] text-[#9a9aa0]">mins</span>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[#E8E8ED] bg-[#F5F5F7] px-3 py-2">
                <span className="font-ui text-[13.5px] font-semibold text-[#1A0D40]">Idle time</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="0"
                    value={inactiveMins}
                    onChange={(e) => setInactiveMins(e.target.value)}
                    className="w-14 bg-transparent text-right font-ui text-[14px] font-bold text-[#1A0D40] outline-none"
                  />
                  <span className="font-ui text-[12px] text-[#9a9aa0]">mins</span>
                </div>
              </div>
            </div>
            <div className="border-t border-[#ECE9E3] pt-2 text-right font-ui text-[13px] font-bold text-[#1A0D40]">
              Total time: {(Number(prepMins) || 0) + (Number(cookMins) || 0) + (Number(inactiveMins) || 0)} mins
            </div>
            <button
              type="button"
              onClick={() => setTimePopupOpen(false)}
              className="h-11 w-full rounded-xl border-0 bg-[#1A0D40] font-ui text-[14px] font-semibold text-white"
            >
              Done
            </button>
          </div>
        </CenteredPopup>
      ) : null}

      {nutritionPopupOpen ? (
        <CenteredPopup title="Nutrition Facts" onClose={() => setNutritionPopupOpen(false)}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-black pb-2">
              <span className="font-editorial text-[22px] font-extrabold text-[#1A0D40]">Nutrition Facts</span>
              <button
                type="button"
                disabled={!hasIngredients}
                onClick={autoEstimateNutrition}
                aria-label="AI estimate nutrition"
                className="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-[#1A0D40] text-white disabled:opacity-40"
              >
                <Sparkles size={15} strokeWidth={2.2} />
              </button>
            </div>
            <div className="flex items-center justify-between border-b-4 border-black py-1 font-ui text-[14px] font-bold text-[#1A0D40]">
              <span>Calories</span>
              <input
                type="number"
                placeholder="380"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                className="w-20 bg-transparent text-right font-ui text-[16px] font-extrabold text-[#1A0D40] outline-none"
              />
            </div>
            <div className="flex flex-col divide-y divide-[#ECE9E3] font-ui text-[13px] text-[#1A0D40]">
              <div className="flex items-center justify-between py-1.5">
                <span className="font-semibold">Protein</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="24"
                    value={proteinG}
                    onChange={(e) => setProteinG(e.target.value)}
                    className="w-16 bg-transparent text-right font-bold text-[#1A0D40] outline-none"
                  />
                  <span className="text-[#9a9aa0]">g</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="font-semibold">Total Carbohydrate</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="42"
                    value={carbsG}
                    onChange={(e) => setCarbsG(e.target.value)}
                    className="w-16 bg-transparent text-right font-bold text-[#1A0D40] outline-none"
                  />
                  <span className="text-[#9a9aa0]">g</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5 pl-4">
                <span>Dietary Fiber</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="5"
                    value={fiberG}
                    onChange={(e) => setFiberG(e.target.value)}
                    className="w-16 bg-transparent text-right text-[#1A0D40] outline-none"
                  />
                  <span className="text-[#9a9aa0]">g</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5 pl-4">
                <span>Total Sugars</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="8"
                    value={sugarG}
                    onChange={(e) => setSugarG(e.target.value)}
                    className="w-16 bg-transparent text-right text-[#1A0D40] outline-none"
                  />
                  <span className="text-[#9a9aa0]">g</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="font-semibold">Total Fat</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="14"
                    value={fatG}
                    onChange={(e) => setFatG(e.target.value)}
                    className="w-16 bg-transparent text-right font-bold text-[#1A0D40] outline-none"
                  />
                  <span className="text-[#9a9aa0]">g</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="font-semibold">Sodium</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="480"
                    value={sodiumMg}
                    onChange={(e) => setSodiumMg(e.target.value)}
                    className="w-16 bg-transparent text-right font-bold text-[#1A0D40] outline-none"
                  />
                  <span className="text-[#9a9aa0]">mg</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNutritionPopupOpen(false)}
              className="mt-2 h-11 w-full rounded-xl border-0 bg-[#1A0D40] font-ui text-[14px] font-semibold text-white"
            >
              Done
            </button>
          </div>
        </CenteredPopup>
      ) : null}

      {aiPromptOpen ? (
        <CenteredPopup
          title="AI recipe"
          subtitle="Describe what you want — AI fills in the details."
          onClose={() => {
            setAiPromptOpen(false)
            setAiStashPicks(new Set())
            setAiOnlyUseSelectedStash(false)
          }}
          widthClassName="max-w-sm"
        >
          <div className="flex max-h-[70vh] flex-col gap-3">
            <textarea
              autoFocus
              value={aiPromptText}
              onChange={(e) => setAiPromptText(e.target.value)}
              placeholder="e.g. A quick vegetarian pasta with what's usually in a pantry"
              rows={4}
              className="w-full shrink-0 resize-none rounded-[14px] border border-[#E8E8ED] bg-white p-4 font-ui text-[14.5px] text-[#1A0D40] outline-none transition-[border-color] placeholder:text-[#9ca3af] focus:border-[#4C6A57]"
            />
            {stashItems.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-hidden rounded-[14px] border border-[#ECE9E3] bg-[#FAFAFA]">
                <div className="border-b border-[#ECE9E3] px-3.5 py-2.5 font-ui text-[12.5px] font-semibold text-[#1A0D40]">
                  Choose ingredients from your stash
                </div>
                <div className="max-h-[180px] overflow-y-auto px-2 py-1.5">
                  {stashItems.map((item) => {
                    const checked = aiStashPicks.has(item.id)
                    const line = formatStashPickLine(item)
                    return (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-start gap-2.5 rounded-[10px] px-2 py-2 transition hover:bg-white"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setAiStashPicks((prev) => {
                              const next = new Set(prev)
                              if (next.has(item.id)) next.delete(item.id)
                              else next.add(item.id)
                              return next
                            })
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#1A0D40]"
                        />
                        <span className="font-ui text-[13px] leading-snug text-[#332e3d]">{line}</span>
                      </label>
                    )
                  })}
                </div>
                <label
                  className={`flex items-center gap-2.5 border-t border-[#ECE9E3] px-3.5 py-2.5 ${
                    aiStashPicks.size > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={aiOnlyUseSelectedStash && aiStashPicks.size > 0}
                    disabled={aiStashPicks.size === 0}
                    onChange={(e) => setAiOnlyUseSelectedStash(e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-[#1A0D40]"
                  />
                  <span className="font-ui text-[13px] font-medium text-[#1A0D40]">Only use these items</span>
                </label>
              </div>
            ) : null}
            {aiError ? <p className="font-ui text-[12px] font-medium text-[#c0503a]">{aiError}</p> : null}
            <button
              type="button"
              disabled={aiBusy}
              onClick={() => void runAiGenerate()}
              className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-[14px] border-0 bg-[#1A0D40] font-ui text-[14.5px] font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} strokeWidth={2.2} />}
              {aiBusy ? 'Writing…' : 'Generate'}
            </button>
          </div>
        </CenteredPopup>
      ) : null}

      {linkPromptOpen ? (
        <CenteredPopup title="Add link" onClose={() => setLinkPromptOpen(false)}>
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              value={linkUrlDraft}
              onChange={(e) => setLinkUrlDraft(e.target.value)}
              placeholder="https://…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitLink()
              }}
              className="h-11 w-full rounded-lg border border-[#E8E8ED] bg-white px-3.5 font-ui text-[14px] text-[#1A0D40] outline-none focus:border-[#708a7c]"
            />
            <button type="button" onClick={commitLink} className="h-11 w-full rounded-lg border-0 bg-[#1A0D40] font-ui text-[14px] font-semibold text-white transition hover:opacity-95">
              Add link
            </button>
          </div>
        </CenteredPopup>
      ) : null}

      {ingredientPickerOpen ? (
        <CenteredPopup title="Add ingredient" onClose={() => setIngredientPickerOpen(false)}>
          <div className="flex flex-col gap-1">
            {ingredients.filter((i) => i.name.trim()).length === 0 ? (
              <p className="py-2 text-center font-ui text-[13px] text-[#9a9aa0]">Add some ingredients first.</p>
            ) : (
              ingredients
                .filter((i) => i.name.trim())
                .map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => pickIngredientForStep(i.name.trim())}
                    className="rounded-xl border-0 bg-transparent px-3 py-2.5 text-left font-ui text-[14px] font-medium text-[#1A0D40] transition hover:bg-[#1A0D40]/[0.04]"
                  >
                    {i.name.trim()}
                  </button>
                ))
            )}
          </div>
        </CenteredPopup>
      ) : null}

      {subrecipePickerFor ? (
        <RecipePickerSheet
          title="Add Subrecipe"
          recipes={recipes.filter((r) => r.id !== recipeId)}
          userId={userId}
          mode="single"
          onPickSingle={(id) => {
            addSubrecipeToBoth(id)
            setSubrecipePickerFor(null)
          }}
          onClose={() => setSubrecipePickerFor(null)}
          onCreateNew={onRequestCreateFromPicker}
          preferSelectId={preferSelectRecipeId}
        />
      ) : null}
    </div>
  )
}
