import { daysUntilExpiry, type StashItem } from './stash'

export type StashSortMode = 'priority' | 'alphabetical' | 'recent'
export type StashSortDirection = 'asc' | 'desc'

export type StashSortState = {
  mode: StashSortMode
  direction: StashSortDirection
}

export function defaultStashSortState(): StashSortState {
  return { mode: 'priority', direction: 'asc' }
}

export function applyStashSort(items: StashItem[], state: StashSortState): StashItem[] {
  const dir = state.direction === 'asc' ? 1 : -1
  const sorted = [...items]
  if (state.mode === 'alphabetical') {
    sorted.sort((a, b) => dir * a.name.localeCompare(b.name))
  } else if (state.mode === 'recent') {
    sorted.sort((a, b) => dir * (new Date(a.added_at).getTime() - new Date(b.added_at).getTime()))
  } else {
    sorted.sort((a, b) => {
      const da = daysUntilExpiry(a)
      const db = daysUntilExpiry(b)
      if (da == null && db == null) return 0
      if (da == null) return 1
      if (db == null) return -1
      return dir * (da - db)
    })
  }
  return sorted
}
