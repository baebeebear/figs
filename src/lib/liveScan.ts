import type { ScanKind } from './gemini'

export type LiveScanButtonState = {
  label: string
  disabled: boolean
  /** Short status line for the "Scanning…" indicator above the button — distinct from the
   * button's own label so the two can be shown in different places at once. */
  status: string
}

/** Pure — decides whether the bottom action button is lit up (ready to finalize) and what
 * it / the status line above it should say. */
export function resolveLiveScanButton(input: {
  scanKind: ScanKind | null
  cameraReady: boolean
  processing: boolean
  tryAgain: boolean
  verifiedCount: number
  hasHeader: boolean
  hasFooter: boolean
}): LiveScanButtonState {
  const { scanKind, cameraReady, processing, tryAgain, verifiedCount, hasHeader, hasFooter } = input

  if (processing) return { label: 'Processing…', disabled: true, status: 'Processing…' }
  if (!cameraReady) return { label: 'Starting camera…', disabled: true, status: 'Starting camera…' }
  if (tryAgain) return { label: 'Tap to scan again', disabled: false, status: 'Nothing detected — try again' }

  if (!scanKind) return { label: 'Point to scan', disabled: true, status: 'Scanning…' }

  if (scanKind === 'receipt') {
    if (hasHeader && hasFooter) return { label: 'Add receipt', disabled: false, status: 'Receipt ready' }
    if (hasHeader) return { label: 'Show the total…', disabled: true, status: 'Show me the total…' }
    if (hasFooter) return { label: 'Show the top…', disabled: true, status: 'Show me the top…' }
    return { label: 'Point at the receipt', disabled: true, status: 'Looking for receipt header & total…' }
  }

  if (scanKind === 'stash') {
    return verifiedCount > 0
      ? { label: 'Capture stash', disabled: false, status: `${verifiedCount} item${verifiedCount === 1 ? '' : 's'} found` }
      : { label: 'Point at your shelf', disabled: true, status: 'Scanning shelf…' }
  }

  // ingredient
  return verifiedCount > 0
    ? { label: 'Complete', disabled: false, status: `${verifiedCount} item${verifiedCount === 1 ? '' : 's'} found` }
    : { label: 'Point at an item', disabled: true, status: 'Scanning item…' }
}
