import { supabase } from '../services/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function messageFromFailedResponse(data: Record<string, unknown> | null, rawText: string, status: number): string {
  if (typeof data?.error === 'string' && data.error.trim()) {
    if (typeof data.details === 'string' && data.details.trim()) return `${data.error}: ${data.details}`
    return data.error
  }
  if (typeof data?.details === 'string' && data.details.trim()) return data.details
  if (typeof data?.message === 'string' && data.message.trim()) return data.message
  if (rawText && rawText.length > 0 && rawText.length < 400 && !rawText.startsWith('<')) return rawText
  if (status === 401 || status === 403) return 'Sign in required to import recipes.'
  if (status === 504 || status === 502) {
    return 'Import timed out — try a shorter link.'
  }
  if (status === 546) {
    return 'Server ran out of memory on that page — try again, or paste a shorter link / Shorts URL.'
  }
  return `Import failed (HTTP ${status})`
}

/**
 * Invoke a Supabase edge function with the current user session. Uses direct fetch so we
 * always read the JSON body — matches figs_1.0's edgeFunctionInvoke.js.
 */
export async function invokeEdgeFunction(
  name: string,
  body: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('No connection')
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured')

  const { data: sessionData } = await supabase.auth.getSession()
  let token = sessionData.session?.access_token
  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    token = refreshed.session?.access_token
  }
  if (!token) throw new Error('Sign in required to use this feature.')

  const timeoutMs = options.timeoutMs ?? 150000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const rawText = await res.text()
    let data: Record<string, unknown> | null = null
    if (rawText) {
      try {
        data = JSON.parse(rawText)
      } catch {
        data = null
      }
    }

    if (!res.ok) throw new Error(messageFromFailedResponse(data, rawText, res.status))

    return data ?? {}
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Import timed out — try a shorter link.')
    }
    if (e instanceof Error) throw e
    throw new Error('Import failed')
  } finally {
    clearTimeout(timer)
  }
}
