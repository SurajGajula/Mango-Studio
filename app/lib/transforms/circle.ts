import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'

export function applyCircle(params: TransformParams): void {
  const { ctx, progress, imgEl, animation, elapsedTime, zoomIntensity, animationDuration, x, y, w, h } = params
  
  const t = Math.max(0, Math.min(1, progress))
  
  // Use cubic easing for a smoother, more natural reveal
  const ease = t * t * (3 - 2 * t)

  // Calculate center of the incoming item
  const centerX = x + w / 2
  const centerY = y + h / 2
  
  // Max radius is distance from center to corner
  const maxRadius = Math.sqrt((w / 2) * (w / 2) + (h / 2) * (h / 2))
  const radius = maxRadius * ease

  ctx.save()
  
  // Create a circular clipping mask
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.clip()

  // Draw the current item (incoming) clipped to the circle
  drawWithAnimation(params, imgEl, animation ?? 'none', progress, elapsedTime, zoomIntensity, animationDuration)

  ctx.restore()
}
