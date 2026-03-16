'use client'

import { useState } from 'react'
import { createClient } from '@/app/utils/supabase/client'
import styles from './AuthModal.module.css'

export default function AuthModal() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  
  const supabase = createClient()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        alert('Check your email for the confirmation link!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>{isSignUp ? 'Sign Up' : 'Login'}</h2>
          <p>{isSignUp ? 'Create a new account' : 'Welcome back, please log in'}</p>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <form onSubmit={handleAuth}>
          <div className={styles.formGroup}>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className={styles.toggleText}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? 'Login' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  )
}
