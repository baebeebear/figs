/** Lightweight markup for recipe method steps — kept inside the existing `steps: string[]` shape
 * (no schema change, fully backward compatible with plain-text steps written before this existed).
 * A step's raw string can be:
 *   - a heading/line divider:  "## Section title"
 *   - a standalone image:      "![](https://...)"
 *   - normal instruction text, optionally containing inline tokens:
 *       **bold**, *italic*, <u>underline</u>, [link text](url),
 *       {{Ingredient Name}} or {{@2:Garlic}} (index-linked) or {{Name|notes}}
 */

export type StepToken =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'underline'; text: string }
  | { kind: 'link'; text: string; url: string }
  | { kind: 'ingredient'; name: string; notes?: string; index?: number }

export type ParsedStep = { kind: 'heading'; text: string } | { kind: 'image'; url: string } | { kind: 'text'; tokens: StepToken[] }

const INLINE_RE =
  /\{\{(?:@(\d+):)?([^}|]+)(?:\|([^}]*))?\}\}|\*\*([^*]+)\*\*|<u>([^<]+)<\/u>|\[([^\]]+)\]\(([^)]+)\)|\*([^*]+)\*/g

/** Repair nested/orphan brace artifacts left by older auto-linkers (e.g. `{{{{@0:Garlic}}}}` → `{{@0:Garlic}}`). */
export function sanitizeStepText(raw: string): string {
  let s = String(raw ?? '')
  // Unwrap nested ingredient tokens: {{outer {{@0:Garlic}} more}} → {{@0:Garlic}}
  for (let i = 0; i < 8; i++) {
    const next = s.replace(/\{\{[^{}]*\{\{([^{}]+)\}\}[^{}]*\}\}/g, '{{$1}}')
    if (next === s) break
    s = next
  }
  // Collapse accidental double-wrapping: {{{{…}}}} → {{…}}
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/\{\{\{\{([^{}]+)\}\}\}\}/g, '{{$1}}')
    if (next === s) break
    s = next
  }
  // Strip orphan closing braces that sit right after a valid token
  s = s.replace(/(\{\{(?:@\d+:)?[^}|]+(?:\|[^}]*)?\}\})\}+/g, '$1')
  // Strip orphan opening braces that sit right before a valid token
  s = s.replace(/\{+(\{\{(?:@\d+:)?[^}|]+(?:\|[^}]*)?\}\})/g, '$1')
  // Collapse leftover brace runs
  s = s.replace(/\{{3,}/g, '{{').replace(/\}{3,}/g, '}}')
  return s
}

export function tokenizeStepText(raw: string): StepToken[] {
  const tokens: StepToken[] = []
  let lastIndex = 0
  for (const match of raw.matchAll(INLINE_RE)) {
    const index = match.index ?? 0
    if (index > lastIndex) tokens.push({ kind: 'text', text: raw.slice(lastIndex, index) })
    const [, indexRaw, ingredientName, ingredientNotes, boldText, underlineText, linkText, linkUrl, italicText] = match
    if (ingredientName != null) {
      let name = ingredientName.trim()
      let notes: string | undefined = ingredientNotes?.trim() || undefined
      // Legacy: {{Name, notes: foo}} or {{Name|notes}}
      if (!notes && /,\s*notes?:/i.test(name)) {
        const parts = name.split(/,?\s*notes?:/i)
        name = parts[0].trim()
        notes = parts.slice(1).join(':').trim() || undefined
      }
      const ingredientIndex = indexRaw != null && indexRaw !== '' ? Number(indexRaw) : undefined
      tokens.push({
        kind: 'ingredient',
        name,
        notes,
        index: Number.isFinite(ingredientIndex) ? ingredientIndex : undefined,
      })
    } else if (boldText != null) tokens.push({ kind: 'bold', text: boldText })
    else if (underlineText != null) tokens.push({ kind: 'underline', text: underlineText })
    else if (linkText != null) tokens.push({ kind: 'link', text: linkText, url: linkUrl })
    else if (italicText != null) tokens.push({ kind: 'italic', text: italicText })
    lastIndex = index + match[0].length
  }
  if (lastIndex < raw.length) tokens.push({ kind: 'text', text: raw.slice(lastIndex) })
  return tokens
}

export function parseStep(raw: string): ParsedStep {
  const trimmed = sanitizeStepText(raw).trim()
  const imageMatch = trimmed.match(/^!\[\]\(([^)]+)\)$/)
  if (imageMatch) return { kind: 'image', url: imageMatch[1] }
  if (trimmed.startsWith('## ')) return { kind: 'heading', text: trimmed.slice(3).trim() }
  return { kind: 'text', tokens: tokenizeStepText(sanitizeStepText(raw)) }
}

