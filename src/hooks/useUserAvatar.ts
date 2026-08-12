import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'

/** Current user's profile photo from user_app_settings.avatar_url. */
export function useUserAvatar(userId: string | undefined) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const fetchAvatar = useCallback(async () => {
    if (!supabase || !userId) {
      setAvatarUrl(null)
      return
    }
    const { data } = await supabase
      .from('user_app_settings')
      .select('avatar_url')
      .eq('user_id', userId)
      .maybeSingle()
    const url = (data as { avatar_url?: string | null } | null)?.avatar_url?.trim()
    setAvatarUrl(url || null)
  }, [userId])

  useEffect(() => {
    void fetchAvatar()
  }, [fetchAvatar])

  return avatarUrl
}

/** Lightweight session watch — enough for Me tab avatar wiring. */
export function useAuthUserId() {
  const [userId, setUserId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return

    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id)
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  return userId
}
