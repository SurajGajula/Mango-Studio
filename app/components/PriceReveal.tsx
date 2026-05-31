'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import styles from './SplashPage.module.css'

const COUNTDOWN_PRICES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const
const START_DELAY_MS = 500
const COUNTDOWN_STEPS = COUNTDOWN_PRICES.length - 1
const RAMP_CAP_STEP = 6

function getRamp(stepIndex: number) {
  const cappedIndex = Math.min(stepIndex, RAMP_CAP_STEP)
  return (cappedIndex / (COUNTDOWN_STEPS - 1)) ** 2
}

function getStepDelayMs(stepIndex: number) {
  const startMs = 520
  const endMs = 55
  const ramp = getRamp(stepIndex)
  return Math.round(startMs - (startMs - endMs) * ramp)
}

function getSlideDurations(stepIndex: number) {
  const ramp = getRamp(stepIndex)
  return {
    out: 0.16 - ramp * 0.07,
    in: 0.22 - ramp * 0.1,
  }
}

export default function PriceReveal() {
  const [label, setLabel] = useState('$10')
  const displayRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = displayRef.current
    if (!el) return

    let cancelled = false
    gsap.set(el, { y: 0, opacity: 1, scale: 1 })

    const timers: ReturnType<typeof setTimeout>[] = []
    let step = 1

    const slideTo = (nextLabel: string, stepIndex: number, onDone?: () => void) => {
      const { out, in: inDuration } = getSlideDurations(stepIndex)

      gsap.to(el, {
        y: '-110%',
        opacity: 0,
        duration: out,
        ease: 'power2.in',
        onComplete: () => {
          if (cancelled) return
          setLabel(nextLabel)
          gsap.set(el, { y: '110%', opacity: 0 })
          requestAnimationFrame(() => {
            if (cancelled) return
            gsap.to(el, {
              y: 0,
              opacity: 1,
              duration: inDuration,
              ease: 'power2.out',
              onComplete: onDone,
            })
          })
        },
      })
    }

    const revealFree = () => {
      if (cancelled) return

      gsap.to(el, {
        y: '-110%',
        opacity: 0,
        scale: 0.92,
        duration: 0.18,
        ease: 'power2.in',
        onComplete: () => {
          if (cancelled) return
          setLabel('Free')
          gsap.set(el, { y: '110%', opacity: 0, scale: 0.88 })
          requestAnimationFrame(() => {
            if (cancelled) return
            gsap.to(el, {
              y: 0,
              opacity: 1,
              scale: 1,
              duration: 0.44,
              ease: 'back.out(2)',
            })
          })
        },
      })
    }

    const tick = () => {
      if (cancelled) return

      if (step >= COUNTDOWN_PRICES.length) {
        revealFree()
        return
      }

      const stepIndex = step - 1
      slideTo(`$${COUNTDOWN_PRICES[step]}`, stepIndex)
      step += 1
      timers.push(setTimeout(tick, getStepDelayMs(stepIndex)))
    }

    timers.push(setTimeout(tick, START_DELAY_MS))

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      gsap.killTweensOf(el)
    }
  }, [])

  return (
    <div className={styles.priceRevealShell}>
      <p ref={displayRef} className={styles.priceReveal} aria-live="polite">
        {label}
      </p>
    </div>
  )
}
