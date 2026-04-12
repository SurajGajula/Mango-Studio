import type { TransformParams } from './types'
import { drawWithAnimation } from './animationUtils'
import { applyFade } from './fade'
import { tryApplyMorphWebgl } from '@/app/lib/webgl/morphTransitionWebgl'

export function applyMorph(params: TransformParams): void {
  const { prevEl, prevParams, progress } = params

  if (!prevEl || !prevParams || progress >= 1) return

  if (tryApplyMorphWebgl(params)) return

  drawWithAnimation(
    params,
    params.imgEl,
    params.animation ?? 'none',
    params.progress,
    params.elapsedTime,
    params.zoomIntensity ?? 0.5,
    params.itemDuration,
    params.animationDuration
  )
  applyFade(params)
}
