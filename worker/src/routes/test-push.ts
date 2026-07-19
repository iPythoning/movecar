import type { Context } from 'hono'

import type { Env } from '../index'
import { verifyInternalRequest } from '../lib/internal-auth'
import { rateLimit } from '../middleware/rate-limit'
import { dispatchPush, type Channel } from '../push'

const CHANNELS: readonly Channel[] = ['bark', 'fcm', 'telegram', 'email']

interface TestPushBody {
  userId?: string
  channel?: string
  tokenValue?: string
}

export async function handleTestPush(c: Context<{ Bindings: Env }>) {
  const rawBody = await c.req.text()
  if (!(await verifyInternalRequest(c.req.raw, c.env, rawBody))) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }

  let body: TestPushBody
  try {
    body = JSON.parse(rawBody) as TestPushBody
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400)
  }

  const channel = body.channel as Channel | undefined
  const userId = body.userId?.trim()
  const tokenValue = body.tokenValue?.trim()
  if (
    !userId || userId.length > 128 ||
    !channel || !CHANNELS.includes(channel) ||
    !tokenValue || tokenValue.length > 1000
  ) {
    return c.json({ ok: false, error: 'invalid_input' }, 400)
  }

  const limit = await rateLimit(c.env, userId, {
    scope: 'test-push:user',
    max: 3,
    windowSeconds: 10 * 60,
  })
  if (!limit.ok) {
    return c.json({ ok: false, error: 'rate_limited' }, 429, {
      'retry-after': String(limit.retryAfter),
    })
  }

  const [result] = await dispatchPush(c.env, [{ channel, tokenValue }], {
    title: 'MoveCar test notification',
    body: 'Your MoveCar notification channel is working.',
    url: `${c.env.SAAS_API_URL.replace(/\/$/, '')}/dashboard/movecar/notifications`,
    level: 'timeSensitive',
  })

  if (!result?.ok) {
    return c.json({ ok: false, error: 'delivery_failed' }, 502)
  }
  return c.json({ ok: true, channel })
}

