import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'
import { easedTransitionProgress } from './transitionEasing'

export function applySlide(params: TransformParams): void {
  const { progress, x, y, w, h, imgEl, animation, elapsedTime, zoomIntensity, transitionDirection, transitionSlideEasing } = params

  const ease = easedTransitionProgress(progress, transitionSlideEasing)
  
  let offsetX = 0
  let offsetY = 0
  
  // Calculate offset based on direction. The item slides in from the edge of its target bounds.
  if (transitionDirection === 'left') {
    offsetX = -w * (1 - ease)
  } else if (transitionDirection === 'right') {
    offsetX = w * (1 - ease)
  } else if (transitionDirection === 'top') {
    offsetY = -h * (1 - ease)
  } else if (transitionDirection === 'bottom') {
    offsetY = h * (1 - ease)
  }
  
  drawWithAnimation(
    { ...params, x: x + offsetX, y: y + offsetY },
    imgEl,
    animation,
    progress,
    elapsedTime,
    zoomIntensity
  )
}
