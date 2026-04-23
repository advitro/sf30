const { NextResponse } = require('next/server')
const { prisma } = require('../../../../lib/prisma')
const { signResponse } = require('../../../../lib/hmac')
const { SignJWT } = require('jose')

const SG_HMAC_KEY = new TextEncoder().encode(process.env.SG_HMAC_KEY || 'change-me-in-production-min-32-chars')

async function POST(request) {
  try {
    const body = await request.json()
    const { key, deviceId, fingerprint } = body

    if (!key || !fingerprint) {
      const resp = { authorized: false, error: 'missing-fields' }
      const res = NextResponse.json(resp, { status: 400 })
      res.headers.set('X-Response-Hmac', signResponse(resp))
      return res
    }

    const record = await prisma.apiKey.findUnique({ where: { key } })

    if (!record) {
      const resp = { authorized: false, error: 'invalid-key' }
      const res = NextResponse.json(resp, { status: 401 })
      res.headers.set('X-Response-Hmac', signResponse(resp))
      return res
    }

    if (record.status !== 'active') {
      const resp = { authorized: false, error: 'revoked' }
      const res = NextResponse.json(resp, { status: 403 })
      res.headers.set('X-Response-Hmac', signResponse(resp))
      return res
    }

    if (record.subscriptionStatus === 'cancelled' || record.subscriptionStatus === 'expired') {
      const resp = { authorized: false, error: 'subscription-inactive' }
      const res = NextResponse.json(resp, { status: 403 })
      res.headers.set('X-Response-Hmac', signResponse(resp))
      return res
    }

    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      const resp = { authorized: false, error: 'expired' }
      const res = NextResponse.json(resp, { status: 403 })
      res.headers.set('X-Response-Hmac', signResponse(resp))
      return res
    }

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    if (!record.registeredDeviceFp) {
      await prisma.apiKey.update({
        where: { id: record.id },
        data: { registeredDeviceFp: fingerprint, lastSeenAt: now },
      })
    } else if (record.registeredDeviceFp !== fingerprint) {
      if (record.lastSeenAt && new Date(record.lastSeenAt) > thirtyDaysAgo) {
        const resp = { authorized: false, error: 'device-limit-exceeded' }
        const res = NextResponse.json(resp, { status: 403 })
        res.headers.set('X-Response-Hmac', signResponse(resp))
        return res
      } else {
        await prisma.apiKey.update({
          where: { id: record.id },
          data: { registeredDeviceFp: fingerprint, lastSeenAt: now },
        })
      }
    } else {
      await prisma.apiKey.update({
        where: { id: record.id },
        data: { lastSeenAt: now },
      })
    }

    const expiresAt = new Date(now.getTime() + 3600 * 1000)
    const accessToken = await new SignJWT({
      keyId: record.id,
      fingerprint,
      deviceId: deviceId || null,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(SG_HMAC_KEY)

    const resp = {
      authorized: true,
      accessToken,
      expiresAt: expiresAt.toISOString(),
      subscription: {
        status: record.subscriptionStatus,
        tier: record.subscriptionTier,
      },
    }

    const res = NextResponse.json(resp)
    res.headers.set('X-Response-Hmac', signResponse(resp))
    return res
  } catch (err) {
    console.error('Refresh error:', err)
    const resp = { authorized: false, error: 'server-error' }
    const res = NextResponse.json(resp, { status: 500 })
    res.headers.set('X-Response-Hmac', signResponse(resp))
    return res
  }
}

module.exports = { POST }
