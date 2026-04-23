import { redirect } from 'next/navigation'
import { prisma } from '../../lib/prisma'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })
const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || ''

export const dynamic = 'force-dynamic'

export default async function UpgradePage({ searchParams }) {
  const key = searchParams?.key

  if (!key) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Missing License Key</h1>
          <p className="mt-2 text-slate-400">Please provide your license key.</p>
        </div>
      </div>
    )
  }

  const record = await prisma.apiKey.findUnique({ where: { key } })

  if (!record) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Key Not Found</h1>
          <p className="mt-2 text-slate-400">This license key does not exist.</p>
        </div>
      </div>
    )
  }

  if (record.subscriptionTier === 'pro' && record.subscriptionStatus === 'active') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Already on Pro</h1>
          <p className="mt-2 text-slate-400">Your license is already upgraded to the Pro plan.</p>
          <a
            href={`/billing-portal?key=${encodeURIComponent(key)}`}
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Manage Billing
          </a>
        </div>
      </div>
    )
  }

  if (!PRO_PRICE_ID) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Upgrade Not Configured</h1>
          <p className="mt-2 text-slate-400">The Pro plan price ID is not set. Please contact support.</p>
        </div>
      </div>
    )
  }

  try {
    // Ensure Stripe customer exists
    let customerId = record.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: record.customerEmail,
        name: record.customerName || undefined,
        metadata: { keyId: record.id },
      })
      customerId = customer.id
      await prisma.apiKey.update({
        where: { id: record.id },
        data: { stripeCustomerId: customerId },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/keys?upgraded=1`,
      cancel_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/keys?canceled=1`,
      metadata: { keyId: record.id },
    })

    redirect(session.url)
  } catch (err) {
    console.error('Upgrade checkout error:', err)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Something Went Wrong</h1>
          <p className="mt-2 text-slate-400">Could not start the upgrade process. Please try again later.</p>
        </div>
      </div>
    )
  }
}
