/**
 * Fails fast if package.json is empty or invalid — avoids cryptic npm parse errors.
 * Usage: node scripts/assert-package-json.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(root, 'package.json')

let raw
try {
  raw = readFileSync(path, 'utf8')
} catch (e) {
  console.error(`[assert-package-json] Cannot read ${path}:`, e instanceof Error ? e.message : e)
  process.exit(1)
}

if (!raw || raw.trim().length < 50) {
  console.error('[assert-package-json] package.json is empty or truncated. Restore from package-lock.json / backup.')
  process.exit(1)
}

let pkg
try {
  pkg = JSON.parse(raw)
} catch (e) {
  console.error('[assert-package-json] package.json is not valid JSON:', e instanceof Error ? e.message : e)
  process.exit(1)
}

if (!pkg?.name || !pkg?.scripts || typeof pkg.scripts !== 'object') {
  console.error('[assert-package-json] package.json missing name or scripts.')
  process.exit(1)
}