/** Plain-text projection of a step (strips markup) — used for the ingredient-mention check and
 * for step-index numbering decisions. */
export function stepPlainText(raw: string): string {
  const parsed = parseStep(raw)
  if (parsed.kind === 'heading') return parsed.text
  if (parsed.kind === 'image') return ''
  return parsed.tokens
    .map((t) =>
      'text' in t ? t.text : t.kind === 'ingredient' ? (t.notes ? `${t.name} (${t.notes})` : t.name) : '',
    )
    .join('')
}

export function makeHeadingStep(text: string): string {
  return `## ${text}`
}

export function makeImageStep(url: string): string {
  return `![](${url})`
}

export function makeIngredientToken(name: string, notes?: string, index?: number): string {
  const body = notes ? `${name}|${notes}` : name
  if (index != null && Number.isFinite(index) && index >= 0) return `{{@${index}:${body}}}`
  return `{{${body}}}`
}

function normalizeMatchKey(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''′]/g, "'")
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[^a-z0-9'\s\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function singularizeWord(w: string): string {
  if (w.length <= 3) return w
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`
  if (w.endsWith('oes') || w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes')) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1)
  return w
}

const PREP_PREFIX_RE =
  /^(fresh|dried|frozen|minced|chopped|sliced|diced|ground|grated|crushed|peeled|seeded|boneless|skinless|whole|organic|unsalted|salted|large|small|medium|extra\s+virgin|finely|roughly|thinly)\s+/i

/** Count nouns at the end of grocery names — "garlic cloves" should also match "garlic". */
const TRAILING_FORM_WORDS = new Set([
  'clove',
  'cloves',
  'leaf',
  'leaves',
  'sprig',
  'sprigs',
  'stick',
  'sticks',
  'slice',
  'slices',
  'piece',
  'pieces',
  'fillet',
  'fillets',
  'breast',
  'breasts',
  'thigh',
  'thighs',
  'wing',
  'wings',
  'rib',
  'ribs',
  'stalk',
  'stalks',
  'bunch',
  'bunches',
  'head',
  'heads',
  'bulb',
  'bulbs',
  'pod',
  'pods',
  'kernel',
  'kernels',
  'wedge',
  'wedges',
  'strip',
  'strips',
  'cube',
  'cubes',
  'chunk',
  'chunks',
  'ring',
  'rings',
  'steak',
  'steaks',
  'chop',
  'chops',
  'cutlet',
  'cutlets',
  'rasher',
  'rashers',
  'loaf',
  'loaves',
])

/** Build match phrases for one ingredient so steps can say "olive oil" while the list has "extra virgin olive oil". */
export function ingredientMatchPhrases(name: string): string[] {
  const base = normalizeMatchKey(name)
  if (!base || base.length < 2) return []
  const out = new Set<string>([base])
  let stripped = base
  for (let i = 0; i < 4; i++) {
    const next = stripped.replace(PREP_PREFIX_RE, '').trim()
    if (!next || next === stripped) break
    stripped = next
    out.add(stripped)
  }
  const words = stripped.split(' ').filter(Boolean)
  if (words.length >= 2) {
    out.add(words.slice(-2).join(' '))
    const last = words[words.length - 1]
    if (last.length >= 4) out.add(last)
    // "garlic cloves" → also match "garlic"
    if (TRAILING_FORM_WORDS.has(last) && words.length >= 2) {
      out.add(words.slice(0, -1).join(' '))
    }
  }
  for (const phrase of [...out]) {
    const parts = phrase.split(' ')
    const last = parts[parts.length - 1]
    const sing = singularizeWord(last)
    if (sing !== last) out.add([...parts.slice(0, -1), sing].filter(Boolean).join(' '))
    if (!last.endsWith('s') && last.length >= 3) out.add([...parts.slice(0, -1), `${last}s`].filter(Boolean).join(' '))
  }
  return [...out].filter((p) => p.length >= 2).sort((a, b) => b.length - a.length || a.localeCompare(b))
}

/** True when two ingredient display names refer to the same grocery (prep / plural tolerant). */
export function ingredientNamesMatch(a: string, b: string): boolean {
  const na = normalizeMatchKey(a)
  const nb = normalizeMatchKey(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const phrasesB = new Set(ingredientMatchPhrases(b))
  return ingredientMatchPhrases(a).some((p) => phrasesB.has(p))
}

/** Unwrap existing {{…}} ingredient chips back to plain text so re-linking can assign fresh indices. */
function unwrapIngredientTokens(step: string): string {
  return step.replace(/\{\{(?:@\d+:)?([^}|]+)(?:\|[^}]*)?\}\}/g, '$1')
}

function escapeRegExp(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

/**
 * Insert `{{@i:Name}}` tokens for ingredient mentions in method steps.
 * Idempotent for existing `{{…}}` spans. Uses prep-stripped / singular-plural variants
 * so "garlic" links to "garlic cloves" and "olive oil" links to "extra virgin olive oil".
 */
export function autoLinkIngredientsInSteps(ingredients: { name: string }[], steps: string[]): string[] {
  if (!ingredients.length || !steps.length) return steps.map((s) => sanitizeStepText(s))

  const indexed = ingredients
    .map((i, index) => ({
      name: String(i.name ?? '').trim(),
      index,
      phrases: ingredientMatchPhrases(i.name),
    }))
    .filter((n) => n.name.length > 1 && n.phrases.length > 0)
    // Longest phrase first across all ingredients so "olive oil" wins over "oil".
    .sort((a, b) => (b.phrases[0]?.length ?? 0) - (a.phrases[0]?.length ?? 0) || b.name.length - a.name.length)

  if (!indexed.length) return steps.map((s) => sanitizeStepText(s))

  // Prefer unique phrases — shared short single-word heads (oil, salt) are blocked;
  // longer / multi-word phrases keep the first owner so "olive oil" still links.
  const phraseOwner = new Map<string, number>()
  for (const item of indexed) {
    for (const phrase of item.phrases) {
      if (!phraseOwner.has(phrase)) phraseOwner.set(phrase, item.index)
      else if (phraseOwner.get(phrase) !== item.index) {
        const shortHead = !phrase.includes(' ') && phrase.length <= 6
        if (shortHead) phraseOwner.set(phrase, -1)
      }
    }
  }

  return steps.map((step) => {
    // Clear stale chips so indices stay aligned with the current ingredient list.
    let current = unwrapIngredientTokens(sanitizeStepText(step))
    for (const { index, phrases } of indexed) {
      for (const phrase of phrases) {
        if (phraseOwner.get(phrase) !== index) continue
        const parts = current.split(/(\{\{[^{}]*\}\})/g)
        const hasLatin = /[a-zA-Z]/.test(phrase)
        const pattern = hasLatin
          ? new RegExp(`\\b(${escapeRegExp(phrase).replace(/\s+/g, '\\s+')})\\b`, 'gi')
          : new RegExp(`(${escapeRegExp(phrase)})`, 'g')
        current = parts
          .map((part) => {
            if (part.startsWith('{{') && part.endsWith('}}')) return part
            return part.replace(pattern, (_m, matched: string) => makeIngredientToken(matched, undefined, index))
          })
          .join('')
      }
    }
    return sanitizeStepText(current)
  })
}

/** Re-serialize tokens back into a step raw string (preserves markup). */
export function serializeStepTokens(tokens: StepToken[]): string {
  return tokens
    .map((t) => {
      switch (t.kind) {
        case 'text':
          return t.text
        case 'bold':
          return `**${t.text}**`
        case 'italic':
          return `*${t.text}*`
        case 'underline':
          return `<u>${t.text}</u>`
        case 'link':
          return `[${t.text}](${t.url})`
        case 'ingredient':
          return makeIngredientToken(t.name, t.notes, t.index)
        default:
          return ''
      }
    })
    .join('')
}

/** Rewrite ingredient tokens in steps when an ingredient is renamed or swapped. */
export function rewriteIngredientTokensInSteps(
  steps: string[],
  opts: { index: number; oldName: string; newName: string },
): string[] {
  const { index, oldName, newName } = opts
  if (!newName.trim()) return steps
  const escapedOld = oldName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const byIndex = new RegExp(`\\{\\{@${index}:([^}|]+)(\\|[^}]*)?\\}\\}`, 'g')
  const byName = new RegExp(`\\{\\{(${escapedOld})(\\|[^}]*)?\\}\\}`, 'gi')
  return steps.map((step) => {
    let s = step.replace(byIndex, (_m, _n, notes) => `{{@${index}:${newName}${notes ?? ''}}}`)
    s = s.replace(byName, (_m, _n, notes) => `{{@${index}:${newName}${notes ?? ''}}}`)
    return s
  })
}
