'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ONBOARDING_STEPS, type OnboardingStepPlacement } from './onboardingSteps'
import styles from './OnboardingTour.module.css'

type SpotlightRect = {
  top: number
  left: number
  width: number
  height: number
}

type CardPosition = {
  top: number
  left: number
}

type Props = {
  onComplete: () => void
  onSkip?: () => void
  initialStep?: number
}

const CARD_MARGIN = 16
const CARD_WIDTH = 360
const CARD_HEIGHT_ESTIMATE = 240

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getTargetRect(selector?: string): SpotlightRect | null {
  if (!selector || typeof document === 'undefined') return null
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLElement)) return null
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const padding = 6
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  }
}

function getCardPosition(
  placement: OnboardingStepPlacement,
  spotlight: SpotlightRect | null,
  viewportWidth: number,
  viewportHeight: number
): CardPosition {
  if (!spotlight || placement === 'center') {
    return {
      top: viewportHeight / 2,
      left: viewportWidth / 2,
    }
  }

  const cardWidth = Math.min(CARD_WIDTH, viewportWidth - CARD_MARGIN * 2)

  if (placement === 'right') {
    const left = clamp(
      spotlight.left + spotlight.width + CARD_MARGIN,
      CARD_MARGIN,
      viewportWidth - cardWidth - CARD_MARGIN
    )
    const top = clamp(
      spotlight.top + spotlight.height / 2,
      CARD_HEIGHT_ESTIMATE / 2 + CARD_MARGIN,
      viewportHeight - CARD_HEIGHT_ESTIMATE / 2 - CARD_MARGIN
    )
    return { top, left: left + cardWidth / 2 }
  }

  if (placement === 'left') {
    const left = clamp(
      spotlight.left - CARD_MARGIN,
      cardWidth / 2 + CARD_MARGIN,
      viewportWidth - CARD_MARGIN
    )
    const top = clamp(
      spotlight.top + spotlight.height / 2,
      CARD_HEIGHT_ESTIMATE / 2 + CARD_MARGIN,
      viewportHeight - CARD_HEIGHT_ESTIMATE / 2 - CARD_MARGIN
    )
    return { top, left }
  }

  if (placement === 'bottom') {
    const top = clamp(
      spotlight.top + spotlight.height + CARD_MARGIN + CARD_HEIGHT_ESTIMATE / 2,
      CARD_HEIGHT_ESTIMATE / 2 + CARD_MARGIN,
      viewportHeight - CARD_HEIGHT_ESTIMATE / 2 - CARD_MARGIN
    )
    const left = clamp(
      spotlight.left + spotlight.width / 2,
      cardWidth / 2 + CARD_MARGIN,
      viewportWidth - cardWidth / 2 - CARD_MARGIN
    )
    return { top, left }
  }

  const top = clamp(
    spotlight.top - CARD_MARGIN - CARD_HEIGHT_ESTIMATE / 2,
    CARD_HEIGHT_ESTIMATE / 2 + CARD_MARGIN,
    viewportHeight - CARD_HEIGHT_ESTIMATE / 2 - CARD_MARGIN
  )
  const left = clamp(
    spotlight.left + spotlight.width / 2,
    cardWidth / 2 + CARD_MARGIN,
    viewportWidth - cardWidth / 2 - CARD_MARGIN
  )
  return { top, left }
}

export default function OnboardingTour({ onComplete, onSkip, initialStep = 0 }: Props) {
  const [stepIndex, setStepIndex] = useState(initialStep)
  const [mounted, setMounted] = useState(false)
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)
  const [cardPosition, setCardPosition] = useState<CardPosition>({ top: 0, left: 0 })

  const step = ONBOARDING_STEPS[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1
  const isCentered = !step.target || step.placement === 'center'

  const refreshLayout = useCallback(() => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const nextSpotlight = getTargetRect(step.target)
    const placement = step.placement ?? 'center'
    setSpotlight(nextSpotlight)
    setCardPosition(getCardPosition(placement, nextSpotlight, viewportWidth, viewportHeight))
  }, [step.placement, step.target])

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    refreshLayout()
  }, [refreshLayout, stepIndex])

  useEffect(() => {
    const handleResize = () => refreshLayout()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
    }
  }, [refreshLayout])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onSkip?.()
        onComplete()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onComplete, onSkip])

  const handleNext = () => {
    if (isLastStep) {
      onComplete()
      return
    }
    setStepIndex((current) => Math.min(current + 1, ONBOARDING_STEPS.length - 1))
  }

  const handleBack = () => {
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  const handleSkip = () => {
    onSkip?.()
    onComplete()
  }

  const cardStyle = useMemo(() => {
    if (isCentered) {
      return undefined
    }
    return {
      top: `${cardPosition.top}px`,
      left: `${cardPosition.left}px`,
      transform: 'translate(-50%, -50%)',
    }
  }, [cardPosition.left, cardPosition.top, isCentered])

  if (!mounted || !step) {
    return null
  }

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      {isCentered ? <div className={styles.backdrop} aria-hidden /> : null}
      {!isCentered && spotlight ? (
        <div
          className={styles.spotlight}
          style={{
            top: `${spotlight.top}px`,
            left: `${spotlight.left}px`,
            width: `${spotlight.width}px`,
            height: `${spotlight.height}px`,
          }}
          aria-hidden
        >
          <div className={styles.spotlightPulse} />
        </div>
      ) : null}

      <div
        className={`${styles.card} ${isCentered ? styles.cardCenter : ''}`}
        style={cardStyle}
        data-onboarding-step={step.id}
      >
        <div className={styles.stepMeta}>
          <span className={styles.stepLabel}>
            Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
          </span>
          <div className={styles.progressDots} aria-hidden>
            {ONBOARDING_STEPS.map((entry, index) => (
              <span
                key={entry.id}
                className={`${styles.dot} ${index === stepIndex ? styles.dotActive : ''}`}
              />
            ))}
          </div>
        </div>
        <h2 id="onboarding-title" className={styles.title}>
          {step.title}
        </h2>
        <p className={styles.description}>{step.description}</p>
        {step.tip ? <div className={styles.tip}>{step.tip}</div> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.skipButton} onClick={handleSkip}>
            Skip tour
          </button>
          <div className={styles.primaryActions}>
            {!isFirstStep ? (
              <button type="button" className={styles.backButton} onClick={handleBack}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              className={isLastStep ? styles.doneButton : styles.nextButton}
              onClick={handleNext}
            >
              {isLastStep ? 'Start editing' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
