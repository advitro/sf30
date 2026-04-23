import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'change-me')

async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET, { clockTolerance: 60 })
    return payload.role === 'admin'
  } catch {
    return false
  }
}

export async function middleware(request) {
  const token = request.cookies.get('admin_session')?.value
  const isValid = token ? await verifySession(token) : false

  if (!isValid) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|api/auth/login|api/keys/verify|api/keys/heartbeat|api/keys/refresh).*)',
  ],
}
