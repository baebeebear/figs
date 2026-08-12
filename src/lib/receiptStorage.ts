import type { SupabaseClient } from '@supabase/supabase-js'

const RECEIPTS_BUCKET = 'receipts'

export type ReceiptImageUpload = {
  publicUrl: string
  storagePath: string
}

function extensionForMime(mimeType: string): string {
  const m = mimeType.toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('heic') || m.includes('heif')) return 'heic'
  if (m.includes('pdf')) return 'pdf'
  return 'jpg'
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const clean = base64.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType || 'image/jpeg' })
}

/** Upload receipt scan to Supabase Storage (shared "receipts" bucket, same as figs_1.0). */
export async function uploadReceiptImage(
  sb: SupabaseClient,
  userId: string,
  receiptId: string,
  base64: string,
  mimeType: string,
): Promise<ReceiptImageUpload | null> {
  const ext = extensionForMime(mimeType)
  const storagePath = `${userId}/${receiptId}.${ext}`
  const blob = base64ToBlob(base64, mimeType || 'image/jpeg')

  const { error } = await sb.storage.from(RECEIPTS_BUCKET).upload(storagePath, blob, {
    upsert: true,
    contentType: mimeType || 'image/jpeg',
  })
  if (error) {
    console.warn('[receiptStorage] upload', error.message)
    return null
  }

  const { data: pub } = sb.storage.from(RECEIPTS_BUCKET).getPublicUrl(storagePath)
  if (pub.publicUrl) {
    return { publicUrl: `${pub.publicUrl}?t=${Date.now()}`, storagePath }
  }

  const { data: signed, error: signErr } = await sb.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)
  if (signErr || !signed?.signedUrl) {
    console.warn('[receiptStorage] signed url', signErr?.message)
    return { publicUrl: '', storagePath }
  }
  return { publicUrl: signed.signedUrl, storagePath }
}

/** Upload image bytes and persist URL on receipt_logs. */
export async function persistReceiptImageForLog(
  sb: SupabaseClient,
  userId: string,
  receiptId: string,
  base64: string,
  mimeType: string,
): Promise<string | null> {
  const uploaded = await uploadReceiptImage(sb, userId, receiptId, base64, mimeType)
  if (!uploaded) return null
  if (uploaded.publicUrl) {
    await sb.from('receipt_logs').update({ image_url: uploaded.publicUrl }).eq('id', receiptId).eq('user_id', userId)
  }
  return uploaded.publicUrl || null
}

/** Resolve display URL from a receipt row (public URL, falling back to a signed one). */
export async function resolveReceiptImageUrl(receipt: { image_url?: string | null }): Promise<string | null> {
  if (receipt.image_url?.trim()) return receipt.image_url.trim()
  return null
}
