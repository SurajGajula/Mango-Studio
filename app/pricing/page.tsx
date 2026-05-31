import type { Metadata } from 'next'
import PricingPage from '@/app/components/PricingPage'

export const metadata: Metadata = {
  title: 'Pricing — Mango Studio',
  description: 'Free and Pro plans for Mango Studio.',
}

export default function Pricing() {
  return <PricingPage />
}
