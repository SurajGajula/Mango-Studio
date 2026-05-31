'use client'

import { useState } from 'react'
import Link from 'next/link'
import AuthModal from './modals/AuthModal'
import PriceReveal from './PriceReveal'
import styles from './SplashPage.module.css'

const FEATURES = [
  {
    title: 'Free HD export',
    description: 'Export finished videos in high definition — no watermark, no desktop app required.',
    gradient: 'linear-gradient(145deg, #1f1f1f 0%, #2a2520 50%, #1a1a1a 100%)',
  },
  {
    title: 'Fully web, no app',
    description: 'Edit entirely in your browser. Nothing to download or install.',
    gradient: 'linear-gradient(145deg, #1a1f2a 0%, #1a1a1a 50%, #141820 100%)',
  },
  {
    title: 'Project storage',
    description: 'Save projects to the cloud and pick up where you left off on any device.',
    gradient: 'linear-gradient(145deg, #1a221f 0%, #1a1a1a 50%, #152018 100%)',
  },
  {
    title: 'Smooth timeline editing',
    description: 'Drag, split, trim, and arrange video, images, audio, and text on a multi-track timeline.',
    gradient: 'linear-gradient(145deg, #221a2a 0%, #1a1a1a 50%, #181420 100%)',
  },
  {
    title: 'AI chat',
    description: 'Describe edits in plain English and let the assistant update your timeline for you.',
    gradient: 'linear-gradient(145deg, #2a2018 0%, #1a1a1a 50%, #221810 100%)',
  },
  {
    title: 'Transitions, effects & animations',
    description: 'Fade, slide, zoom, CRT, glitch, and more — all included at no extra cost.',
    gradient: 'linear-gradient(145deg, #2a1a22 0%, #1a1a1a 50%, #201018 100%)',
  },
  {
    title: 'Media library',
    description: 'Upload and organize videos, images, and audio in folders — drag straight onto the timeline.',
    gradient: 'linear-gradient(145deg, #1a2228 0%, #1a1a1a 50%, #141820 100%)',
  },
  {
    title: 'Text overlays',
    description: 'Add titles and captions with custom fonts, styles, and keyboard animations.',
    gradient: 'linear-gradient(145deg, #22221a 0%, #1a1a1a 50%, #201810 100%)',
  },
  {
    title: 'Speed & pitch control',
    description: 'Ramp playback speed, adjust audio pitch, and normalize volume across tracks.',
    gradient: 'linear-gradient(145deg, #1a2028 0%, #1a1a1a 50%, #141820 100%)',
  },
  {
    title: 'Undo & redo',
    description: 'Every change is tracked so you can experiment freely and revert anytime.',
    gradient: 'linear-gradient(145deg, #201a28 0%, #1a1a1a 50%, #181420 100%)',
  },
  {
    title: 'Real-time preview',
    description: 'Watch edits update instantly as you move clips, apply effects, or chat with AI.',
    gradient: 'linear-gradient(145deg, #1a2822 0%, #1a1a1a 50%, #142018 100%)',
  },
  {
    title: 'Crop & aspect ratio',
    description: 'Reframe clips and images to fit your canvas without leaving the editor.',
    gradient: 'linear-gradient(145deg, #28221a 0%, #1a1a1a 50%, #201810 100%)',
  },
] as const

export default function SplashPage() {
  const [authOpen, setAuthOpen] = useState(false)
  const [signUpMode, setSignUpMode] = useState(false)

  const openSignIn = () => {
    setSignUpMode(false)
    setAuthOpen(true)
  }

  const openSignUp = () => {
    setSignUpMode(true)
    setAuthOpen(true)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.logo}>Mango Studio</h1>
        <div className={styles.headerActions}>
          <Link href="/pricing" className={styles.pricingLink}>
            Pricing
          </Link>
          <button type="button" className={styles.signInButton} onClick={openSignIn}>
            Sign in
          </button>
          <button type="button" className={styles.getStartedButton} onClick={openSignUp}>
            Sign up
          </button>
        </div>
      </header>

      <main className={styles.features}>
        <div className={styles.taglineBlock}>
          <h2 className={styles.tagline}>Make Viral Videos</h2>
          <p className={styles.taglineFor}>for</p>
          <PriceReveal />
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className={styles.featureCard}
              style={{ background: feature.gradient }}
            >
              <h2 className={styles.featureTitle}>{feature.title}</h2>
              <p className={styles.featureDescription}>{feature.description}</p>
            </article>
          ))}
        </div>
      </main>

      {authOpen ? (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          initialSignUp={signUpMode}
        />
      ) : null}
    </div>
  )
}
