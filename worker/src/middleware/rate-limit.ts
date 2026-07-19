import type { Context, Next } from 'hono'

import type { Env } from '../index'

/**
 * KV-backed sliding-ish rate limiter. Good enough for edge + cheap.
 *
 * Pattern: INCR-like via GET + PUT; window is rounded to the minute so
 * two workers in the same minute share the same counter key.
 */

export interface RateLimitRule {
  scope: string
  max: number
  windowSeconds: number
}

function keyFor(scope: string, id: string, windowSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const bucket = Math.floor(now / windowSeconds)
  return `rl:${scope}:${id}:${bucket}`
}

export async function rateLimit(
  env: Env,
  id: string,
  rule: RateLimitRule
): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  const key = keyFor(rule.scope, id, rule.windowSeconds)
  const current = Number((await env.MOVECAR_KV.get(key)) ?? 0)
  if (current >= rule.max) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: rule.windowSeconds,
    }
  }
  await env.MOVECAR_KV.put(key, String(current + 1), {
    expirationTtl: rule.windowSeconds + 5,
  })
  return { ok: true, remaining: rule.max - current - 1, retryAfter: 0 }
}

/** IP extraction prefers Cloudflare's header; falls back to x-forwarded-for. */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ??
    'unknown'
  )
}

/** Hono middleware wrapping `rateLimit` for a given scope. */
export function rateLimitMiddleware(rule: RateLimitRule) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const ip = getClientIp(c.req.raw)
    const res = await rateLimit(c.env, ip, rule)
    if (!res.ok) {
      return c.json(
        { ok: false, error: 'rate_limited' },
        429,
        { 'retry-after': String(res.retryAfter) }
      )
    }
    return next()
  }
}
