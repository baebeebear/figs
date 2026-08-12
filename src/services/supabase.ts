import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl) {
  console.warn('[supabase] Missing env var: import.meta.env.VITE_SUPABASE_URL')
}
if (!supabaseAnonKey) {
  console.warn('[supabase] Missing env var: import.meta.env.VITE_SUPABASE_ANON_KEY')
}

/** Same Supabase project as figs_1.0 / figs_1.2.9 — shared backend, local frontend only. */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

export async function checkConnection() {
  if (!supabase) {
    console.warn('[supabase] Connection check skipped: Supabase client unavailable')
    return { status: 'Client Unavailable' as const }
  }

  const { data, error } = await supabase.from('users').select('id').limit(1)
  if (error) {
    console.warn('[supabase] Connection check status:', error.message)
    return { status: 'Error' as const }
  }

  console.info('[supabase] Connection check status: Success', { rows: data?.length ?? 0 })
  return { status: 'Success' as const }
}
