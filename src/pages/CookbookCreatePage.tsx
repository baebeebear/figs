import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, GripVertical, Loader2, Plus, X } from 'lucide-react'
import RecipePickerSheet from '../components/RecipePickerSheet'
import { useDragReorder } from '../hooks/useDragReorder'
import { assignRecipeToCookbook, createCookbook, unassignRecipeFromCookbook, updateCookbook, useCookbookRecipes, type CookbookRow } from '../lib/cookbooks'
import { cookbookHeroGradient, DEFAULT_COOKBOOK_THEME, extractDominantColorFromImage } from '../lib/coverTheme'
import type { RecipeRow } from '../lib/recipes'
import { uploadCookbookCoverImage } from '../lib/recipeImageStorage'
import { supabase } from '../services/supabase'

type Props = {
  userId: string
  username?: string | null
  recipes: RecipeRow[]
  existing?: CookbookRow | null
  /** After create: no args. After edit: pass updated cookbook so App can reopen detail. */
  onClose: (result?: { reopen: CookbookRow }) => void
  /** Open create-recipe editor above the Add recipes picker. */
  onCreateRecipeFromPicker?: () => void
  /** Newly created recipe id to auto-select in the picker. */
  preferSelectRecipeId?: string | null
}

const UNTITLED = 'Untitled book'

