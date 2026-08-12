import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabase'
import {
  expiryDateFor,
  inferStashCategory,
  shelfLifeDays,
  suggestZoneForCategory,
  type StashCategory,
  type StorageZone,
} from './stashCategories'
import { enrichStashItemNutrition } from './nutrition'
import { mergeComputedAttributes } from './attributeFormulas'

const STASH_COLUMNS =
  'id, user_id, name, quantity, unit, category, storage_zone, expiry_date, shelf_life_days, status, added_at, utility_tags, attributes, receipt_id, brand, unit_price, notes, is_enriching, is_reserved, origin_recipe_id, origin_recipe_title, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, sugar_g, saturated_fat_g, cholesterol_mg, potassium_mg, iron_mg, calcium_mg'

export type StashItem = {
  id: string
  user_id: string
  name: string
  quantity: number
  unit: string
  category: StashCategory | string
  storage_zone: 'Fridge' | 'Freezer' | 'Pantry'
  expiry_date: string | null
  shelf_life_days: number
  status: 'available' | 'consumed' | 'wasted'
  added_at: string
  is_enriching: boolean
  is_reserved: boolean
  origin_recipe_id: string | null
  origin_recipe_title: string | null
  utility_tags: string[] | null
  attributes: string[] | null
  receipt_id: string | null
  brand: string | null
  unit_price: number | null
  notes: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  sodium_mg: number | null
  sugar_g: number | null
  saturated_fat_g: number | null
  cholesterol_mg: number | null
  potassium_mg: number | null
  iron_mg: number | null
  calcium_mg: number | null
}

export type ReceiptLog = {
  id: string
  user_id: string
  image_url: string | null
  raw_ocr_json: unknown
  total_amount: number | null
  merchant_name: string | null
  purchased_at: string | null
  created_at: string
}

export type StashUrgency = 'expiring' | 'low' | 'stable'

const ZONE_TO_DB: Record<StorageZone, StashItem['storage_zone']> = {
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
}
const DB_TO_ZONE: Record<StashItem['storage_zone'], StorageZone> = {
  Fridge: 'fridge',
  Freezer: 'freezer',
  Pantry: 'pantry',
}

export function zoneKey(item: StashItem): StorageZone {
  return DB_TO_ZONE[item.storage_zone] ?? 'fridge'
}

