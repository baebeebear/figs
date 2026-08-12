import { createWorker } from 'tesseract.js'

/**
 * Runs OCR entirely on-device via Tesseract.js (WASM, no network round trip) — the "local vision
 * module" half of the scan circuit breaker. Returns raw recognized text lines, unstructured.
 * A fresh worker is spun up per call rather than kept warm — simplest correct thing for v0, and
 * avoids a long-lived worker leaking across unrelated scans.
 */
export async function runLocalOcr(imageFile: File): Promise<string[]> {
  const worker = await createWorker('eng')
  try {
    const {
      data: { text },
    } = await worker.recognize(imageFile)
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } finally {
    void worker.terminate()
  }
}
