export function formatTime(seconds: number) {
  const absSeconds = Math.abs(seconds)
  const mins = Math.floor(absSeconds / 60)
  const secs = Math.floor(absSeconds % 60)
  const ms = Math.floor((absSeconds % 1) * 100)
  const prefix = seconds < 0 ? '-' : ''
  return `${prefix}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(ms).padStart(2, '0')}`
}