export function daysUntilExpiry(item: StashItem): number | null {
  if (!item.expiry_date) return null
  const ms = new Date(item.expiry_date).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function urgencyOf(item: StashItem): StashUrgency {
  const days = daysUntilExpiry(item)
  if (days == null) return 'stable'
  if (days <= 3) return 'expiring'
  if (days <= 7) return 'low'
  return 'stable'
}

export function isExpired(item: StashItem): boolean {
  const days = daysUntilExpiry(item)
  return days != null && days < 0
}

/** Ported from figs_1.0's spoilageEngine.getUrgencyColor — a continuous red→green hue ramp. */
export function urgencyColorForDays(days: number | null): string {
  if (days == null) return 'hsl(128, 34%, 38%)'
  const hue = Math.max(0, Math.min(120, (days / 10) * 120))
  return `hsl(${hue}, 36%, 38%)`
}

export type NewStashItemInput = {
  name: string
  quantity: number
  unit: string
  category?: StashCategory | string
  zone?: StorageZone
  utilityTags?: string[]
  attributes?: string[]
  receiptId?: string | null
  brand?: string | null
  unitPrice?: number | null
  notes?: string | null
  expiryDate?: string
  originRecipeId?: string | null
  originRecipeTitle?: string | null
  calories?: number | null
  proteinG?: number | null
  carbsG?: number | null
  fatG?: number | null
}

/** Loads + mutates the current user's stash. */
export function useStash(userId: string | null | undefined) {
  const [items, setItems] = useState<StashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<StashItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [receipts, setReceipts] = useState<ReceiptLog[]>([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('stash_items')
      .select(STASH_COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'available')
      .order('expiry_date', { ascending: true, nullsFirst: false })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setItems((data ?? []) as StashItem[])
    setError(null)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const loadHistory = useCallback(async () => {
    if (!supabase || !userId) {
      setHistory([])
      return
    }
    setHistoryLoading(true)
    const { data, error: err } = await supabase
      .from('stash_items')
      .select(STASH_COLUMNS)
      .eq('user_id', userId)
      .in('status', ['consumed', 'wasted'])
      .order('added_at', { ascending: false })
      .limit(200)
    if (!err) setHistory((data ?? []) as StashItem[])
    setHistoryLoading(false)
  }, [userId])

  const loadReceipts = useCallback(async () => {
    if (!supabase || !userId) {
      setReceipts([])
      return
    }
    setReceiptsLoading(true)
    const { data, error: err } = await supabase
      .from('receipt_logs')
      .select('id, user_id, image_url, raw_ocr_json, total_amount, merchant_name, purchased_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!err) setReceipts((data ?? []) as ReceiptLog[])
    setReceiptsLoading(false)
  }, [userId])

  const loadReceiptItems = useCallback(async (receiptId: string): Promise<StashItem[]> => {
    if (!supabase) return []
    const { data, error: err } = await supabase
      .from('stash_items')
      .select(STASH_COLUMNS)
      .eq('receipt_id', receiptId)
      .order('added_at', { ascending: true })
    if (err) return []
    return (data ?? []) as StashItem[]
  }, [])

  /** Creates a receipt_logs row for a receipt-mode scan — closes the gap figs_1.0 left open. */
  const createReceiptLog = useCallback(
    async (input: { merchantName: string | null; purchasedAt: string | null; totalAmount: number | null; rawOcrJson: unknown }): Promise<string | null> => {
      if (!supabase || !userId) return null
      const { data, error: err } = await supabase
        .from('receipt_logs')
        .insert({
          user_id: userId,
          merchant_name: input.merchantName,
          purchased_at: input.purchasedAt,
          total_amount: input.totalAmount,
          raw_ocr_json: input.rawOcrJson,
        })
        .select('id')
        .single()
      if (err) {
        console.warn('[useStash] createReceiptLog failed', err.message)
        return null
      }
      return data?.id ?? null
    },
    [userId],
  )

  const buildInsertPayload = useCallback((input: NewStashItemInput) => {
    const category = input.category ?? inferStashCategory(input.name)
    const zone = input.zone ?? suggestZoneForCategory(category, input.name)
    return {
      name: input.name.trim(),
      quantity: input.quantity > 0 ? input.quantity : 1,
      unit: input.unit.trim() || 'each',
      category,
      storage_zone: ZONE_TO_DB[zone],
      suggested_location: ZONE_TO_DB[zone],
      storage_location: ZONE_TO_DB[zone],
      shelf_life_days: shelfLifeDays(category, zone, input.name, input.utilityTags ?? [], input.attributes ?? []),
      expiry_date: expiryDateFor(category, zone, input.name, input.utilityTags ?? [], input.attributes ?? []),
      status: 'available' as const,
      utility_tags: input.utilityTags ?? [],
      attributes: mergeComputedAttributes(input.attributes, input.name, category),
      brand: input.brand ?? null,
      receipt_id: input.receiptId ?? null,
      origin_recipe_id: input.originRecipeId ?? null,
      origin_recipe_title: input.originRecipeTitle ?? null,
      notes: input.notes ?? null,
      is_enriching: input.calories == null,
      calories: input.calories ?? null,
      protein_g: input.proteinG ?? null,
      carbs_g: input.carbsG ?? null,
      fat_g: input.fatG ?? null,
    }
  }, [])

  const addItem = useCallback(
    async (input: NewStashItemInput) => {
      if (!supabase || !userId) return
      const { data, error: err } = await supabase
        .from('stash_items')
        .insert({ ...buildInsertPayload(input), user_id: userId })
        .select('id, name')
        .single()
      if (err) throw new Error(err.message)
      await load()
      if (data?.id && input.calories == null) {
        void enrichStashItemNutrition(supabase, userId, { id: data.id, name: data.name }).then(() => {
          void load()
        })
      }
    },
    [userId, load, buildInsertPayload],
  )

  const addItems = useCallback(
    async (inputs: NewStashItemInput[]) => {
      if (!supabase || !userId || !inputs.length) return
      const sb = supabase
      const payload = inputs.map((input) => ({ ...buildInsertPayload(input), user_id: userId }))
      const { data, error: err } = await sb.from('stash_items').insert(payload).select('id, name')
      if (err) throw new Error(err.message)
      await load()
      // Enrich in parallel, then a single stash reload once all settle (avoids N full reloads).
      const enrichJobs = (data ?? [])
        .map((row, i) =>
          inputs[i]?.calories == null
            ? enrichStashItemNutrition(sb, userId, { id: row.id, name: row.name })
            : null,
        )
        .filter((p): p is Promise<void> => p != null)
      if (enrichJobs.length) {
        void Promise.all(enrichJobs).then(() => {
          void load()
        })
      }
    },
    [userId, load, buildInsertPayload],
  )

  const setStatus = useCallback(
    async (id: string, status: 'consumed' | 'wasted') => {
      if (!supabase) return
      setItems((prev) => prev.filter((i) => i.id !== id))
      const { error: err } = await supabase.from('stash_items').update({ status }).eq('id', id)
      if (err) {
        console.warn('[useStash] setStatus failed', err.message)
        await load()
      }
    },
    [load],
  )

  /** Hard delete — permanently removes the row, unlike `setStatus` (archive to consumed/wasted). */
  const deleteItem = useCallback(
    async (id: string) => {
      if (!supabase) return
      setItems((prev) => prev.filter((i) => i.id !== id))
      const { error: err } = await supabase.from('stash_items').delete().eq('id', id)
      if (err) {
        console.warn('[useStash] deleteItem failed', err.message)
        await load()
      }
    },
    [load],
  )

  const deleteItems = useCallback(
    async (ids: string[]) => {
      if (!supabase || !ids.length) return
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)))
      const { error: err } = await supabase.from('stash_items').delete().in('id', ids)
      if (err) {
        console.warn('[useStash] deleteItems failed', err.message)
        await load()
      }
    },
    [load],
  )

  const restoreItem = useCallback(
    async (id: string) => {
      if (!supabase) return
      const { error: err } = await supabase.from('stash_items').update({ status: 'available' }).eq('id', id)
      if (err) {
        console.warn('[useStash] restoreItem failed', err.message)
        return
      }
      setHistory((prev) => prev.filter((i) => i.id !== id))
      await load()
    },
    [load],
  )

  const updateItem = useCallback(
    async (id: string, patch: Partial<NewStashItemInput>) => {
      if (!supabase) return
      const current = items.find((i) => i.id === id)
      if (!current) return
      const category = patch.category ?? current.category
      const zone = patch.zone ?? DB_TO_ZONE[current.storage_zone]
      const name = patch.name ?? current.name
      const utilityTags = patch.utilityTags ?? current.utility_tags ?? []
      const attributes = patch.attributes ?? current.attributes ?? []
      const dbPatch: Record<string, unknown> = {}
      if (patch.name != null) dbPatch.name = patch.name.trim()
      if (patch.quantity != null) dbPatch.quantity = patch.quantity
      if (patch.unit != null) dbPatch.unit = patch.unit.trim() || 'each'
      if (patch.category != null) dbPatch.category = patch.category
      if (patch.utilityTags != null) dbPatch.utility_tags = patch.utilityTags
      if (patch.attributes != null) dbPatch.attributes = patch.attributes
      if (patch.brand != null) dbPatch.brand = patch.brand.trim() || null
      if (patch.unitPrice != null) dbPatch.unit_price = patch.unitPrice
      if (patch.notes != null) dbPatch.notes = patch.notes.trim() || null
      if (patch.zone != null) {
        dbPatch.storage_zone = ZONE_TO_DB[zone]
        dbPatch.suggested_location = ZONE_TO_DB[zone]
        dbPatch.storage_location = ZONE_TO_DB[zone]
        dbPatch.shelf_life_days = shelfLifeDays(category, zone, name, utilityTags, attributes)
        dbPatch.expiry_date = expiryDateFor(category, zone, name, utilityTags, attributes)
      }
      // Explicit expiry-date edits win over the zone/category-derived default above.
      if (patch.expiryDate != null) dbPatch.expiry_date = patch.expiryDate
      const { error: err } = await supabase.from('stash_items').update(dbPatch).eq('id', id)
      if (err) throw new Error(err.message)
      await load()
    },
    [items, load],
  )

  const grouped = useMemo(() => {
    const out: Record<StorageZone, StashItem[]> = { fridge: [], freezer: [], pantry: [] }
    for (const item of items) out[zoneKey(item)].push(item)
    return out
  }, [items])

  const summary = useMemo(() => {
    let expiring = 0
    let low = 0
    for (const item of items) {
      const u = urgencyOf(item)
      if (u === 'expiring') expiring += 1
      else if (u === 'low') low += 1
    }
    const useSoon = [...items]
      .filter((i) => {
        const d = daysUntilExpiry(i)
        return d != null && d >= 0 && d <= 3
      })
      .sort((a, b) => (daysUntilExpiry(a) ?? 0) - (daysUntilExpiry(b) ?? 0))
      .slice(0, 2)
    return { total: items.length, expiring, low, useSoon }
  }, [items])

  return {
    items,
    grouped,
    summary,
    loading,
    error,
    load,
    addItem,
    addItems,
    setStatus,
    updateItem,
    deleteItem,
    deleteItems,
    restoreItem,
    history,
    historyLoading,
    loadHistory,
    receipts,
    receiptsLoading,
    loadReceipts,
    loadReceiptItems,
    createReceiptLog,
  }
}
