import { runLocalOcr } from './localOcr'
import { extractFastTriage, type FastTriageScan, type ScanKind } from './gemini'

/** Hard budget for the on-device OCR attempt before we give up and fall back to the cloud vision
 * pipeline — a slow/low-end phone should never make the user wait longer than this for nothing. */
export const TIMEOUT_MS = 1500

export type ScanCircuitResult =
  | { source: 'local'; rawText: string[] }
  | { source: 'cloud'; scan: FastTriageScan }

function toInlineImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ base64: String(reader.result), mimeType: file.type || 'image/jpeg' })
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function timeoutRejection(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    window.setTimeout(() => reject(new Error('local OCR timed out')), ms)
  })
}

/**
 * Local-first OCR circuit breaker for the stash scanner. Races on-device OCR (Tesseract.js — no
 * network round trip, no per-scan API cost) against a `TIMEOUT_MS` budget:
 *
 * - Local OCR wins (resolves with text within budget) → returns that raw text as-is, no cloud call
 *   made at all. This is the fast/cheap path.
 * - Local OCR loses the race (times out) or throws (engine failure, no text found, etc.) → the
 *   failure is swallowed silently (the user should never see a "local OCR failed" error, only a
 *   normal scan) and we fall back to the existing cloud (Gemini vision) extraction pipeline,
 *   which already knows how to turn an image directly into structured items.
 *
 * Pass `preloaded` when the caller already has a data-URL read of the file so the cloud fallback
 * does not re-read the same bytes via FileReader.
 */
export async function processScanWithFallback(
  imageFile: File,
  scanType: 'receipt' | 'ingredient',
  preloaded?: { base64: string; mimeType: string },
): Promise<ScanCircuitResult> {
  try {
    const rawText = await Promise.race([runLocalOcr(imageFile), timeoutRejection(TIMEOUT_MS)])
    if (!rawText.length) throw new Error('local OCR found no text')
    return { source: 'local', rawText }
  } catch {
    const scanKind: ScanKind = scanType
    const image = preloaded ?? (await toInlineImage(imageFile))
    const scan = await extractFastTriage(image, scanKind)
    return { source: 'cloud', scan }
  }
}
