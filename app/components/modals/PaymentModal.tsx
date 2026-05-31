'use client'

import { useState } from 'react'
import { useAuth } from '../AuthProvider'
import { CenteredModal } from '@/app/components/ui/CenteredModal'
import {
  PRO_MONTHLY_PRICE_ID,
  PRO_YEARLY_PRICE_ID,
  PRO_PLAN_FEATURES,
  startProCheckout,
} from '@/app/lib/pricingPlans'
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
      await startProCheckout(priceId)
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Checkout failed. Please try again later.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <CenteredModal onClose={onClose} size="wide">
      <div className={styles.header}>
        <h2>Upgrade to Pro</h2>
        <p>Unleash the full potential of Mango Studio with more AI editing power.</p>
      </div>

      <div className={styles.plansGrid}>
        <div className={styles.planCard}>
          <div className={styles.planName}>Monthly</div>
          <div className={styles.price}>
            $0.99<span>/month</span>
          </div>
          <ul className={styles.features}>
            {PRO_PLAN_FEATURES.map((feature) => (
              <li key={feature} className={styles.featureItem}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
          <button className={styles.subscribeButton} onClick={() => handleCheckout(PRO_MONTHLY_PRICE_ID)} disabled={!!loading}>
            {loading === PRO_MONTHLY_PRICE_ID ? 'Processing...' : 'Subscribe Now'}
          </button>
        </div>

        <div className={`${styles.planCard} ${styles.popularCard}`}>
          <div className={styles.badge}>Best Value</div>
          <div className={styles.planName}>Annual</div>
          <div className={styles.price}>
            $9.99<span>/year</span>
          </div>
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
          <button className={styles.subscribeButton} onClick={() => handleCheckout(PRO_YEARLY_PRICE_ID)} disabled={!!loading}>
            {loading === PRO_YEARLY_PRICE_ID ? 'Processing...' : 'Subscribe Now'}
          </button>
        </div>
      </div>
    </CenteredModal>
  )
}
