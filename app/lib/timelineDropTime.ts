export function clientXToTimelineTime(
  clientX: number,
  scrollContainerEl: HTMLElement,
  totalDuration: number,
  effectivePadding: number
): number {
  const rect = scrollContainerEl.getBoundingClientRect()
  const scrollLeft = scrollContainerEl.scrollLeft
  const xInContent = clientX - rect.left + scrollLeft
  const scrollWidth = scrollContainerEl.scrollWidth
  if (scrollWidth <= 0) return 0
  const totalWithPadding = totalDuration + effectivePadding * 2
  const t = (xInContent / scrollWidth) * totalWithPadding - effectivePadding
  const maxT = Math.max(0, totalDuration)
  return Math.max(0, Math.min(maxT, t))
}
