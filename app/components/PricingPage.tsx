'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/app/components/AuthProvider'
import AuthModal from '@/app/components/modals/AuthModal'
import {
  FREE_PLAN_FEATURES,
  PRO_MONTHLY_PRICE_ID,
  PRO_PLAN_FEATURES,
  PRO_YEARLY_PRICE_ID,
  openCustomerPortal,
  startProCheckout,
} from '@/app/lib/pricingPlans'
import styles from './PricingPage.module.css'

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function PricingPage() {
  const { user, profile, loading } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [signUpMode, setSignUpMode] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [pendingPriceId, setPendingPriceId] = useState<string | null>(null)

  const isPro = profile?.is_pro ?? false

  const openSignIn = () => {
    setSignUpMode(false)
    setAuthOpen(true)
  }

  const openSignUp = () => {
    setSignUpMode(true)
    setAuthOpen(true)
  }

  const handleFreeAction = () => {
    if (user) {
      window.location.href = '/'
      return
    }
    openSignUp()
  }

  const handleProCheckout = async (priceId: string) => {
    if (!user) {
      setPendingPriceId(priceId)
      openSignUp()
      return
    }

    setCheckoutLoading(priceId)
    try {
      await startProCheckout(priceId)
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Checkout failed. Please try again later.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  useEffect(() => {
    if (user) {
      setAuthOpen(false)
    }
  }, [user])

  useEffect(() => {
    if (!user || !pendingPriceId) return

    const priceId = pendingPriceId
    setPendingPriceId(null)
    setCheckoutLoading(priceId)
    startProCheckout(priceId)
      .catch((error) => {
        console.error('Checkout error:', error)
        alert('Checkout failed. Please try again later.')
      })
      .finally(() => {
        setCheckoutLoading(null)
      })
  }, [user, pendingPriceId])

  const handleManageSubscription = async () => {
    setCheckoutLoading('portal')
    try {
      await openCustomerPortal()
    } catch (error) {
      console.error('Portal error:', error)
      alert('Failed to open subscription management.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  const handleAuthClose = () => {
    setAuthOpen(false)
    if (!user) {
      setPendingPriceId(null)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logoLink}>
          Mango Studio
        </Link>
        <div className={styles.headerActions}>
          {!loading && !user ? (
            <>
              <button type="button" className={styles.signInButton} onClick={openSignIn}>
                Sign in
              </button>
              <button type="button" className={styles.primaryButton} onClick={openSignUp}>
                Sign up
              </button>
            </>
          ) : null}
          {!loading && user ? (
            <Link href="/" className={styles.primaryButton}>
              Open Studio
            </Link>
          ) : null}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>Simple pricing</h1>
        </div>

        <div className={styles.plansGrid}>
          <article className={styles.planCard}>
            <h2 className={styles.planName}>Free</h2>
            <div className={styles.priceRow}>
              <span className={styles.price}>$0</span>
              <span className={styles.pricePeriod}>/ forever</span>
            </div>
            <p className={styles.priceNote}>Everything you need to start editing.</p>
            <ul className={styles.featureList}>
              {FREE_PLAN_FEATURES.map((feature) => (
                <li key={feature} className={styles.featureItem}>
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
            {user && isPro ? (
              <button type="button" className={`${styles.planButton} ${styles.currentPlanButton}`} disabled>
                Included in Pro
              </button>
            ) : user && !isPro ? (
              <button type="button" className={`${styles.planButton} ${styles.currentPlanButton}`} disabled>
                Current plan
              </button>
            ) : (
              <button type="button" className={`${styles.planButton} ${styles.freeButton}`} onClick={handleFreeAction}>
                {user ? 'Open Studio' : 'Get started free'}
              </button>
            )}
          </article>

          <article className={`${styles.planCard} ${styles.proCard}`}>
            <h2 className={styles.planName}>Pro</h2>
            <div className={styles.priceRow}>
              <span className={styles.price}>$0.99</span>
              <span className={styles.pricePeriod}>/ month</span>
            </div>
            <p className={styles.priceNote}>Or $9.99 billed yearly.</p>
            <ul className={styles.featureList}>
              {PRO_PLAN_FEATURES.map((feature) => (
                <li key={feature} className={styles.featureItem}>
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
            {isPro ? (
              <button
                type="button"
                className={`${styles.planButton} ${styles.proButton}`}
                onClick={handleManageSubscription}
                disabled={checkoutLoading === 'portal'}
              >
                {checkoutLoading === 'portal' ? 'Opening...' : 'Manage subscription'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`${styles.planButton} ${styles.proButton}`}
                  onClick={() => handleProCheckout(PRO_MONTHLY_PRICE_ID)}
                  disabled={!!checkoutLoading}
                >
                  {checkoutLoading === PRO_MONTHLY_PRICE_ID ? 'Processing...' : 'Subscribe monthly'}
                </button>
                <button
                  type="button"
                  className={`${styles.planButton} ${styles.proButtonSecondary}`}
                  onClick={() => handleProCheckout(PRO_YEARLY_PRICE_ID)}
                  disabled={!!checkoutLoading}
                >
                  {checkoutLoading === PRO_YEARLY_PRICE_ID ? 'Processing...' : 'Subscribe yearly — $9.99/yr'}
                </button>
              </>
            )}
          </article>
        </div>
      </main>

      {authOpen ? (
        <AuthModal
          onClose={handleAuthClose}
          initialSignUp={signUpMode}
        />
      ) : null}
    </div>
  )
}