/** Full-page Create / Edit Book editor — local draft only until the user taps Create/Save. */
export default function CookbookCreatePage({
  userId,
  username,
  recipes,
  existing,
  onClose,
  onCreateRecipeFromPicker,
  preferSelectRecipeId,
}: Props) {
  const isEditing = Boolean(existing)
  const { recipes: existingRecipes, loading: existingLoading } = useCookbookRecipes(existing?.id ?? null)
  const [name, setName] = useState(existing?.name ?? UNTITLED)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [coverUrl, setCoverUrl] = useState<string | null>(existing?.cover_image_url ?? null)
  const [themeHex, setThemeHex] = useState<string | null>(existing?.theme_color_hex ?? null)
  const [coverUploading, setCoverUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [assignmentsSeeded, setAssignmentsSeeded] = useState(!existing)
  const coverFileInputRef = useRef<HTMLInputElement>(null)
  const coverId = useRef(existing?.id ?? crypto.randomUUID()).current

  // Seed selectedIds once assignments finish loading (including empty books).
  useEffect(() => {
    if (!existing || assignmentsSeeded || existingLoading) return
    setSelectedIds(existingRecipes.map((r) => r.id))
    setAssignmentsSeeded(true)
  }, [existing, existingRecipes, existingLoading, assignmentsSeeded])

    const selectedRecipes = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.id, r]))
    // Keep cookbook members visible even if they are missing from the global myRecipes list.
    for (const r of existingRecipes) {
      if (!byId.has(r.id)) {
        byId.set(r.id, {
          id: r.id,
          user_id: userId,
          title: r.title,
          author_name: null,
          source_image_url: r.source_image_url,
          source_url: null,
          cleaned_json: r.cleaned_json as RecipeRow['cleaned_json'],
          created_at: '',
          shelf_origin: 'created',
          processing_status: 'ready',
          processing_error: null,
          is_placeholder: false,
        })
      }
    }
    return selectedIds.map((id) => byId.get(id)).filter((r): r is RecipeRow => Boolean(r))
  }, [recipes, selectedIds, existingRecipes, userId])

  const recipeDrag = useDragReorder(selectedRecipes, (next) => {
    setSelectedIds(next.map((r) => r.id))
  })

  useEffect(() => {
    if (!coverUrl) {
      setThemeHex(null)
      return
    }
    let cancelled = false
    void extractDominantColorFromImage(coverUrl).then((hex) => {
      if (!cancelled) setThemeHex(hex)
    })
    return () => {
      cancelled = true
    }
  }, [coverUrl])

  const handleCoverFile = async (file: File | undefined) => {
    if (!file || !supabase) return
    setCoverUploading(true)
    try {
      const url = await uploadCookbookCoverImage(supabase, userId, coverId, file)
      if (url) setCoverUrl(url)
    } finally {
      setCoverUploading(false)
    }
  }

  const removeRecipe = (recipeId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== recipeId))
  }

  const handleCreate = async () => {
    if (submitting) return
    if (existing && !assignmentsSeeded) {
      setSubmitError('Still loading recipes in this book…')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      if (existing) {
        await updateCookbook(existing.id, {
          name: name.trim() || UNTITLED,
          description: description.trim() || null,
          cover_image_url: coverUrl,
          theme_color_hex: themeHex,
        })
        const prev = new Set(existingRecipes.map((r) => r.id))
        const next = new Set(selectedIds)
        // Write full ordered membership so rearrange persists (position 0..n-1).
        for (let i = 0; i < selectedIds.length; i++) {
          await assignRecipeToCookbook(existing.id, selectedIds[i], i)
        }
        for (const id of prev) {
          if (!next.has(id)) await unassignRecipeFromCookbook(existing.id, id)
        }
        const reopened: CookbookRow = {
          ...existing,
          name: name.trim() || UNTITLED,
          description: description.trim() || null,
          cover_image_url: coverUrl,
          theme_color_hex: themeHex,
        }
        onClose({ reopen: reopened })
        return
      }

      const id = await createCookbook(userId, {
        name: name.trim() || UNTITLED,
        description: description.trim() || null,
        createdByString: username ?? null,
        coverImageUrl: coverUrl,
        themeColorHex: themeHex,
      })
      const results = await Promise.allSettled(
        selectedIds.map((recipeId, i) => assignRecipeToCookbook(id, recipeId, i)),
      )
      const failed = results.filter((r) => r.status === 'rejected')
      if (failed.length) {
        const reason = failed[0].status === 'rejected' ? String(failed[0].reason?.message ?? failed[0].reason) : ''
        setSubmitError(`Book created, but ${failed.length} recipe${failed.length === 1 ? '' : 's'} could not be added. ${reason}`)
        return
      }
      onClose()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : isEditing ? 'Could not save book.' : 'Could not create book.')
    } finally {
      setSubmitting(false)
    }
  }

  const heroMid = themeHex || DEFAULT_COOKBOOK_THEME

  return (
    <div className="fixed inset-0 z-[165] flex flex-col overflow-hidden bg-white">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          className="relative flex-none overflow-hidden pb-7 pt-[max(52px,env(safe-area-inset-top,0px))]"
          style={{ background: cookbookHeroGradient(themeHex) }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 9px, rgba(0,0,0,0) 9px 19px)' }}
          />

          <button
            type="button"
            onClick={() => onClose()}
            aria-label="Close"
            className="absolute left-4 top-[max(14px,env(safe-area-inset-top,0px))] z-10 flex h-9 w-9 items-center justify-center border-0 bg-transparent text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition active:opacity-70"
          >
            <X size={20} strokeWidth={2.25} />
          </button>

          <div className="relative flex flex-col items-center px-6 pt-2 text-center">
            <button
              type="button"
              onClick={() => coverFileInputRef.current?.click()}
              disabled={coverUploading}
              className="relative flex w-[148px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] border-0 text-white shadow-[0_22px_44px_-14px_rgba(0,0,0,0.6)]"
              style={{ aspectRatio: '3 / 4.4', background: heroMid }}
            >
              {coverUploading ? (
                <Loader2 size={28} className="animate-spin" />
              ) : coverUrl ? (
                <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-white/80">
                  <Camera size={28} strokeWidth={1.6} />
                  <span className="font-ui text-[11px] font-medium">Add cover</span>
                </span>
              )}
            </button>
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleCoverFile(e.target.files?.[0])}
            />

            <input
              value={name === UNTITLED ? '' : name}
              onChange={(e) => setName(e.target.value || UNTITLED)}
              onBlur={() => {
                if (!name.trim()) setName(UNTITLED)
              }}
              placeholder={UNTITLED}
              className="mt-4 w-full border-0 bg-transparent text-center font-editorial text-[26px] font-semibold leading-tight text-white outline-none placeholder:text-white/50"
            />

            <div className="mt-3 font-ui text-[12px] font-medium text-white/80">
              {selectedRecipes.length} {selectedRecipes.length === 1 ? 'recipe' : 'recipes'}
            </div>
          </div>
        </div>

        <main className="flex-1 px-5 pb-28 pt-5">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description"
            rows={3}
            className="w-full resize-none border-0 bg-transparent font-ui text-[13.5px] leading-relaxed text-[#332e3d] outline-none placeholder:text-[#9a9aa0]"
          />

          <h2 className="mt-6 font-editorial text-[19px] font-semibold text-[#1a0d40]">Inside this book</h2>

          <div className="mt-2 flex flex-col">
            {selectedRecipes.map((recipe, i) => (
              <div
                key={recipe.id}
                ref={recipeDrag.setRef(i)}
                className="flex items-center gap-2 border-0 bg-transparent py-3"
                style={{
                  opacity: recipeDrag.draggingIndex === i ? 0.55 : 1,
                  background: recipeDrag.overIndex === i && recipeDrag.draggingIndex !== i ? 'rgba(244,243,246,0.9)' : undefined,
                }}
              >
                <button
                  type="button"
                  aria-label="Drag to reorder"
                  onPointerDown={recipeDrag.startDrag(i)}
                  className="-ml-1 flex h-9 w-6 shrink-0 touch-none items-center justify-center border-0 bg-transparent text-[#c4c2c8]"
                >
                  <GripVertical size={16} strokeWidth={2} />
                </button>
                <div className="h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[10px] bg-[#E2DED4]">
                  {recipe.source_image_url ? <img src={recipe.source_image_url} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <h3 className="min-w-0 flex-1 truncate font-ui text-[15.5px] font-semibold leading-tight text-[#1A0D40]">
                  {recipe.title || 'Untitled recipe'}
                </h3>
                <button
                  type="button"
                  aria-label={`Remove ${recipe.title || 'recipe'}`}
                  onClick={() => removeRecipe(recipe.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[#9a9aa0] transition hover:bg-[#F4F3F6] hover:text-[#c0503a]"
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-3 flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#D4D0DD] bg-transparent py-3.5 font-ui text-[13.5px] font-semibold text-[#1A0D40] transition active:bg-[#FAF9FC]"
            >
              <Plus size={16} strokeWidth={2.4} />
              Add recipes
            </button>
          </div>
        </main>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-20 border-t border-[#F0EDE7] bg-white/95 px-5 pt-3 backdrop-blur-md"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {submitError ? <p className="mb-2 font-ui text-[12px] font-medium text-[#c0503a]">{submitError}</p> : null}
        <button
          type="button"
          disabled={submitting || (Boolean(existing) && !assignmentsSeeded)}
          onClick={() => void handleCreate()}
          className="flex h-12 w-full items-center justify-center rounded-[14px] border-0 bg-[#1A0D40] font-ui text-[15px] font-semibold text-white hover:opacity-95 disabled:opacity-60"
        >
          <span key={submitting ? 'busy' : 'idle'} className="inline-flex items-center gap-2">
            {submitting ? (isEditing ? 'Saving…' : 'Creating…') : isEditing ? 'Save Book' : 'Create Book'}
          </span>
        </button>
      </div>

      {pickerOpen ? (
        <RecipePickerSheet
          recipes={recipes}
          userId={userId}
          mode="multi"
          selectedIds={selectedIds}
          onChangeSelectedIds={setSelectedIds}
          onClose={() => setPickerOpen(false)}
          onCreateNew={onCreateRecipeFromPicker}
          preferSelectId={preferSelectRecipeId}
        />
      ) : null}
    </div>
  )
}
