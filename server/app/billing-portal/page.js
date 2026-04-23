import { redirect } from 'next/navigation'
import { prisma } from '../../lib/prisma'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })

export const dynamic = 'force-dynamic'

export default async function BillingPortalPage({ searchParams }) {
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

  if (!record.stripeCustomerId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold">No Subscription Found</h1>
          <p className="mt-2 text-slate-400">This key does not have an active Stripe subscription.</p>
          <a
            href={`/upgrade?key=${encodeURIComponent(key)}`}
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Subscribe Now
          </a>
        </div>
      </div>
    )
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: record.stripeCustomerId,
      return_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/keys`,
    })
    redirect(session.url)
  } catch (err) {
    console.error('Billing portal error:', err)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Something Went Wrong</h1>
          <p className="mt-2 text-slate-400">Could not open the billing portal. Please try again later.</p>
        </div>
      </div>
    )
  }
}
