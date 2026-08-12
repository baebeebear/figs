import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ImageUp, Info, Loader2, SwitchCamera, X } from 'lucide-react'
import {
  extractFastTriage,
  parseLiveFrame,
  structureRawOcrText,
  deepEnrichRawLine,
  type FastTriageScan,
  type LivePendingItem,
  type ScanKind,
} from '../../lib/gemini'
import { processScanWithFallback } from '../../lib/scanCircuitBreaker'
import { resolveLiveScanButton } from '../../lib/liveScan'
import { inferStashCategory, suggestZoneForCategory } from '../../lib/stashCategories'
import { reorganizeStashItem } from '../../lib/stashTaxonomy'
import { supabase } from '../../services/supabase'
import { persistReceiptImageForLog } from '../../lib/receiptStorage'
import type { NewStashItemInput } from '../../lib/stash'
import ReceiptReviewPage, { type ReviewLine, type ReceiptGroupMeta } from './ReceiptReviewPage'
import { useWakeLock } from '../../hooks/useWakeLock'
import { clearScrapeJob, createScrapeJobId, updateScrapeJob, writeScrapeJob } from '../../lib/scrapeJobStorage'

type Props = {
  userId: string
  onClose: () => void
  onAddItems: (items: NewStashItemInput[]) => Promise<void>
  onAdded?: () => void
  createReceiptLog: (input: {
    merchantName: string | null
    purchasedAt: string | null
    totalAmount: number | null
    rawOcrJson: unknown
  }) => Promise<string | null>
}

type Pill = LivePendingItem & { id: string }
type SessionItem = { name: string; quantity: number; unit: string }

const LIVE_TICK_MS = 2000
/** No useful detection for this long → drop lock and enter try-again. */
const IDLE_REDETECT_MS = 6000
/** Max concurrent multi-photo OCR/triage jobs — keeps device/network load bounded. */
const FILE_UPLOAD_CONCURRENCY = 3
const MERCHANT_FALLBACK: Record<ScanKind, string | null> = { receipt: null, stash: 'Pantry scan', ingredient: 'Item scan' }
const TOP_INSTRUCTIONS = 'Point at a receipt, shelf, or item'

/** Infer a ScanKind candidate from text density + model context (never locks on a single signal). */
function candidateFromFrame(result: {
  textDensity: 'none' | 'few' | 'many' | null
  detectedContext: ScanKind | null
  hasHeader: boolean
  hasFooter: boolean
  items: unknown[]
}): ScanKind | null {
  if (result.textDensity === 'many' || result.detectedContext === 'receipt' || result.hasHeader || result.hasFooter) {
    return 'receipt'
  }
  if (result.textDensity === 'few' || result.detectedContext === 'ingredient') {
    return 'ingredient'
  }
  if (result.textDensity === 'none' || result.detectedContext === 'stash') {
    return 'stash'
  }
  // Fallback from item count when density/context are null.
  if (result.items.length >= 4) return 'receipt'
  if (result.items.length >= 1 && result.items.length <= 2) return 'ingredient'
  return null
}

let keyCounter = 0
function nextKey() {
  keyCounter += 1
  return `line-${keyCounter}`
}

/** Runs `fn` over `items` with at most `concurrency` in flight; results keep input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next
      next += 1
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function emptyLine(name: string, quantity: number, unit: string, category: string, receiptGroupId: string): ReviewLine {
  return { key: nextKey(), name, quantity, unit, category, receiptGroupId }
}


/**
 * Live-camera scan/capture — a single "Scan / Capture" entry point. The camera runs continuously:
 * every ~2s a frame is classified by word density (none → stash, few → ingredient, many → receipt
 * hunt). Modes lock only after two consecutive agreeing ticks. Receipt needs header then footer
 * before the action button lights up. Idle ~6s with no progress returns to try-again so the user
 * can restart detection.
 */
