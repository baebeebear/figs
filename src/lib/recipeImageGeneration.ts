import type { SupabaseClient } from '@supabase/supabase-js'
import { invokeEdgeFunction } from './edgeFunctionInvoke'
import { uploadRecipeImage } from './recipeImageStorage'

const CLIENT_TIMEOUT_MS = 20000

function base64ToFile(base64: string, mimeType: string, filename: string): File {
  const clean = base64.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mimeType })
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise
      .then((v) => {
        clearTimeout(timer)
        resolve(v)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(null)
      })
  })
}

/** Generates an AI hero image (Imagen 4 Fast primary, Gemini flash-image fallback on the edge)
 * and uploads it to storage. Returns null on any failure within ~20s so callers fail open. */
export async function generateAndUploadRecipeHeroImage(
  sb: SupabaseClient,
  userId: string,
  recipeId: string,
  input: { title: string; description?: string | null; ingredients: string[] },
): Promise<string | null> {
  try {
    const result = await withTimeout(
      invokeEdgeFunction('generate-recipe-image', {
        recipeTitle: input.title,
        title: input.title,
        description: input.description ?? null,
        keyIngredients: input.ingredients,
        ingredients: input.ingredients,
      }),
      CLIENT_TIMEOUT_MS,
    )
    if (!result) return null
    const base64 = typeof result.base64 === 'string' ? result.base64 : null
    const mimeType = typeof result.mimeType === 'string' ? result.mimeType : 'image/jpeg'
    if (!base64) return null
    const file = base64ToFile(base64, mimeType, 'ai-hero')
    return await uploadRecipeImage(sb, userId, recipeId, 'hero', file)
  } catch (e) {
    console.warn('[recipeImageGeneration] failed', e)
    return null
  }
}
