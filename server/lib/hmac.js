const crypto = require('crypto')

const SG_HMAC_KEY = process.env.SG_HMAC_KEY || 'change-me-in-production-min-32-chars'

function signResponse(body) {
  const hmac = crypto.createHmac('sha256', SG_HMAC_KEY)
  hmac.update(JSON.stringify(body))
  return hmac.digest('hex')
}

function verifyResponse(body, signature) {
  const expected = signResponse(body)
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}

module.exports = { signResponse, verifyResponse }
