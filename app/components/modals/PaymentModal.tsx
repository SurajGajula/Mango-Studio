'use client'

import { useState } from 'react'
import { useAuth } from '../AuthProvider'
import styles from './PaymentModal.module.css'

interface PaymentModalProps {
  onClose: () => void
}

export default function PaymentModal({ onClose }: PaymentModalProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const { user } = useAuth()

  const handleCheckout = async (priceId: string) => {
    if (!user) return

    setLoading(priceId)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId }),
      })

      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to create checkout session')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Checkout failed. Please try again later.')
    } finally {
      setLoading(null)
    }
  }

  // Placeholder Price IDs - User should replace these with their own from Stripe Dashboard
  const MONTHLY_PRICE_ID = 'price_1TDHic3IV9DJPgcHmATr9iJ5'
  const YEARLY_PRICE_ID = 'price_1TDHim3IV9DJPgcHJwCEcKuh'

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modalContent}>
        <button className={styles.closeButton} onClick={onClose}>×</button>
        
        <div className={styles.header}>
          <h2>Upgrade to Pro</h2>
          <p>Unleash the full potential of Mango Studio with unlimited AI editing.</p>
        </div>

        <div className={styles.plansGrid}>
          <div className={styles.planCard}>
            <div className={styles.planName}>Monthly</div>
            <div className={styles.price}>$0.99<span>/month</span></div>
            <ul className={styles.features}>
              <li className={styles.featureItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Unlimited AI editing requests
              </li>
              <li className={styles.featureItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Priority processing
              </li>
              <li className={styles.featureItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                1080p 60fps exports
              </li>
            </ul>
            <button 
              className={styles.subscribeButton} 
              onClick={() => handleCheckout(MONTHLY_PRICE_ID)}
              disabled={!!loading}
            >
              {loading === MONTHLY_PRICE_ID ? 'Processing...' : 'Subscribe Now'}
            </button>
          </div>

          <div className={`${styles.planCard} ${styles.popular}`}>
            <div className={styles.badge}>Best Value</div>
            <div className={styles.planName}>Annual</div>
            <div className={styles.price}>$9.99<span>/year</span></div>
            <ul className={styles.features}>
              <li className={styles.featureItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Everything in Monthly
              </li>
              <li className={styles.featureItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Save 20% over monthly
              </li>
              <li className={styles.featureItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                First to get new features
              </li>
            </ul>
            <button 
              className={styles.subscribeButton} 
              onClick={() => handleCheckout(YEARLY_PRICE_ID)}
              disabled={!!loading}
            >
              {loading === YEARLY_PRICE_ID ? 'Processing...' : 'Subscribe Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
