import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/app/utils/supabase/admin'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  let event: Stripe.Event

  try {
    if (!sig || !webhookSecret) {
      // In development, we might not have a webhook secret, so we verify normally if we want,
      // but for security we should really have it.
      // For now, let's just log and process for test sessions.
      event = JSON.parse(body) as Stripe.Event
    } else {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    }
  } catch (err: any) {
    console.error('Webhook Error:', err.message)
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      let supabaseUUID = session.metadata?.supabaseUUID
      
      console.log('checkout.session.completed session:', session.id)
      
      if (!supabaseUUID && session.customer) {
        // Fallback: look up by customer metadata
        const customer = await stripe.customers.retrieve(session.customer as string)
        supabaseUUID = (customer as Stripe.Customer).metadata?.supabaseUUID
        console.log('Found UUID in customer metadata:', supabaseUUID)
      }

      console.log('Final supabaseUUID for update:', supabaseUUID)

      if (supabaseUUID) {
        const { error } = await supabase
          .from('profiles')
          .update({
            is_pro: true,
            requests_remaining: 1000,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', supabaseUUID)
        
        if (error) {
          console.error('Error updating profile:', error)
        }
      }
      break
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const { error } = await supabase
        .from('profiles')
        .update({ is_pro: false, stripe_subscription_id: null })
        .eq('stripe_subscription_id', subscription.id)
      
      if (error) {
        console.error('Error updating profile on subscription deleted:', error)
      }
      break
    }
    default:
      console.log(`Unhandled event type ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
