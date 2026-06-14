'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import AuthModal from './modals/AuthModal'
import PriceReveal from './PriceReveal'
import { useIsMobileViewport } from '@/app/hooks/useIsMobileViewport'
import styles from './SplashPage.module.css'

const ICONS: Record<string, ReactNode> = {
  export: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  web: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
    </>
  ),
  cloud: <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.34 9 4 4 0 0 0 7 17h10.5Z" />,
  timeline: (
    <>
      <rect x="3" y="5" width="18" height="4" rx="1" />
      <rect x="3" y="11" width="12" height="4" rx="1" />
      <rect x="3" y="17" width="15" height="4" rx="1" />
    </>
  ),
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  sparkle: <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  text: (
    <>
      <path d="M4 7V5h16v2" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="m13.4 10.6 3.6-3.6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  undo: (
    <>
      <path d="M3 7v6h6" />
      <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 9 5 3-5 3Z" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </>
  ),
}

const FEATURES = [
  {
    title: 'Free HD export',
    description: 'Export finished videos in high definition — no watermark, no desktop app required.',
    gradient: 'linear-gradient(145deg, #1f1f1f 0%, #2a2520 50%, #1a1a1a 100%)',
    icon: 'export',
  },
  {
    title: 'Fully web, no app',
    description: 'Edit entirely in your browser. Nothing to download or install.',
    gradient: 'linear-gradient(145deg, #1a1f2a 0%, #1a1a1a 50%, #141820 100%)',
    icon: 'web',
  },
  {
    title: 'Project storage',
    description: 'Save projects to the cloud and pick up where you left off on any device.',
    gradient: 'linear-gradient(145deg, #1a221f 0%, #1a1a1a 50%, #152018 100%)',
    icon: 'cloud',
  },
  {
    title: 'Smooth timeline editing',
    description: 'Drag, split, trim, and arrange video, images, audio, and text on a multi-track timeline.',
    gradient: 'linear-gradient(145deg, #221a2a 0%, #1a1a1a 50%, #181420 100%)',
    icon: 'timeline',
  },
  {
    title: 'AI chat',
    description: 'Describe edits in plain English and let the assistant update your timeline for you.',
    gradient: 'linear-gradient(145deg, #2a2018 0%, #1a1a1a 50%, #221810 100%)',
    icon: 'chat',
  },
  {
    title: 'Transitions, effects & animations',
    description: 'Fade, slide, zoom, CRT, glitch, and more — all included at no extra cost.',
    gradient: 'linear-gradient(145deg, #2a1a22 0%, #1a1a1a 50%, #201018 100%)',
    icon: 'sparkle',
  },
  {
    title: 'Media library',
    description: 'Upload and organize videos, images, and audio in folders — drag straight onto the timeline.',
    gradient: 'linear-gradient(145deg, #1a2228 0%, #1a1a1a 50%, #141820 100%)',
    icon: 'folder',
  },
  {
    title: 'Text overlays',
    description: 'Add titles and captions with custom fonts, styles, and keyboard animations.',
    gradient: 'linear-gradient(145deg, #22221a 0%, #1a1a1a 50%, #201810 100%)',
    icon: 'text',
  },
  {
    title: 'Speed & pitch control',
    description: 'Ramp playback speed, adjust audio pitch, and normalize volume across tracks.',
    gradient: 'linear-gradient(145deg, #1a2028 0%, #1a1a1a 50%, #141820 100%)',
    icon: 'gauge',
  },
  {
    title: 'Undo & redo',
    description: 'Every change is tracked so you can experiment freely and revert anytime.',
    gradient: 'linear-gradient(145deg, #201a28 0%, #1a1a1a 50%, #181420 100%)',
    icon: 'undo',
  },
  {
    title: 'Real-time preview',
    description: 'Watch edits update instantly as you move clips, apply effects, or chat with AI.',
    gradient: 'linear-gradient(145deg, #1a2822 0%, #1a1a1a 50%, #142018 100%)',
    icon: 'play',
  },
  {
    title: 'Crop & aspect ratio',
    description: 'Reframe clips and images to fit your canvas without leaving the editor.',
    gradient: 'linear-gradient(145deg, #28221a 0%, #1a1a1a 50%, #201810 100%)',
    icon: 'crop',
  },
] as const

function FeatureIcon({ name }: { name: string }) {
  return (
    <svg
      className={styles.featureIconSvg}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

export default function SplashPage() {
  const isMobile = useIsMobileViewport()
  const [authOpen, setAuthOpen] = useState(false)
  const [signUpMode, setSignUpMode] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const copySiteLink = async () => {
    await navigator.clipboard.writeText(window.location.origin)
    setLinkCopied(true)
    window.setTimeout(() => setLinkCopied(false), 2000)
  }

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
      {isMobile ? (
        <div className={styles.mobileNotice}>
          <p className={styles.mobileNoticeText}>
            Mango Studio is built for desktop. Open this page on your computer to edit.
          </p>
          <button type="button" className={styles.mobileNoticeButton} onClick={copySiteLink}>
            {linkCopied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      ) : null}
      <header className={styles.header}>
        <h1 className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true" />
          Mango Studio
        </h1>
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

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.taglineBlock}>
            <h2 className={styles.tagline}>Make Viral Videos</h2>
            <p className={styles.taglineFor}>for</p>
            <PriceReveal />
          </div>
          <div className={styles.heroCtas}>
            <button type="button" className={styles.heroCtaPrimary} onClick={openSignUp}>
              Start editing free
            </button>
            <Link href="/pricing" className={styles.heroCtaSecondary}>
              See pricing
            </Link>
          </div>
        </section>

        <section className={styles.featuresSection}>
          <p className={styles.featuresEyebrow}>Features</p>
          <div className={styles.featureGrid}>
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className={styles.featureCard}
                style={{ background: feature.gradient }}
              >
                <span className={styles.featureIcon}>
                  <FeatureIcon name={feature.icon} />
                </span>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureDescription}>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>
          <span className={styles.logoMark} aria-hidden="true" />
          Mango Studio
        </span>
        <Link href="/pricing" className={styles.footerLink}>
          Pricing
        </Link>
      </footer>

      {authOpen ? (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          initialSignUp={signUpMode}
        />
      ) : null}
    </div>
  )
}
