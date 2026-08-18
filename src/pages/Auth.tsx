import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import type { AuthActionError } from '../hooks/useAuth'
import { signInWithApple as nativeAppleSignIn, signInWithGoogle as nativeGoogleSignIn } from '../lib/nativeSocialAuth'
import { supabase } from '../services/supabase'

type AuthPageProps = {
  signIn: (email: string, password: string) => Promise<{ error: AuthActionError }>
  signUp: (email: string, password: string, username: string) => Promise<{ error: AuthActionError }>
}

type Screen = 'welcome' | 'login' | 'signup-account' | 'privacy'

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="19" height="19" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

function AppleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M17.05 12.54c-.02-2.05 1.68-3.03 1.75-3.08-.95-1.39-2.43-1.58-2.96-1.6-1.26-.13-2.46.74-3.1.74-.64 0-1.62-.72-2.67-.7-1.37.02-2.64.8-3.35 2.03-1.43 2.48-.37 6.15 1.02 8.16.68.98 1.49 2.08 2.55 2.04 1.02-.04 1.41-.66 2.65-.66 1.24 0 1.58.66 2.66.64 1.1-.02 1.79-1 2.46-1.99.78-1.14 1.1-2.24 1.12-2.3-.02-.01-2.15-.82-2.18-3.27zM15.1 6.34c.56-.68.94-1.63.84-2.58-.81.03-1.79.54-2.37 1.22-.52.6-.98 1.56-.86 2.48.9.07 1.83-.46 2.39-1.12z" />
    </svg>
  )
}

/**
 * Auth UI — welcome → login, or create account (Google / Apple / email).
 */
