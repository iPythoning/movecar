import 'server-only'

/**
 * HMAC protocol for Worker ↔ SaaS internal API.
 *
 * Request headers:
 *   X-Internal-Signature: hex-encoded HMAC-SHA256 of `${timestamp}.${method}.${path}.${rawBody}`
 *   X-Internal-Timestamp: unix seconds (±300s tolerance)
 *   X-Internal-Event-Id:  optional uuid, used for idempotency when present
 *
 * The shared secret is `WORKER_SECRET` (same value in Worker and SaaS env).
 * Keep this module server-only; never import from client components.
 */

const TIMESTAMP_TOLERANCE_SECONDS = 300

export interface InternalAuthResult {
  ok: boolean
  error?: 'missing_signature' | 'bad_timestamp' | 'bad_signature' | 'no_secret'
}

function hexFromBytes(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let out = ''
  for (let i = 0; i < view.length; i++) {
    out += view[i]!.toString(16).padStart(2, '0')
  }
  return out
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return hexFromBytes(sig)
}

/**
 * Constant-time string comparison to avoid timing leaks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export async function verifyInternalRequest(
  req: Request,
  rawBody: string
): Promise<InternalAuthResult> {
  const secret = process.env.WORKER_SECRET
  if (!secret) return { ok: false, error: 'no_secret' }

  const sig = req.headers.get('x-internal-signature') ?? ''
  const tsStr = req.headers.get('x-internal-timestamp') ?? ''
  if (!sig || !tsStr) return { ok: false, error: 'missing_signature' }

  const ts = Number(tsStr)
  if (!Number.isFinite(ts)) return { ok: false, error: 'bad_timestamp' }
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, error: 'bad_timestamp' }
  }

  const url = new URL(req.url)
  const path = url.pathname + url.search
  const payload = `${ts}.${req.method.toUpperCase()}.${path}.${rawBody}`
  const expected = await hmacSha256Hex(secret, payload)
  if (!timingSafeEqual(expected, sig)) return { ok: false, error: 'bad_signature' }
  return { ok: true }
}

// --- One-time token (for owner-confirm flow) -------------------------------

export interface OneTimeTokenPayload {
  /** notification id (maps 1:1) */
  n: string
  /** expiry unix seconds */
  e: number
}

function base64UrlEncode(s: string): string {
  return Buffer.from(s, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(s: string): string {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(
    padded.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf-8')
}

export async function signOneTimeToken(
  payload: OneTimeTokenPayload
): Promise<string> {
  const secret = process.env.WORKER_SECRET
  if (!secret) throw new Error('WORKER_SECRET not set')
  const body = base64UrlEncode(JSON.stringify(payload))
  const sig = await hmacSha256Hex(secret, body)
  return `${body}.${sig}`
}

export async function verifyOneTimeToken(
  token: string
): Promise<OneTimeTokenPayload | null> {
  const secret = process.env.WORKER_SECRET
  if (!secret) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts as [string, string]
  const expected = await hmacSha256Hex(secret, body)
  if (!timingSafeEqual(expected, sig)) return null
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as OneTimeTokenPayload
    if (typeof payload.n !== 'string' || typeof payload.e !== 'number') return null
    if (payload.e < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export const ONE_TIME_TOKEN_TTL_SECONDS = 5 * 60
