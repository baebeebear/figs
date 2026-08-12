import {
  Apple,
  Archive,
  Beef,
  Carrot,
  Cookie,
  Croissant,
  CupSoda,
  Drumstick,
  Droplet,
  Egg,
  Fish,
  Flame,
  Ham,
  Layers,
  Package,
  Pill,
  Refrigerator,
  ShoppingBag,
  Snowflake,
  Soup,
  Sparkle,
  Utensils,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { zoneKey, type StashItem } from './stash'
import type { StorageZone } from './stashCategories'
import { attributeIcon } from './attributeIcons'

export type StashGroupMode = 'storage' | 'category' | 'utility' | 'attribute'

export const STASH_GROUP_MODES: { value: StashGroupMode; label: string }[] = [
  { value: 'storage', label: 'Storage' },
  { value: 'category', label: 'Category' },
  { value: 'utility', label: 'Utility' },
  { value: 'attribute', label: 'Attribute' },
]

export const ZONE_LABEL: Record<StorageZone, string> = { fridge: 'Fridge', freezer: 'Freezer', pantry: 'Pantry' }
export const ZONE_ICON: Record<StorageZone, LucideIcon> = { fridge: Refrigerator, freezer: Snowflake, pantry: Archive }

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  fruit: Apple,
  vegetable: Carrot,
  poultry: Drumstick,
  meat: Beef,
  seafood: Fish,
  'dairy & eggs': Egg,
  'deli & cured': Ham,
  'bakery & bread': Croissant,
  'pantry staples': Package,
  'oil & condiments': Droplet,
  'spices & seasoning': Flame,
  leftover: Utensils,
  'meal prep': Soup,
  beverages: CupSoda,
  takeout: ShoppingBag,
  'supplements & powders': Pill,
}

export const UTILITY_ICONS: Record<string, LucideIcon> = {
  ingredient: Utensils,
  component: Layers,
  plate: UtensilsCrossed,
  dish: UtensilsCrossed,
  meal: Soup,
  snack: Cookie,
  drink: CupSoda,
  'topping/garnish': Sparkle,
}

export type StashGroupSection = { key: string; label: string; icon: LucideIcon; items: StashItem[] }

/** Groups stash items along one of four dimensions. `utility`/`attribute` are
 * multi-membership — an item with 2 utility tags appears in both of that mode's sections. */
export function groupStashItems(items: StashItem[], mode: StashGroupMode): StashGroupSection[] {
  if (mode === 'storage') {
    const buckets: Record<StorageZone, StashItem[]> = { fridge: [], freezer: [], pantry: [] }
    for (const item of items) buckets[zoneKey(item)].push(item)
    return (['fridge', 'freezer', 'pantry'] as StorageZone[])
      .filter((z) => buckets[z].length)
      .map((z) => ({ key: z, label: ZONE_LABEL[z], icon: ZONE_ICON[z], items: buckets[z] }))
  }

  if (mode === 'category') {
    const buckets = new Map<string, StashItem[]>()
    for (const item of items) {
      const key = item.category || 'Other'
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(item)
    }
    return Array.from(buckets.entries()).map(([key, its]) => ({
      key,
      label: key.replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: CATEGORY_ICONS[key.toLowerCase()] ?? Package,
      items: its,
    }))
  }

  if (mode === 'utility') {
    const buckets = new Map<string, StashItem[]>()
    for (const item of items) {
      const tags = item.utility_tags?.length ? item.utility_tags : ['Uncategorized']
      for (const tag of tags) {
        if (!buckets.has(tag)) buckets.set(tag, [])
        buckets.get(tag)!.push(item)
      }
    }
    return Array.from(buckets.entries()).map(([key, its]) => ({
      key,
      label: key.replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: UTILITY_ICONS[key.toLowerCase()] ?? Utensils,
      items: its,
    }))
  }

  // attribute
  const buckets = new Map<string, StashItem[]>()
  for (const item of items) {
    const attrs = item.attributes?.length ? item.attributes : ['Uncategorized']
    for (const attr of attrs) {
      if (!buckets.has(attr)) buckets.set(attr, [])
      buckets.get(attr)!.push(item)
    }
  }
  return Array.from(buckets.entries()).map(([key, its]) => ({
    key,
    label: key.replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: key === 'Uncategorized' ? Package : attributeIcon(key),
    items: its,
  }))
}
