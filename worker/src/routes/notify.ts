import type { Context } from 'hono'

import type { Env } from '../index'
import { getClientIp } from '../middleware/rate-limit'
import { dispatchPush, type NotifyPayload } from '../push'
import { reportDelivery, submitNotify } from '../lib/saas-client'

interface NotifyBody {
  shortCode?: string
  message?: string
  requesterLocation?: { lat: number; lng: number } | null
}

export async function handleNotify(c: Context<{ Bindings: Env }>) {
  let body: NotifyBody
  try {
    body = await c.req.json<NotifyBody>()
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400)
  }
  if (!body.shortCode) {
    return c.json({ ok: false, error: 'missing_short_code' }, 400)
  }

  const requesterIp = getClientIp(c.req.raw)

  let saasRes
  try {
    saasRes = await submitNotify(c.env, {
      shortCode: body.shortCode,
      message: body.message,
      requesterLocation: body.requesterLocation ?? undefined,
      requesterIp,
    })
  } catch (err) {
    console.error('[notify] saas submit failed', err)
    return c.json({ ok: false, error: 'saas_unavailable' }, 502)
  }

  const payload: NotifyPayload = {
    title: '🚗 MoveCar',
    body: body.message?.slice(0, 200) || 'Someone is asking you to move your car',
    url: `${c.env.SAAS_API_URL.replace(/\/$/, '')}/owner-confirm?token=${encodeURIComponent(saasRes.oneTimeToken)}&n=${encodeURIComponent(saasRes.notificationId)}`,
    level: 'timeSensitive',
  }

  // Delayed delivery: requester didn't grant location — 30s anti-abuse wait
  if (saasRes.delayedUntil) {
    const delayMs = Math.max(0, saasRes.delayedUntil * 1000 - Date.now())
    c.executionCtx.waitUntil(
      (async () => {
        if (delayMs > 0) await sleep(delayMs)
        await pushAndReport(c, saasRes.notificationId, saasRes.pushTokens, payload)
      })()
    )
    return c.json({
      ok: true,
      notificationId: saasRes.notificationId,
      delayedUntil: saasRes.delayedUntil,
    })
  }

  // Immediate delivery but don't block the HTTP response on network I/O
  c.executionCtx.waitUntil(
    pushAndReport(c, saasRes.notificationId, saasRes.pushTokens, payload)
  )

  return c.json({
    ok: true,
    notificationId: saasRes.notificationId,
  })
}

async function pushAndReport(
  c: Context<{ Bindings: Env }>,
  notificationId: string,
  tokens: Array<{ channel: string; tokenValue: string }>,
  payload: NotifyPayload
): Promise<void> {
  try {
    const results = await dispatchPush(
      c.env,
      tokens as Parameters<typeof dispatchPush>[1],
      payload
    )
    const channelsSent = results.filter((r) => r.ok).map((r) => r.channel)
    const channelsFailed = results
      .filter((r) => !r.ok)
      .map((r) => `${r.channel}:${r.detail ?? 'unknown'}`)
    await reportDelivery(c.env, notificationId, {
      channelsSent,
      channelsFailed,
    })
  } catch (err) {
    console.error('[notify] dispatch/report failed', err)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
