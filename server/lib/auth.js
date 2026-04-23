const { SignJWT, jwtVerify } = require('jose')

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'
const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'change-me')

async function createSession() {
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(SECRET)
  return token
}

async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET, { clockTolerance: 60 })
    return payload.role === 'admin'
  } catch {
    return false
  }
}

function verifyAdminPassword(password) {
  return password === ADMIN_PASSWORD
}

module.exports = { createSession, verifySession, verifyAdminPassword }
