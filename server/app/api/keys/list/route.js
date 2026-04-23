const { NextResponse } = require('next/server')
const { prisma } = require('../../../../lib/prisma')

async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const tier = searchParams.get('tier')
    const search = searchParams.get('search')

    const where = {}
    if (status) where.status = status
    if (tier) where.subscriptionTier = tier
    if (search) {
      where.OR = [
        { customerEmail: { contains: search } },
        { customerName: { contains: search } },
      ]
    }

    const keys = await prisma.apiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ keys })
  } catch (err) {
    console.error('List error:', err)
    return NextResponse.json({ error: 'server-error' }, { status: 500 })
  }
}

module.exports = { GET }
