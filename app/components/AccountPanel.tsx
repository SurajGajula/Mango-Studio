'use client'

import { useState } from 'react'
import { useAuth } from './AuthProvider'
import PaymentModal from './modals/PaymentModal'
import SolidColorPresetStrip from './ui/SolidColorPresetStrip'
import { addSolidShapePresetAtPlayhead } from '@/app/lib/addImageAtPlayhead'
import styles from './AccountPanel.module.css'

export default function AccountPanel() {
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

  return (
    <div className={styles.container}>
      {user ? (
        <div className={styles.header}>
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
        </div>
      ) : null}

      <div className={styles.mediaSection}>
        <p className={styles.mediaSectionLabel}>Media</p>
        <SolidColorPresetStrip onPick={(shape, color, name) => void addSolidShapePresetAtPlayhead(color, name, shape)} />
      </div>

      {showPaymentModal && <PaymentModal onClose={() => setShowPaymentModal(false)} />}
    </div>
  )
}
