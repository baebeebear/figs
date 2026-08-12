import type { RecipeDraft } from './gemini'

export type ScrapeJobKind = 'link' | 'photos' | 'file' | 'receipt'

export type ScrapeJob = {
  id: string
  kind: ScrapeJobKind
  url?: string
  status: string
  startedAt: number
  draft?: RecipeDraft
  error?: string
  /** True while edge/OCR work is still in flight */
  inFlight: boolean
}

const STORAGE_KEY = 'figs-rv0-scrape-job'

/** In-memory fallback for Node/tests (and rare WebViews without localStorage). */
const memoryStore = new Map<string, string>()

function storageGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key)
  } catch {
    /* fall through */
  }
  return memoryStore.get(key) ?? null
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value)
      return
    }
  } catch {
    /* fall through */
  }
  memoryStore.set(key, value)
}

function storageRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  memoryStore.delete(key)
}

export function createScrapeJobId(): string {
  return `scrape_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function readScrapeJob(): ScrapeJob | null {
  try {
    const raw = storageGet(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ScrapeJob
    if (!parsed || typeof parsed !== 'object' || !parsed.id) return null
    return parsed
  } catch {
    return null
  }
}

export function writeScrapeJob(job: ScrapeJob): void {
  try {
    storageSet(STORAGE_KEY, JSON.stringify(job))
  } catch (e) {
    console.warn('[scrapeJobStorage] write failed', e)
  }
}

export function updateScrapeJob(patch: Partial<ScrapeJob>): ScrapeJob | null {
  const current = readScrapeJob()
  if (!current) return null
  const next = { ...current, ...patch }
  writeScrapeJob(next)
  return next
}

export function clearScrapeJob(): void {
  storageRemove(STORAGE_KEY)
}
