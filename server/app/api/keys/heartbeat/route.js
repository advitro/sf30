const { NextResponse } = require('next/server')
const { prisma } = require('../../../../lib/prisma')

async function POST(request) {
  try {
    const body = await request.json()
    const { key, fingerprint } = body

    if (!key || !fingerprint) {
      return NextResponse.json({ kill: true, reason: 'missing-fields' }, { status: 400 })
    }

    const record = await prisma.apiKey.findUnique({ where: { key } })

    if (!record) {
      return NextResponse.json({ kill: true, reason: 'invalid-key' }, { status: 401 })
    }

    if (record.status !== 'active') {
      return NextResponse.json({ kill: true, reason: 'revoked' })
    }

    if (record.subscriptionStatus === 'cancelled' || record.subscriptionStatus === 'expired') {
      return NextResponse.json({ kill: true, reason: 'subscription-inactive' })
    }

    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      return NextResponse.json({ kill: true, reason: 'expired' })
    }

    if (record.registeredDeviceFp && record.registeredDeviceFp !== fingerprint) {
      return NextResponse.json({ kill: true, reason: 'device-mismatch' })
    }

    await prisma.apiKey.update({
      where: { id: record.id },
      data: { lastSeenAt: new Date() },
    })

    return NextResponse.json({ kill: false })
  } catch (err) {
    console.error('Heartbeat error:', err)
    return NextResponse.json({ kill: true, reason: 'server-error' }, { status: 500 })
  }
}

module.exports = { POST }
