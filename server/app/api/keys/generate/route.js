const { NextResponse } = require('next/server')
const { prisma } = require('../../../../lib/prisma')
const crypto = require('crypto')

async function POST(request) {
  try {
    const body = await request.json()
    const { customerEmail, customerName, tier, durationMonths } = body

    if (!customerEmail || !tier || !durationMonths) {
      return NextResponse.json({ error: 'missing-fields' }, { status: 400 })
    }

    const keyValue = 'sg_live_' + crypto.randomBytes(16).toString('hex')
    const now = new Date()
    const expiresAt = new Date(now.getTime() + Number(durationMonths) * 30 * 24 * 60 * 60 * 1000)

    const record = await prisma.apiKey.create({
      data: {
        key: keyValue,
        customerEmail,
        customerName: customerName || null,
        subscriptionTier: tier,
        expiresAt,
        status: 'active',
        subscriptionStatus: 'active',
        paymentStatus: 'paid',
      },
    })

    return NextResponse.json({
      id: record.id,
      key: record.key,
      customerEmail: record.customerEmail,
      tier: record.subscriptionTier,
      expiresAt: record.expiresAt,
    })
  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: 'server-error' }, { status: 500 })
  }
}

module.exports = { POST }
