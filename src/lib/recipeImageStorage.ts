import type { SupabaseClient } from '@supabase/supabase-js'

/** figsRv0.0 has no dedicated recipe-images bucket — reuses the shared "post-images" public
 * bucket (already policy-scoped to `{userId}/...` paths) rather than provisioning a new one. */
const BUCKET = 'post-images'

function extensionForMime(mimeType: string): string {
  const m = mimeType.toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('heic') || m.includes('heif')) return 'heic'
  return 'jpg'
}

/** Upload a recipe hero or method-step image. `slot` disambiguates multiple images on one
 * recipe (e.g. "hero", "step-3") so re-uploads overwrite in place instead of piling up. */
export async function uploadRecipeImage(sb: SupabaseClient, userId: string, recipeId: string, slot: string, file: File): Promise<string | null> {
  const ext = extensionForMime(file.type)
  const storagePath = `${userId}/recipes/${recipeId}/${slot}.${ext}`

  const { error } = await sb.storage.from(BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) {
    console.warn('[recipeImageStorage] upload', error.message)
    return null
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath)
  return pub.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : null
}

/** Upload a cookbook cover photo — same shared bucket, keyed by a client-generated id since a
 * cookbook cover can be picked before the cookbook row itself exists. */
export async function uploadCookbookCoverImage(sb: SupabaseClient, userId: string, coverId: string, file: File): Promise<string | null> {
  const ext = extensionForMime(file.type)
  const storagePath = `${userId}/cookbooks/${coverId}/cover.${ext}`

  const { error } = await sb.storage.from(BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) {
    console.warn('[recipeImageStorage] cookbook cover upload', error.message)
    return null
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath)
  return pub.publicUrl ? `${pub.publicUrl}?t=${Date.now()}` : null
}
