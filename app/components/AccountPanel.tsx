'use client'

import { useState } from 'react'
import { getAuthCallbackUrl } from '@/app/lib/authRedirect'
import { useAuth } from './AuthProvider'
import PaymentModal from './modals/PaymentModal'
import SolidColorPresetStrip from './ui/SolidColorPresetStrip'
import { addSolidColorPresetAtPlayhead } from '@/app/lib/addImageAtPlayhead'
import styles from './AccountPanel.module.css'

export default function AccountPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  const { user, supabase, profile } = useAuth()

  const handleManageSubscription = async () => {
    try {
      const response = await fetch('/api/customer-portal', {
        method: 'POST',
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to open billing portal')
      }
    } catch (err) {
      console.error('Portal error:', err)
      alert('Failed to open subscription management.')
    }
  }

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      setError('Authentication client is not initialized.')
      return
    }

    setAuthLoading(true)
    setError(null)

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthCallbackUrl(),
          },
        })
        if (signUpError) throw signUpError
        setShowConfirmation(true)
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during authentication.'
      setError(msg)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (!supabase) return
    setError(null)

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthCallbackUrl(),
        },
      })
      if (oauthError) throw oauthError
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during Google sign in.'
      setError(msg)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {user ? (
          <div className={styles.headerSignedIn}>
            <div className={styles.userInfo}>
              <span className={styles.userEmail}>{user.email}</span>
              {profile?.requests_remaining !== undefined && (
                <span className={styles.requestCount}>{profile.requests_remaining} requests left</span>
              )}
            </div>
            <div className={styles.headerButtons}>
              {profile?.is_pro ? (
                <button type="button" className={styles.manageButton} onClick={handleManageSubscription} title="Manage Subscription">
                  Pro
                </button>
              ) : (
                <button type="button" className={styles.proButton} onClick={() => setShowPaymentModal(true)}>
                  Pro
                </button>
              )}
              <button type="button" className={styles.signOutButton} onClick={handleSignOut} title="Sign Out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <p className={styles.signedInNote}>Sign in to sync AI chat, exports, and billing.</p>
        )}
      </div>

      <div className={styles.mediaSection}>
        <p className={styles.mediaSectionLabel}>Media</p>
        <SolidColorPresetStrip onPick={(color, name) => void addSolidColorPresetAtPlayhead(color, name)} />
      </div>

      {showPaymentModal && <PaymentModal onClose={() => setShowPaymentModal(false)} />}

      {!user && (
        <div className={styles.scroll}>
          <div className={styles.authWrap}>
            {showConfirmation ? (
              <div>
                <div className={styles.confirmationIcon}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div className={styles.modalHeader}>
                  <h2>Check your email</h2>
                  <p>
                    We have sent a confirmation link to <strong>{email}</strong>. Check your inbox to complete registration.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.submitButton}
                  onClick={() => {
                    setShowConfirmation(false)
                    setIsSignUp(false)
                  }}
                >
                  Back to Sign In
                </button>
                <div className={styles.toggleText}>
                  Did not receive an email? Check spam or
                  <button type="button" className={styles.toggleButton} onClick={() => setShowConfirmation(false)}>
                    try again
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className={styles.modalHeader}>
                  <h2>{isSignUp ? 'Create Account' : 'Sign In'}</h2>
                  <p>Use email or Google to access your studio</p>
                </div>

                {error && <div className={styles.errorMessage}>{error}</div>}

                <form onSubmit={handleAuth}>
                  <div className={styles.formGroup}>
                    <label htmlFor="account-email">Email</label>
                    <input
                      type="email"
                      id="account-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="account-password">Password</label>
                    <input
                      type="password"
                      id="account-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    />
                  </div>
                  <button type="submit" className={styles.submitButton} disabled={authLoading || !supabase}>
                    {authLoading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
                  </button>
                </form>

                <div className={styles.divider}>
                  <span>or</span>
                </div>

                <button type="button" onClick={handleGoogleSignIn} className={styles.googleButton} disabled={!supabase}>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign in with Google
                </button>

                <div className={styles.toggleText}>
                  {isSignUp ? 'Already have an account?' : 'Need an account?'}
                  <button type="button" className={styles.toggleButton} onClick={() => setIsSignUp(!isSignUp)}>
                    {isSignUp ? 'Login' : 'Sign Up'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