export default function Auth({ signIn, signUp }: AuthPageProps) {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'too_short' | 'error'
  >('idle')
  const [busy, setBusy] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<'google' | 'apple' | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const navigate = (path: string) => {
    try {
      window.history.pushState({}, '', path)
      window.dispatchEvent(new PopStateEvent('popstate'))
    } catch {
      window.location.assign(path)
    }
  }

  const go = (next: Screen) => {
    setError('')
    setInfo('')
    setScreen(next)
  }

  const signInWithGoogle = async () => {
    setError('')
    setOauthBusy('google')
    try {
      const { error: oauthError } = await nativeGoogleSignIn()
      if (oauthError) setError(oauthError.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed')
    } finally {
      setOauthBusy(null)
    }
  }

  const signInWithApple = async () => {
    setError('')
    setOauthBusy('apple')
    try {
      const { error: oauthError } = await nativeAppleSignIn()
      if (oauthError) setError(oauthError.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apple Sign-In failed')
    } finally {
      setOauthBusy(null)
    }
  }

  const onWelcomeContinue = () => {
    setError('')
    const raw = identifier.trim()
    if (!raw) {
      setError('Enter a username, email, or phone number.')
      return
    }
    if (raw.includes('@')) {
      setEmail(raw)
      setUsername('')
    } else {
      setUsername(raw)
      setEmail('')
    }
    go('login')
  }

  const onLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    const raw = (username.trim() || identifier.trim())
    if (!raw || !password) {
      setError('Enter your username or email and password.')
      return
    }
    setBusy(true)

    let resolvedEmail = raw.toLowerCase()
    if (!raw.includes('@')) {
      if (!supabase) {
        setBusy(false)
        setError('Supabase unavailable.')
        return
      }
      const { data: foundEmail, error: rpcErr } = await supabase.rpc('email_for_username', {
        p_username: raw.toLowerCase(),
      })
      if (rpcErr || !foundEmail) {
        setBusy(false)
        setError('No account found with that username.')
        return
      }
      resolvedEmail = foundEmail as string
    }

    const result = await signIn(resolvedEmail, password)
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    navigate('/dashboard')
  }

  const onSignUp = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!username.trim()) {
      setError('Please choose a username.')
      return
    }
    if (usernameStatus === 'too_short') {
      setError('Username must be at least 3 characters.')
      return
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken.')
      return
    }
    if (usernameStatus !== 'available') {
      setError('Please wait for username availability check to finish.')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    if (!password) {
      setError('Enter a password.')
      return
    }

    setBusy(true)
    const result = await signUp(email.trim().toLowerCase(), password, username.trim().toLowerCase())
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }

    if (supabase) {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        navigate('/dashboard')
        return
      }
    }

    setInfo('Check your email for a confirmation link to finish creating your account.')
  }

  const normalizedUsername = useMemo(() => username.trim().toLowerCase(), [username])
  useEffect(() => {
    if (screen !== 'signup-account') return
    const u = normalizedUsername
    if (!u) {
      setUsernameStatus('idle')
      return
    }
    if (u.length < 3) {
      setUsernameStatus('too_short')
      return
    }
    let cancelled = false
    setUsernameStatus('checking')
    const t = setTimeout(() => {
      void (async () => {
        if (!supabase) {
          if (!cancelled) setUsernameStatus('error')
          return
        }
        const { data, error: rpcErr } = await supabase.rpc('is_username_available', { p_username: u })
        if (cancelled) return
        if (rpcErr) {
          setUsernameStatus('error')
          return
        }
        setUsernameStatus(data ? 'available' : 'taken')
      })()
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [screen, normalizedUsername])

  const oauthDisabled = oauthBusy !== null || busy
  const oauthButtons = (
    <>
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        disabled={oauthDisabled}
        className="flex h-[48px] w-full shrink-0 items-center justify-center gap-[11px] rounded-[15px] border border-[#e6e2db] bg-white font-ui text-[15px] font-semibold text-[#1c1c1e] shadow-[0_1px_2px_rgba(20,10,40,0.04)] disabled:opacity-60"
      >
        <GoogleMark />
        {oauthBusy === 'google' ? 'Signing in…' : 'Continue with Google'}
      </button>
      <div className="h-2.5 shrink-0" />
      <button
        type="button"
        onClick={() => void signInWithApple()}
        disabled={oauthDisabled}
        className="flex h-[48px] w-full shrink-0 items-center justify-center gap-2.5 rounded-[15px] border-0 bg-[#1c1c1e] font-ui text-[15px] font-semibold text-white disabled:opacity-60"
      >
        <AppleMark className="text-white" />
        {oauthBusy === 'apple' ? 'Signing in…' : 'Continue with Apple'}
      </button>
    </>
  )
  const fieldClass =
    'auth-field w-full h-[48px] px-[18px] rounded-[15px] border border-[#e6e2db] bg-white font-ui text-[16px] text-[#1c1c1e] outline-none placeholder:text-[#a29ba8]'
  const primaryBtn =
    'flex h-[48px] w-full items-center justify-center rounded-[15px] border-0 bg-[#1a0d40] font-ui text-[15px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(26,13,64,0.7)] transition-colors hover:bg-[#2a1a5a] disabled:cursor-not-allowed disabled:opacity-60'
  const backBtn =
    'absolute left-[22px] top-[max(6px,env(safe-area-inset-top,0px))] z-10 flex h-10 w-10 items-center justify-center border-0 bg-transparent p-0 text-[#111111]'

  return (
    <div className="auth-screen figs-app-viewport">
      <div className="figs-phone-shell auth-phone-shell">
        {screen === 'welcome' ? (
          <main className="auth-main">
            <div className="h-[clamp(8px,5vh,96px)] shrink-0" />
            <div className="flex shrink-0 flex-col items-center">
              <div className="auth-brand-mark">
                <img src="/figs_logo_fig.png" alt="" className="auth-brand-fig" draggable={false} />
              </div>
              <div className="mt-[22px] font-editorial text-[30px] font-medium tracking-[-0.01em] text-[#1a0d40]">
                figs
              </div>
              <h1 className="m-0 mt-1 font-editorial text-[32px] font-medium italic tracking-[-0.01em] text-[#1a0d40]">
                Welcome back
              </h1>
              <p className="m-0 mt-2 text-center font-ui text-[14px] text-[#8b8794]">
                Your kitchen, always within reach.
              </p>
            </div>

            <div className="h-[clamp(16px,3vh,40px)] shrink-0" />

            {oauthButtons}

            <div className="my-5 flex shrink-0 items-center gap-3.5">
              <div className="h-px flex-1 bg-[#e9e5de]" />
              <span className="font-ui text-[13px] text-[#a29ba8]">or</span>
              <div className="h-px flex-1 bg-[#e9e5de]" />
            </div>

            <input
              className={`${fieldClass} shrink-0`}
              type="text"
              placeholder="Username, email, or phone number"
              autoComplete="username"
              value={identifier}
              onChange={(ev) => setIdentifier(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') onWelcomeContinue()
              }}
            />
            <div className="h-3 shrink-0" />
            <button type="button" className={`${primaryBtn} shrink-0`} onClick={onWelcomeContinue} disabled={busy}>
              Continue
            </button>

            <p className="mx-auto mt-[18px] max-w-[300px] shrink-0 text-center font-ui text-[12px] leading-relaxed text-[#a29ba8]">
              By continuing, you agree to our{' '}
              <button
                type="button"
                className="border-0 bg-transparent p-0 font-ui text-[12px] font-semibold text-[#4C6A57]"
                onClick={() => go('privacy')}
              >
                Privacy Policy
              </button>
              .
            </p>

            {error ? (
              <p className="mt-3 text-center font-ui text-[12px] font-medium text-[#c0503a]" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex-1" />
            <div className="pb-[30px] text-center font-ui text-[14px] text-[#6e6c78]">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                className="border-0 bg-transparent p-0 font-semibold text-[#4C6A57]"
                onClick={() => go('signup-account')}
              >
                Sign up
              </button>
            </div>
          </main>
        ) : null}

        {screen === 'login' ? (
          <main className="auth-main relative">
            <button type="button" className={backBtn} aria-label="Back" onClick={() => go('welcome')}>
              <ChevronLeft size={22} strokeWidth={2.25} color="#111111" />
            </button>
            <div className="h-[clamp(12px,2.5vh,28px)] shrink-0" />
            <h1 className="m-0 text-center font-editorial text-[32px] font-medium italic tracking-[-0.01em] text-[#1a0d40]">
              Welcome back
            </h1>
            <p className="m-0 mt-1.5 text-center font-ui text-[14px] text-[#8b8794]">Enter your password to continue.</p>
            <div className="h-5 shrink-0" />
            {oauthButtons}
            <div className="my-3.5 flex shrink-0 items-center gap-3.5">
              <div className="h-px flex-1 bg-[#e9e5de]" />
              <span className="font-ui text-[13px] text-[#a29ba8]">or</span>
              <div className="h-px flex-1 bg-[#e9e5de]" />
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onLogin(e)}>
              <label className="font-ui text-[13px] font-semibold text-[#6e6c78]">Username</label>
              <input
                className={`${fieldClass} mt-1.5`}
                type="text"
                autoComplete="username"
                value={username || identifier}
                onChange={(ev) => {
                  setUsername(ev.target.value)
                  setIdentifier(ev.target.value)
                }}
              />
              <div className="h-3 shrink-0" />
              <label className="font-ui text-[13px] font-semibold text-[#6e6c78]">Password</label>
              <div className="relative mt-1.5">
                <input
                  className={`${fieldClass} pr-[50px]`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-[50px] items-center justify-center border-0 bg-transparent text-[#a29ba8]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={19} strokeWidth={2} /> : <Eye size={19} strokeWidth={2} />}
                </button>
              </div>
              <div className="h-4 shrink-0" />
              <button type="submit" className={primaryBtn} disabled={busy || oauthBusy !== null}>
                {busy ? 'Please wait…' : 'Continue'}
              </button>

              {error ? (
                <p className="mt-3 text-center font-ui text-[12px] font-medium text-[#c0503a]" role="alert">
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className="mt-3 text-center font-ui text-[12px] font-medium text-[#4C6A57]" role="status">
                  {info}
                </p>
              ) : null}
            </form>
          </main>
        ) : null}

        {screen === 'signup-account' ? (
          <main className="auth-main">
            <div className="h-[clamp(12px,2.5vh,28px)] shrink-0" />
            <h1 className="m-0 text-center font-editorial text-[32px] font-medium italic tracking-[-0.01em] text-[#1a0d40]">
              Create your account
            </h1>
            <p className="m-0 mt-1.5 text-center font-ui text-[14px] text-[#8b8794]">Pick a username and set your password.</p>
            <div className="h-5 shrink-0" />
            {oauthButtons}
            <div className="my-3.5 flex shrink-0 items-center gap-3.5">
              <div className="h-px flex-1 bg-[#e9e5de]" />
              <span className="font-ui text-[13px] text-[#a29ba8]">or</span>
              <div className="h-px flex-1 bg-[#e9e5de]" />
            </div>

            <form className="flex min-h-0 flex-col" onSubmit={(e) => void onSignUp(e)}>
              <label className="font-ui text-[13px] font-semibold text-[#6e6c78]">Username</label>
              <div className="relative mt-1.5">
                <input
                  className={`${fieldClass} pr-11 ${
                    usernameStatus === 'available'
                      ? 'border-[#4C6A57]'
                      : usernameStatus === 'taken' || usernameStatus === 'too_short'
                        ? 'border-[#c0503a]'
                        : ''
                  }`}
                  type="text"
                  autoComplete="username"
                  placeholder="ava.chen"
                  value={username}
                  onChange={(ev) => setUsername(ev.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  {usernameStatus === 'checking' ? <Loader2 className="h-4 w-4 animate-spin text-[#8b8794]" /> : null}
                  {usernameStatus === 'available' ? <CheckCircle2 className="h-4 w-4 text-[#4C6A57]" /> : null}
                  {usernameStatus === 'taken' || usernameStatus === 'too_short' ? (
                    <AlertCircle className="h-4 w-4 text-[#c0503a]" />
                  ) : null}
                </span>
              </div>
              {usernameStatus === 'taken' ? (
                <p className="mt-1 font-ui text-[11px] text-[#c0503a]">Username already taken</p>
              ) : null}
              {usernameStatus === 'too_short' ? (
                <p className="mt-1 font-ui text-[11px] text-[#c0503a]">At least 3 characters required</p>
              ) : null}

              <div className="h-3 shrink-0" />
              <label className="font-ui text-[13px] font-semibold text-[#6e6c78]">Email</label>
              <input
                className={`${fieldClass} mt-1.5`}
                type="email"
                autoComplete="email"
                placeholder="ava@email.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
              />

              <div className="h-3 shrink-0" />
              <label className="font-ui text-[13px] font-semibold text-[#6e6c78]">Password</label>
              <div className="relative mt-1.5">
                <input
                  className={`${fieldClass} pr-[50px]`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-[50px] items-center justify-center border-0 bg-transparent text-[#a29ba8]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={19} strokeWidth={2} /> : <Eye size={19} strokeWidth={2} />}
                </button>
              </div>

              <div className="h-4 shrink-0" />
              <button type="submit" className={primaryBtn} disabled={busy || oauthBusy !== null}>
                {busy ? 'Please wait…' : 'Continue'}
              </button>

              {error ? (
                <p className="mt-3 text-center font-ui text-[12px] font-medium text-[#c0503a]" role="alert">
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className="mt-3 text-center font-ui text-[12px] font-medium text-[#4C6A57]" role="status">
                  {info}
                </p>
              ) : null}

              <div className="pb-5 pt-4 text-center font-ui text-[14px] text-[#6e6c78]">
                Already have an account?{' '}
                <button
                  type="button"
                  className="border-0 bg-transparent p-0 font-semibold text-[#4C6A57]"
                  onClick={() => go('welcome')}
                >
                  Log in
                </button>
              </div>
            </form>
          </main>
        ) : null}

        {screen === 'privacy' ? (
          <main className="auth-main auth-privacy-main">
            <div className="relative pt-1">
              <button type="button" className={backBtn} aria-label="Back" onClick={() => go('welcome')}>
                <ChevronLeft size={22} strokeWidth={2.25} color="#111111" />
              </button>
            </div>
            <iframe
              title="Privacy Policy"
              className="auth-privacy-frame mt-10"
              src="/privacy-policy.html"
            />
          </main>
        ) : null}
      </div>
    </div>
  )
}
