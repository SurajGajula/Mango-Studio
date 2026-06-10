import { FREE_MONTHLY_REQUESTS, PRO_MONTHLY_REQUESTS } from '@/app/lib/planLimits'

export const PRO_MONTHLY_PRICE_ID = 'price_1TDHic3IV9DJPgcHmATr9iJ5'
export const PRO_YEARLY_PRICE_ID = 'price_1TDHim3IV9DJPgcHJwCEcKuh'

export const FREE_PLAN_FEATURES = [
  'HD exporting',
  'All transitions, animations, and effects',
  `${FREE_MONTHLY_REQUESTS} AI chats per month`,
  'Literally everything else',
] as const

export const PRO_PLAN_FEATURES = [
  `${PRO_MONTHLY_REQUESTS} AI chats per month (Even I don't use up all 1000 and I built this)`,
  'AI image generation and editing from chat',
  'AI video generation and talking animation from chat',
  'AI speech generation and transcription from chat',
] as const

export async function startProCheckout(priceId: string) {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId }),
  })

  const data = await response.json()
  if (data.url) {
    window.location.href = data.url
    return
  }

  throw new Error(data.error || 'Failed to create checkout session')
}

export async function openCustomerPortal() {
  const response = await fetch('/api/customer-portal', { method: 'POST' })
  const data = await response.json()
  if (data.url) {
    window.location.href = data.url
    return
  }

  throw new Error(data.error || 'Failed to open billing portal')
}
