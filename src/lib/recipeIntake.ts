import { supabase } from '../services/supabase'
import { invokeEdgeFunction } from './edgeFunctionInvoke'
import { insertRecipe, type RecipeCleanedJson } from './recipes'

export type RecipeJobKind = 'link' | 'photos' | 'file' | 'ai'

export type StartImportResult = {
  recipeId: string
  jobId: string
}

function stubCleanedJson(): RecipeCleanedJson {
  return {
    description: null,
    ingredients: [],
    steps: [],
    servings: null,
    total_cook_minutes: null,
    prep_time_mins: null,
    cook_time_mins: null,
    inactive_time_mins: null,
  }
}

/** Insert a processing placeholder + recipe_jobs row, then fire the edge worker. */
export async function startRecipeImportJob(
  userId: string,
  kind: RecipeJobKind,
  input: {
    url?: string
    title?: string
    storagePaths?: string[]
    textContent?: string
    mimeTypes?: string[]
    recipeId?: string
  },
): Promise<StartImportResult> {
  if (!supabase) throw new Error('Supabase unavailable')

  const recipeId = input.recipeId ?? crypto.randomUUID()
  const jobId = crypto.randomUUID()
  const sourceUrl = kind === 'link' ? input.url ?? null : null
  // Always the same placeholder title — Me tile styles it as Newsreader italic.
  const title = 'Importing Recipe...'

  const placedId = await insertRecipe(recipeId, userId, {
    title,
    source_image_url: null,
    source_url: sourceUrl,
    author_name: null,
    cleaned_json: stubCleanedJson(),
    shelf_origin: 'imported',
    processing_status: 'processing',
    processing_error: null,
    is_placeholder: true,
  })
  // Same-link replace returns the prior row id — never enqueue a job against a phantom UUID.
  const resolvedRecipeId = placedId || recipeId

  // Best-effort clear of open jobs (DELETE may be denied by RLS/grants — ignore).
  await supabase
    .from('recipe_jobs')
    .delete()
    .eq('recipe_id', resolvedRecipeId)
    .in('status', ['pending', 'processing'])

  const jobPayload = {
    id: jobId,
    user_id: userId,
    recipe_id: resolvedRecipeId,
    kind,
    status: 'pending' as const,
    input: {
      url: input.url ?? null,
      storagePaths: input.storagePaths ?? [],
      textContent: input.textContent ?? null,
      mimeTypes: input.mimeTypes ?? [],
    },
  }

  let { error: jobError } = await supabase.from('recipe_jobs').insert(jobPayload)
  let finalJobId = jobId
  if (jobError && (jobError.code === '23505' || /duplicate|conflict/i.test(jobError.message))) {
    finalJobId = crypto.randomUUID()
    const retry = await supabase.from('recipe_jobs').insert({ ...jobPayload, id: finalJobId })
    jobError = retry.error
  }
  if (jobError) {
    const failPatch = {
      processing_status: 'error',
      processing_error: jobError.message,
      is_placeholder: false,
    }
    const { error: failErr } = await supabase
      .from('recipes')
      .update(failPatch)
      .eq('id', resolvedRecipeId)
      .eq('user_id', userId)
    if (failErr && /processing_status|processing_error|is_placeholder|schema cache/i.test(failErr.message)) {
      await supabase.from('recipes').update({ title: 'Import failed' }).eq('id', resolvedRecipeId).eq('user_id', userId)
    }
    throw new Error(jobError.message)
  }

  void invokeEdgeFunction('process-recipe-job', { jobId: finalJobId }, { timeoutMs: 180000 }).catch((err) => {
    console.warn('[recipeIntake] process-recipe-job invoke failed', err)
  })

  return { recipeId: resolvedRecipeId, jobId: finalJobId }
}

export async function pollRecipeReady(
  recipeId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<{ status: 'ready' | 'error'; error?: string | null; title?: string | null }> {
  if (!supabase) throw new Error('Supabase unavailable')
  const intervalMs = opts.intervalMs ?? 2000
  const timeoutMs = opts.timeoutMs ?? 180000
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    let { data, error } = await supabase
      .from('recipes')
      .select('processing_status, processing_error, title, cleaned_json')
      .eq('id', recipeId)
      .maybeSingle()

    if (error && /processing_status|processing_error|schema cache/i.test(error.message)) {
      const fallback = await supabase
        .from('recipes')
        .select('title, cleaned_json')
        .eq('id', recipeId)
        .maybeSingle()
      data = fallback.data as typeof data
      error = fallback.error
      // Without processing columns, treat a non-empty recipe as ready.
      if (!error && data) {
        const cj = (data as { cleaned_json?: { ingredients?: unknown[] } | null }).cleaned_json
        const hasContent = Array.isArray(cj?.ingredients) && cj!.ingredients!.length > 0
        if (hasContent) return { status: 'ready', title: (data as { title?: string | null }).title ?? null }
      }
    } else if (!error && data) {
      const status = (data as { processing_status?: string }).processing_status
      if (status === 'ready') return { status: 'ready', title: (data as { title?: string | null }).title ?? null }
      if (status === 'error') {
        return {
          status: 'error',
          error: (data as { processing_error?: string | null }).processing_error ?? 'Import failed',
          title: (data as { title?: string | null }).title ?? null,
        }
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { status: 'error', error: 'Import timed out' }
}
