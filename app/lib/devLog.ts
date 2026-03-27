export function devLog(message: string, data?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  const payload = { t: Date.now(), message, ...data }
  console.info('[SeedanceDev]', message, payload)
  void fetch('/api/debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.warn('[SeedanceDev] POST /api/debug-log', res.status, await res.text().catch(() => ''))
      }
    })
    .catch((err) => {
      console.warn('[SeedanceDev] POST /api/debug-log fetch', err)
    })
}
