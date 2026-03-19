import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'

export function applySlide(params: TransformParams): void {
  const { ctx, transition, progress, x, y, w, h, imgEl, animation, elapsedTime, zoomIntensity } = params
  
  // Cubic easing for smooth motion
  const ease = progress * progress * (3 - 2 * progress)
  
  let offsetX = 0
  let offsetY = 0
  
  // Calculate offset based on direction. The item slides in from the edge of its target bounds.
  if (transition === 'slide-in-left') {
    offsetX = -w * (1 - ease)
  } else if (transition === 'slide-in-right') {
    offsetX = w * (1 - ease)
  } else if (transition === 'slide-in-top') {
    offsetY = -h * (1 - ease)
  } else if (transition === 'slide-in-bottom') {
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