export default function ScanCaptureSheet({ userId, onClose, onAddItems, onAdded, createReceiptLog }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const capturedImageRef = useRef<{ base64: string; mimeType: string } | null>(null)
  const lastFrameRef = useRef<{ base64: string; mimeType: string } | null>(null)
  const parseInFlight = useRef(false)
  const rejectedNamesRef = useRef<Set<string>>(new Set())
  const sessionNamesRef = useRef<Set<string>>(new Set())
  const pendingContextRef = useRef<ScanKind | null>(null)
  const lastProgressAtRef = useRef(Date.now())

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [cameraKey, setCameraKey] = useState(0)
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'denied'>('starting')
  const [stage, setStage] = useState<'live' | 'processing' | 'review' | 'try-again'>('live')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [lines, setLines] = useState<ReviewLine[]>([])
  const [receiptGroupMetas, setReceiptGroupMetas] = useState<ReceiptGroupMeta[]>([])
  const [infoOpen, setInfoOpen] = useState(false)

  const [lockedMode, setLockedMode] = useState<ScanKind | null>(null)
  const [pendingPills, setPendingPills] = useState<Pill[]>([])
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([])
  const [hasHeader, setHasHeader] = useState(false)
  const [hasFooter, setHasFooter] = useState(false)
  const { requestWakeLock, releaseWakeLock } = useWakeLock()
  const receiptJobIdRef = useRef<string | null>(null)

  const beginReceiptJob = () => {
    const id = createScrapeJobId()
    receiptJobIdRef.current = id
    writeScrapeJob({
      id,
      kind: 'receipt',
      status: 'Reading receipt…',
      startedAt: Date.now(),
      inFlight: true,
    })
    void requestWakeLock()
  }

  const endReceiptJob = (ok: boolean) => {
    if (receiptJobIdRef.current) {
      updateScrapeJob({ inFlight: false, status: ok ? 'Review ready' : 'Failed' })
      if (ok) clearScrapeJob()
    }
    receiptJobIdRef.current = null
    void releaseWakeLock()
  }

  const bgExtractionRef = useRef<{ frame: { base64: string; mimeType: string }; promise: Promise<FastTriageScan> } | null>(null)
  const enrichedCacheRef = useRef<
    Map<string, { name: string; brand: string | null; category: string; utilityTags: string[]; attributes: string[]; zone?: string }>
  >(new Map())

  /** Counter incremented per capture — used to stamp a unique receiptGroupId on each batch. */
  const receiptGroupCounterRef = useRef(0)
  /** Names already present in any receipt group — used to deduplicate across multiple scans. */
  const existingGroupNamesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    sessionNamesRef.current = new Set(sessionItems.map((i) => i.name.toLowerCase()))
  }, [sessionItems])

  // Fire background enrichment for all lines while the user views the receipt review page
  useEffect(() => {
    if (stage !== 'review' || !lines.length) return
    lines.forEach((line) => {
      if (enrichedCacheRef.current.has(line.key)) return
      void (async () => {
        const enriched = await deepEnrichRawLine(line.name)
        if (enriched) {
          enrichedCacheRef.current.set(line.key, {
            name: enriched.productName,
            brand: enriched.brandName,
            category: enriched.category,
            utilityTags: enriched.utilityTags,
            attributes: enriched.attributes,
            zone: enriched.suggestedLocation ? String(enriched.suggestedLocation).toLowerCase() : undefined,
          })
        }
      })()
    })
  }, [stage, lines])

  useEffect(() => {
    let cancelled = false
    setCameraState('starting')
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCameraState('ready')
      } catch {
        if (!cancelled) setCameraState('denied')
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [facingMode, cameraKey])

  const grabFrame = (quality = 0.7): { base64: string; mimeType: string } | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || cameraState !== 'ready') return null
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return { base64: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg' }
  }

  const lockIn = (context: ScanKind) => {
    setLockedMode(context)
    lastProgressAtRef.current = Date.now()
    if (context === 'receipt') {
      setPendingPills([])
      setSessionItems([])
    }
  }

  const enterTryAgain = () => {
    setLockedMode(null)
    setPendingPills([])
    setSessionItems([])
    setHasHeader(false)
    setHasFooter(false)
    pendingContextRef.current = null
    bgExtractionRef.current = null
    parseInFlight.current = false
    setStage('try-again')
  }

  const restartSearching = () => {
    setError('')
    setLockedMode(null)
    setPendingPills([])
    setSessionItems([])
    setHasHeader(false)
    setHasFooter(false)
    pendingContextRef.current = null
    bgExtractionRef.current = null
    lastProgressAtRef.current = Date.now()
    setStage('live')
    setCameraKey((k) => k + 1)
  }

  // Continuous live-parse loop — only while camera is up and we're on the live stage.
  useEffect(() => {
    if (stage !== 'live' || cameraState !== 'ready') return
    lastProgressAtRef.current = Date.now()
    const id = window.setInterval(() => {
      void (async () => {
        if (parseInFlight.current) return
        const frame = grabFrame(0.55)
        if (!frame) return
        parseInFlight.current = true
        lastFrameRef.current = frame
        try {
          const excluded = [...sessionNamesRef.current, ...rejectedNamesRef.current]
          const result = await parseLiveFrame(frame, lockedMode, excluded)
          if (result.hasHeader) setHasHeader(true)
          if (result.hasFooter) setHasFooter(true)

          const candidate = candidateFromFrame(result)
          const madeProgress =
            Boolean(candidate) ||
            result.items.length > 0 ||
            result.hasHeader ||
            result.hasFooter ||
            (lockedMode === 'receipt' && (hasHeader || hasFooter || result.hasHeader || result.hasFooter))

          if (madeProgress) lastProgressAtRef.current = Date.now()

          if (!lockedMode && candidate) {
            // All modes (including receipt) need two consecutive agreeing ticks.
            if (pendingContextRef.current === candidate) {
              lockIn(candidate)
            } else {
              pendingContextRef.current = candidate
            }
          } else if (lockedMode && candidate && candidate !== lockedMode) {
            // Switching modes also requires two agreeing ticks — never steal on one false positive.
            if (pendingContextRef.current === candidate) {
              lockIn(candidate)
            } else {
              pendingContextRef.current = candidate
            }
          } else if (lockedMode && candidate === lockedMode) {
            pendingContextRef.current = lockedMode
          }

          const receiptActive =
            lockedMode === 'receipt' ||
            (pendingContextRef.current === 'receipt' && candidate === 'receipt')
          if (receiptActive && !bgExtractionRef.current && (result.hasHeader || result.hasFooter || lockedMode === 'receipt')) {
            bgExtractionRef.current = {
              frame,
              promise: extractFastTriage(frame, 'receipt'),
            }
          }

          if (lockedMode !== 'receipt') {
            setPendingPills(
              result.items
                .filter((it) => !sessionNamesRef.current.has(it.name.toLowerCase()) && !rejectedNamesRef.current.has(it.name.toLowerCase()))
                .map((it) => ({ ...it, id: it.name.toLowerCase() })),
            )
          }

          if (Date.now() - lastProgressAtRef.current >= IDLE_REDETECT_MS) {
            enterTryAgain()
          }
        } catch {
          if (Date.now() - lastProgressAtRef.current >= IDLE_REDETECT_MS) {
            enterTryAgain()
          }
        } finally {
          parseInFlight.current = false
        }
      })()
    }, LIVE_TICK_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cameraState, lockedMode])

  const verifyPill = (pill: Pill) => {
    lastProgressAtRef.current = Date.now()
    setSessionItems((prev) => [...prev.filter((i) => i.name.toLowerCase() !== pill.name.toLowerCase()), { name: pill.name, quantity: pill.quantity, unit: pill.unit }])
    setPendingPills((prev) => prev.filter((p) => p.id !== pill.id))
  }
  const dismissPill = (pill: Pill) => {
    rejectedNamesRef.current.add(pill.name.toLowerCase())
    setPendingPills((prev) => prev.filter((p) => p.id !== pill.id))
  }

  /** Folds a fast-triage result into the review list — the shared tail end of every extraction
   * path. Stamps a new receiptGroupId on each call and deduplicates item names against everything
   * already in previous groups so the same product isn't double-counted across scans. */
  const applyTriage = (triage: FastTriageScan, _mode: ScanKind) => {
    const groupId = `grp-${++receiptGroupCounterRef.current}`
    setReceiptGroupMetas((prev) => [...prev, { id: groupId, merchantName: triage.merchantName, purchasedAt: triage.purchasedAt }])

    // Deduplicate: skip items whose name already exists in a previous receipt group.
    const existing = existingGroupNamesRef.current
    const newItems = triage.items.filter((l) => !existing.has(l.name.toLowerCase()))
    newItems.forEach((l) => existing.add(l.name.toLowerCase()))

    const initialLines = newItems.map((l) => emptyLine(l.name, l.quantity, l.unit, l.category, groupId))
    setLines((prev) => [...prev, ...initialLines])
  }



  /** Same as `appendExtraction`, but for an uploaded file — routes through the local-first OCR
   * circuit breaker first (on-device Tesseract, no network round trip) when the mode supports it,
   * only falling back to the cloud vision call if local OCR is too slow, errors, or the mode is
   * "stash" (a shelf/fridge photo isn't primarily text — vision extraction is the right tool).
   *
   * Returns triage without applying it so multi-photo uploads can merge results in file order.
   * Passes the already-read data URL into the circuit breaker so OCR timeout fallback does not
   * re-read the file. */
  const extractFromFile = async (file: File, base64: string, mimeType: string): Promise<FastTriageScan> => {
    let mode = lockedMode
    if (!mode) {
      const peek = await parseLiveFrame({ base64, mimeType }, null, [])
      mode = candidateFromFrame(peek) ?? 'stash'
      lockIn(mode)
    }

    if (mode !== 'receipt' && mode !== 'ingredient') {
      return extractFastTriage({ base64, mimeType }, mode)
    }
    const result = await processScanWithFallback(file, mode, { base64, mimeType })
    return result.source === 'local' ? structureRawOcrText(result.rawText, mode) : result.scan
  }

  /** Confirms the live-collected session items (stash/ingredient) straight into the review page —
   * no extra image round-trip needed since the live loop already gave us name/qty/unit. Nutrition
   * fills in automatically after insert; attributes/category stay user-editable in the review list. */
  const finalizeFromSession = () => {
    capturedImageRef.current = lastFrameRef.current
    const groupId = `grp-${++receiptGroupCounterRef.current}`
    const merchantLabel = lockedMode ? MERCHANT_FALLBACK[lockedMode] : null
    setReceiptGroupMetas((prev) => [...prev, { id: groupId, merchantName: merchantLabel, purchasedAt: new Date().toISOString() }])
    const initialLines = sessionItems.map((it) => emptyLine(it.name, it.quantity, it.unit, inferStashCategory(it.name), groupId))
    setLines((prev) => [...prev, ...initialLines])
    setSessionItems([])
    setPendingPills([])
    setStage('review')
  }

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const onActionTap = async () => {
    stopStream()
    setStage('processing')
    setError('')
    beginReceiptJob()
    if (lockedMode === 'receipt' || bgExtractionRef.current) {
      try {
        let triage: FastTriageScan
        if (bgExtractionRef.current) {
          setStatus('Finalizing receipt…')
          updateScrapeJob({ status: 'Finalizing receipt…' })
          capturedImageRef.current = bgExtractionRef.current.frame
          triage = await bgExtractionRef.current.promise
        } else {
          const frame = lastFrameRef.current ?? grabFrame(0.85)
          if (!frame) throw new Error('Could not read the receipt.')
          capturedImageRef.current = frame
          triage = await extractFastTriage(frame, 'receipt', (msg) => {
            setStatus(msg)
            updateScrapeJob({ status: msg })
          })
        }
        applyTriage(triage, 'receipt')
        setStage('review')
        endReceiptJob(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read that photo.')
        endReceiptJob(false)
        enterTryAgain()
      } finally {
        setStatus('')
        bgExtractionRef.current = null
      }
    } else {
      finalizeFromSession()
      endReceiptJob(true)
    }
  }

  const handleFiles = async (files: File[]) => {
    if (!files.length) return
    stopStream()
    setStage('processing')
    setError('')
    beginReceiptJob()
    const total = files.length
    let completed = 0
    const updateProgress = () => {
      if (total <= 1) {
        setStatus('Reading photo…')
        updateScrapeJob({ status: 'Reading photo…' })
        return
      }
      const msg = `Reading photos… ${completed} of ${total}`
      setStatus(msg)
      updateScrapeJob({ status: msg })
    }
    updateProgress()

    type FileResult = { triage: FastTriageScan; base64: string; mimeType: string } | null
    const results = await mapWithConcurrency(files, FILE_UPLOAD_CONCURRENCY, async (file): Promise<FileResult> => {
      try {
        const base64 = await readFileAsDataUrl(file)
        const mimeType = file.type || 'image/jpeg'
        const triage = await extractFromFile(file, base64, mimeType)
        completed += 1
        updateProgress()
        return { triage, base64, mimeType }
      } catch (e) {
        completed += 1
        updateProgress()
        setError(e instanceof Error ? e.message : 'Could not read that photo.')
        return null
      }
    })

    // Merge in original file order so receipt groups match upload order.
    const mode: ScanKind = lockedMode ?? 'stash'
    for (const result of results) {
      if (!result) continue
      capturedImageRef.current = { base64: result.base64, mimeType: result.mimeType }
      applyTriage(result.triage, mode)
    }

    setStatus('')
    if (results.some(Boolean)) {
      setStage('review')
      endReceiptJob(true)
    } else {
      endReceiptJob(false)
      enterTryAgain()
    }
  }

  /** Reopens the live camera without losing what's already in the review list — for "scan more"
   * from the review page. Distinct from `onBack`, which fully resets the session. */
  const continueScanning = () => {
    setError('')
    setSessionItems([])
    setPendingPills([])
    setHasHeader(false)
    setHasFooter(false)
    setLockedMode(null)
    rejectedNamesRef.current = new Set()
    pendingContextRef.current = null
    bgExtractionRef.current = null
    lastProgressAtRef.current = Date.now()
    setStage('live')
    setCameraKey((k) => k + 1)
  }

  const backToCamera = () => {
    setLines([])
    setReceiptGroupMetas([])
    receiptGroupCounterRef.current = 0
    existingGroupNamesRef.current = new Set()
    setError('')
    capturedImageRef.current = null
    setLockedMode(null)
    continueScanning()
  }

  const confirm = async (finalLines: ReviewLine[]) => {
    // Build per-group receipt logs so each scanned receipt gets its own log entry.
    const groupMap = new Map<string, ReviewLine[]>()
    for (const line of finalLines) {
      const g = groupMap.get(line.receiptGroupId) ?? []
      g.push(line)
      groupMap.set(line.receiptGroupId, g)
    }

    const groupEntries = [...groupMap.entries()]
    // Create all receipt_log rows in parallel, then bulk-insert stash items once.
    const receiptIds = await Promise.all(
      groupEntries.map(async ([groupId, groupLines]) => {
        const meta = receiptGroupMetas.find((m) => m.id === groupId)
        return createReceiptLog({
          merchantName: meta?.merchantName ?? null,
          purchasedAt: meta?.purchasedAt ?? null,
          totalAmount: null,
          rawOcrJson: { items: groupLines },
        })
      }),
    )

    const allItems: NewStashItemInput[] = []
    let firstReceiptId: string | null = null
    groupEntries.forEach(([_, groupLines], gi) => {
      const receiptId = receiptIds[gi]
      firstReceiptId = firstReceiptId ?? receiptId
      for (const l of groupLines) {
        const bgEnriched = enrichedCacheRef.current.get(l.key)
        const fallback = reorganizeStashItem(l.name, l.category)
        const cleanName = bgEnriched?.name ?? fallback.name
        const brand = bgEnriched?.brand ?? fallback.brand
        const rawCategory = bgEnriched?.category ?? l.category
        const category = rawCategory !== 'pantry staples' && rawCategory !== 'other'
          ? rawCategory
          : inferStashCategory(cleanName)
        const zone = (bgEnriched?.zone === 'fridge' || bgEnriched?.zone === 'freezer' || bgEnriched?.zone === 'pantry')
          ? bgEnriched.zone
          : suggestZoneForCategory(category, cleanName)

        allItems.push({
          name: cleanName,
          brand,
          quantity: l.quantity,
          unit: l.unit,
          category,
          utilityTags: bgEnriched?.utilityTags ?? fallback.utilityTags,
          attributes: bgEnriched?.attributes ?? fallback.attributes,
          zone,
          receiptId,
        })
      }
    })

    // Persist the captured image for the first receipt in the session.
    if (firstReceiptId && capturedImageRef.current && supabase) {
      void persistReceiptImageForLog(supabase, userId, firstReceiptId, capturedImageRef.current.base64, capturedImageRef.current.mimeType)
    }

    await onAddItems(allItems)
    onAdded?.()
    onClose()
  }

  if (stage === 'review') {
    return (
      <ReceiptReviewPage
        lines={lines}
        onLinesChange={setLines}
        editable
        scanKind={lockedMode ?? undefined}
        receiptGroups={receiptGroupMetas}
        onBack={backToCamera}
        onScanMore={continueScanning}
        onConfirm={confirm}
      />
    )
  }

  const buttonState = resolveLiveScanButton({
    scanKind: lockedMode,
    cameraReady: cameraState === 'ready',
    processing: stage === 'processing',
    tryAgain: stage === 'try-again',
    verifiedCount: sessionItems.length,
    hasHeader,
    hasFooter,
  })

  const handleHeaderClose = () => {
    if (lines.length > 0) {
      setStage('review')
    } else {
      onClose()
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[220] flex flex-col overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) void handleFiles(files)
        }}
      />
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {stage === 'processing' ? (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 40%, #241a3a 0%, #120d22 70%)' }} />
      ) : (
        <>
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
          {cameraState !== 'ready' || stage === 'try-again' ? (
            <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 40%, #241a3a 0%, #120d22 70%)' }} />
          ) : null}
        </>
      )}

      <div
        className="absolute inset-x-0 top-0 z-[2] flex items-center justify-between px-5"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
      >
        <button type="button" onClick={handleHeaderClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center border-0 bg-transparent p-0 text-white">
          <X size={24} strokeWidth={2.2} />
        </button>
        <span className="min-w-0 flex-1 px-2 text-center font-ui text-[12.5px] font-medium text-white/80">{TOP_INSTRUCTIONS}</span>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label="How scanning works"
          className="flex h-10 w-10 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-white"
        >
          <Info size={20} strokeWidth={2} />
        </button>
      </div>

      {stage === 'try-again' ? (
        <div className="absolute inset-x-0 top-1/2 z-[2] -translate-y-1/2 px-8 text-center">
          <p className="font-ui text-[14px] font-semibold text-white">Nothing detected</p>
          <p className="mt-1.5 font-ui text-[12.5px] text-white/70">Tap below to scan again — receipt, shelf, or item.</p>
        </div>
      ) : null}

      {stage === 'live' && cameraState === 'ready' ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
            <div className="relative h-[64%] w-[68%] max-w-md">
              <span className="absolute left-0 top-0 h-7 w-7 border-l border-t border-white/90" />
              <span className="absolute right-0 top-0 h-7 w-7 border-r border-t border-white/90" />
              <span className="absolute bottom-0 left-0 h-7 w-7 border-b border-l border-white/90" />
              <span className="absolute bottom-0 right-0 h-7 w-7 border-b border-r border-white/90" />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 z-[3]">
            <AnimatePresence>
              {pendingPills.map((pill) => (
                <motion.div
                  key={pill.id}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${pill.x * 100}%`, top: `${pill.y * 100}%` }}
                >
                  <div className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/60 py-1.5 pl-3 pr-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-md">
                    <button type="button" onClick={() => verifyPill(pill)} className="border-0 bg-transparent p-0 font-ui text-[12.5px] font-semibold text-white">
                      {pill.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Dismiss ${pill.name}`}
                      onClick={() => dismissPill(pill)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-0 bg-white/15 text-white"
                    >
                      <X size={11} strokeWidth={2.4} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="absolute inset-x-0 bottom-[112px] z-[2] flex items-center justify-center gap-1.5 px-6 text-center">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white/80" />
            </span>
            <span className="font-ui text-[12px] font-medium text-white/75">{buttonState.status}</span>
          </div>
        </>
      ) : null}

      {cameraState === 'denied' && stage === 'live' ? (
        <div className="absolute inset-x-0 top-1/2 z-[2] -translate-y-1/2 px-8 text-center">
          <p className="font-ui text-[14px] font-semibold text-white">Camera access needed</p>
          <p className="mt-1.5 font-ui text-[12.5px] text-white/70">Allow camera access, or choose a photo instead.</p>
        </div>
      ) : null}

      {stage === 'processing' ? (
        <div className="absolute inset-x-0 top-1/2 z-[2] flex -translate-y-1/2 items-center justify-center gap-2 px-6 text-center">
          <Loader2 size={16} className="animate-spin text-white/85" />
          <span className="font-ui text-[13px] font-medium text-white/85">{status || 'Reading photo…'}</span>
        </div>
      ) : error ? (
        <div className="absolute inset-x-0 bottom-[130px] z-[2] px-8 text-center">
          <span className="font-ui text-[12.5px] font-medium text-[#e8a08a]">{error}</span>
        </div>
      ) : null}

      {stage !== 'processing' ? (
        <div className="absolute inset-x-0 bottom-0 z-[2] flex items-center justify-between gap-4 px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Choose photos"
            className="flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent text-white"
          >
            <ImageUp size={22} strokeWidth={2} />
          </button>

          <div className="flex flex-1 justify-center">
            <button
              type="button"
              disabled={buttonState.disabled}
              onClick={() => {
                if (stage === 'try-again') {
                  restartSearching()
                  return
                }
                void onActionTap()
              }}
              className="rounded-full bg-white px-7 py-3.5 font-ui text-sm font-semibold text-[#1A0D40] shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition active:scale-[0.98] disabled:bg-white/25 disabled:text-white/60"
            >
              {buttonState.label}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            aria-label="Switch camera"
            className="flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent text-white"
          >
            <SwitchCamera size={22} strokeWidth={2} />
          </button>
        </div>
      ) : null}

      {infoOpen ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm" onClick={() => setInfoOpen(false)}>
          <div
            className="w-full max-w-xs rounded-[22px] p-5 text-white"
            style={{ background: 'linear-gradient(165deg, #1A0D40 0%, #12082E 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-editorial text-[18px] font-semibold">How scanning works</p>
            <p className="mt-1.5 font-ui text-[13px] leading-snug text-white/70">
              Point at anything food-related — figs figures out what it's looking at.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <span className="text-[16px]">📄</span>
                <p className="font-ui text-[13px] leading-snug text-white/90">Receipts — pan slowly from the top to the total.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[16px]">🥫</span>
                <p className="font-ui text-[13px] leading-snug text-white/90">Items — frame the label or name clearly.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[16px]">🧊</span>
                <p className="font-ui text-[13px] leading-snug text-white/90">Shelves — pan slowly across the fridge or pantry.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              className="mt-5 h-[44px] w-full rounded-full bg-white font-ui text-[13.5px] font-semibold text-[#1A0D40] transition active:scale-[0.98]"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </motion.div>
  )
}
