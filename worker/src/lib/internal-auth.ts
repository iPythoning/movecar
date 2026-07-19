import type { Env } from '../index'

const TIMESTAMP_TOLERANCE_SECONDS = 300

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  )
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyInternalRequest(
  req: Request,
  env: Env,
  rawBody: string
): Promise<boolean> {
  if (!env.WORKER_SECRET) return false

  const signature = req.headers.get('x-internal-signature') ?? ''
  const timestamp = req.headers.get('x-internal-timestamp') ?? ''
  if (!/^[a-f0-9]{64}$/.test(signature) || !/^\d+$/.test(timestamp)) {
    return false
  }

  const timestampSeconds = Number(timestamp)
  if (!Number.isSafeInteger(timestampSeconds)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false
  }

  const url = new URL(req.url)
  const payload = `${timestamp}.${req.method.toUpperCase()}.${url.pathname}${url.search}.${rawBody}`
  const expected = await hmacSha256Hex(env.WORKER_SECRET, payload)
  return timingSafeEqual(expected, signature)
}

