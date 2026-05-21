const DOUBLE_CLICK_MS = 450
const lastClickAtByKey = new Map<string, number>()

export function handleTimelineClipMouseDown(
  key: string,
  e: React.MouseEvent,
  onDouble: () => void,
  onDragStart: (e: React.MouseEvent) => void
): void {
  if (e.button !== 0) return
  const now = Date.now()
  const last = lastClickAtByKey.get(key)
  if (last !== undefined && now - last < DOUBLE_CLICK_MS) {
    lastClickAtByKey.delete(key)
    e.stopPropagation()
    e.preventDefault()
    onDouble()
    return
  }
  lastClickAtByKey.set(key, now)
  onDragStart(e)
}
