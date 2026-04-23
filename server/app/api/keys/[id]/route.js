const { NextResponse } = require('next/server')
const { prisma } = require('../../../../lib/prisma')

async function PATCH(request, { params }) {
  try {
    const { id } = params
    const body = await request.json()
    const { status, subscriptionTier, expiresAt, subscriptionStatus } = body

    const data = {}
    if (status !== undefined) data.status = status
    if (subscriptionTier !== undefined) data.subscriptionTier = subscriptionTier
    if (subscriptionStatus !== undefined) data.subscriptionStatus = subscriptionStatus
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null

    const updated = await prisma.apiKey.update({
      where: { id },
      data,
    })

    return NextResponse.json({ key: updated })
  } catch (err) {
    console.error('Patch error:', err)
    return NextResponse.json({ error: 'server-error' }, { status: 500 })
  }
}

async function DELETE(request, { params }) {
  try {
    const { id } = params

    await prisma.apiKey.update({
      where: { id },
      data: { status: 'revoked', subscriptionStatus: 'cancelled' },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete error:', err)
    return NextResponse.json({ error: 'server-error' }, { status: 500 })
  }
}

module.exports = { PATCH, DELETE }
