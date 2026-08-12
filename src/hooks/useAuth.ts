import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'

export type Profile = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  username: string | null
  has_onboarded: boolean | null
  updated_at: string | null
}

export type AuthActionError = { message: string } | null

const USER_SELECT = 'id, email, first_name, last_name, username, has_onboarded, updated_at'

async function fetchUserRow(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('users').select(USER_SELECT).eq('id', userId).maybeSingle()
  if (error) {
    console.warn('[useAuth] users fetch', error)
    return null
  }
  return (data as Profile | null) ?? null
}

async function fetchUserWithRetry(userId: string): Promise<Profile | null> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const row = await fetchUserRow(userId)
    if (row) return row
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
  }
  return null
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const applySession = useCallback(async (session: Session | null) => {
    const nextUser = session?.user ?? null
    setUser(nextUser)
    if (!nextUser) {
      setProfile(null)
      setLoading(false)
      return
    }
    const row = await fetchUserWithRetry(nextUser.id)
    setProfile(row)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let alive = true

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!alive) return
      await applySession(data.session ?? null)
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null)
        return
      }
      void (async () => {
        if (!alive) return
        setLoading(true)
        await applySession(session ?? null)
      })()
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [applySession])

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: AuthActionError }> => {
    if (!supabase) return { error: { message: 'Supabase client unavailable' } }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    return { error: error ? { message: error.message } : null }
  }, [])

  const signUp = useCallback(async (
    email: string,
    password: string,
    username: string,
  ): Promise<{ error: AuthActionError }> => {
    if (!supabase) return { error: { message: 'Supabase client unavailable' } }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { username: username.trim().toLowerCase() } },
    })
    if (error) return { error: { message: error.message } }
    if (data.user?.id) {
      await supabase
        .from('users')
        .upsert({ id: data.user.id, username: username.trim().toLowerCase() }, { onConflict: 'id' })
    }
    return { error: null }
  }, [])

  const signOut = useCallback(async (): Promise<{ error: AuthActionError }> => {
    if (!supabase) return { error: { message: 'Supabase client unavailable' } }
    const { error } = await supabase.auth.signOut()
    return { error: error ? { message: error.message } : null }
  }, [])

  return useMemo(
    () => ({
      user,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [user, profile, loading, signIn, signUp, signOut],
  )
}
