import type { RecipeRow } from './recipes'
import type { CookbookRow } from './cookbooks'

export type MeOriginFilter = 'all' | 'created' | 'saved'
export type MeLayoutMode = 'grid' | 'list'
export type MeSortKey = 'recent' | 'opened' | 'cookTime' | 'alpha'
export type MeSortDirection = 'asc' | 'desc'
export type MeSortState = { key: MeSortKey; direction: MeSortDirection }

export function defaultMeSortState(): MeSortState {
  return { key: 'recent', direction: 'desc' }
}

export const RECIPE_SORT_OPTIONS: { key: MeSortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'opened', label: 'Recently opened' },
  { key: 'cookTime', label: 'Time to cook' },
  { key: 'alpha', label: 'Alphabetical' },
]

export const COOKBOOK_SORT_OPTIONS: { key: MeSortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'alpha', label: 'Alphabetical' },
]

export function sortRecipes(recipes: RecipeRow[], state: MeSortState, origin: MeOriginFilter = 'all', _userId?: string): RecipeRow[] {
  let filtered = recipes.filter((r) => {
    if (origin === 'created') return r.shelf_origin === 'created'
    if (origin === 'saved') return r.shelf_origin !== 'created'
    return true
  })

  const dir = state.direction === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    if (state.key === 'alpha') return dir * (a.title || '').localeCompare(b.title || '')
    if (state.key === 'cookTime') {
      const at = a.cleaned_json?.total_cook_minutes ?? 0
      const bt = b.cleaned_json?.total_cook_minutes ?? 0
      return dir * (at - bt)
    }
    if (state.key === 'opened') {
      const at = new Date(a.created_at).getTime()
      const bt = new Date(b.created_at).getTime()
      return dir * (at - bt)
    }
    return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  })
}

/** Client-side sort for cookbook assignment lists (partial recipe rows). */
export function sortCookbookAssignmentRecipes<
  T extends {
    title: string | null
    created_at: string
    cleaned_json: { total_cook_minutes?: number | null } | null
  },
>(recipes: T[], state: MeSortState): T[] {
  const dir = state.direction === 'asc' ? 1 : -1
  return [...recipes].sort((a, b) => {
    if (state.key === 'alpha') return dir * (a.title || '').localeCompare(b.title || '')
    if (state.key === 'cookTime') {
      const at = a.cleaned_json?.total_cook_minutes ?? 0
      const bt = b.cleaned_json?.total_cook_minutes ?? 0
      return dir * (at - bt)
    }
    return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  })
}

export function sortCookbooks(cookbooks: CookbookRow[], state: MeSortState): CookbookRow[] {
  const dir = state.direction === 'asc' ? 1 : -1
  return [...cookbooks].sort((a, b) => {
    if (state.key === 'alpha') return dir * a.name.localeCompare(b.name)
    return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  })
}
