const { NextResponse } = require('next/server')
const { prisma } = require('../../../../lib/prisma')
const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''

async function POST(request) {
  try {
    const payload = await request.text()
    const signature = request.headers.get('stripe-signature')

    let event
    try {
      event = stripe.webhooks.constructEvent(payload, signature, WEBHOOK_SECRET)
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message)
      return NextResponse.json({ error: 'invalid-signature' }, { status: 400 })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const keyId = session.metadata?.keyId
      if (keyId) {
        await prisma.apiKey.update({
          where: { id: keyId },
          data: {
            paymentStatus: 'paid',
            status: 'active',
            subscriptionTier: 'pro',
            subscriptionStatus: 'active',
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
          },
        })
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object
      const subId = invoice.subscription
      if (subId) {
        await prisma.apiKey.updateMany({
          where: { stripeSubscriptionId: subId },
          data: { subscriptionStatus: 'past_due' },
        })
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      const subId = subscription.id
      if (subId) {
        await prisma.apiKey.updateMany({
          where: { stripeSubscriptionId: subId },
          data: { subscriptionStatus: 'cancelled', status: 'inactive' },
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Stripe webhook error:', err)
    return NextResponse.json({ error: 'server-error' }, { status: 500 })
  }
}

module.exports = { POST }
