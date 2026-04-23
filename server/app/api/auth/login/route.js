const { NextResponse } = require('next/server')
const { verifyAdminPassword, createSession } = require('../../../../lib/auth')

async function POST(request) {
  try {
    const body = await request.json()
    const { password } = body

    if (!password || !verifyAdminPassword(password)) {
      return NextResponse.json({ error: 'invalid-password' }, { status: 401 })
    }

    const token = await createSession()

    const response = NextResponse.json({ success: true })
    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
      path: '/',
    })

    return response
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'server-error' }, { status: 500 })
  }
}

module.exports = { POST }
