import { Capacitor } from '@capacitor/core'
import { AppleSignIn, SignInScope } from '@capawesome/capacitor-apple-sign-in'
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth'
import { supabase } from '../services/supabase'

const GOOGLE_WEB_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined) ||
  '327999147197-0ub120p3a2galvma9etnc2iurga3fl8d.apps.googleusercontent.com'

let googleInitialized = false

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function signInWithApple(): Promise<{ error: { message: string } | null }> {
  if (!supabase) return { error: { message: 'Supabase is not configured.' } }

  if (!isNativeApp()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/` },
    })
    return { error: error ? { message: error.message } : null }
  }

  const rawNonce = randomNonce()
  const nonce = await sha256Hex(rawNonce)
  const result = await AppleSignIn.signIn({
    scopes: [SignInScope.Email, SignInScope.FullName],
    nonce,
  })

  if (!result.idToken) {
    return { error: { message: 'No identity token received from Apple' } }
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: result.idToken,
    nonce: rawNonce,
  })
  return { error: error ? { message: error.message } : null }
}

function ensureGoogleInitialized() {
  if (googleInitialized) return
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Missing VITE_GOOGLE_WEB_CLIENT_ID')
  }
  GoogleAuth.initialize({
    clientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ['profile', 'email'],
    grantOfflineAccess: true,
  })
  googleInitialized = true
}

export async function signInWithGoogle(): Promise<{ error: { message: string } | null }> {
  if (!supabase) return { error: { message: 'Supabase is not configured.' } }

  const useNative = isNativeApp() && Boolean(GOOGLE_WEB_CLIENT_ID)
  if (!useNative) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    return { error: error ? { message: error.message } : null }
  }

  ensureGoogleInitialized()
  const googleUser = await GoogleAuth.signIn()
  const idToken = googleUser.authentication?.idToken
  if (!idToken) {
    return { error: { message: 'No identity token received from Google' } }
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  return { error: error ? { message: error.message } : null }
}

if (typeof window !== 'undefined') {
  try {
    ensureGoogleInitialized()
  } catch {
    // Native Google stays off until a web client ID is available.
  }
}
