'use client'

import { useAuth } from '@/app/components/AuthProvider'
import MainView from '@/app/components/MainView'
import SplashPage from '@/app/components/SplashPage'
import styles from './HomeGate.module.css'

export default function HomeGate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className={styles.loadingShell}>
        <div className={styles.loadingLogo}>Mango Studio</div>
      </div>
    )
  }

  if (!user) {
    return <SplashPage />
  }

  return <MainView />
}
