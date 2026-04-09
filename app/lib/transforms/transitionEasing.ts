import type { SlideTransitionEasing } from '@/app/models/ImageClass'

export function easedTransitionProgress(t: number, mode: SlideTransitionEasing | undefined): number {
  const x = Math.max(0, Math.min(1, t))
  const m = mode ?? 'smooth'
  if (m === 'linear') return x
  if (m === 'ease-in') return x * x * x
  if (m === 'ease-out') {
    const u = 1 - x
    return 1 - u * u * u
  }
  return x * x * (3 - 2 * x)
}
