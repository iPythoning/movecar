import type { Context } from 'hono'

import type { Env } from '../index'
import { html } from '../lib/html'
import { getMessages, pickLocale } from '../lib/i18n'
import { submitOwnerConfirm } from '../lib/saas-client'
import {
  renderOwnerConfirmPage,
  renderOwnerInvalidPage,
} from '../templates/owner-confirm-page'

/**
 * GET /owner-confirm?token=...&n=...&m=...&lat=...&lng=...
 *
 * The Worker does NOT verify the HMAC token here — it just renders the page.
 * The real verification happens when the user POSTs, because the SaaS side
 * is the source of truth and must enforce single-use. If the token is bad or
 * expired, POST will fail and the SPA handler alerts the user. We could
 * pre-validate via a lightweight /api/internal/token-introspect, but that's
 * an extra round trip with no security benefit — the POST check is enough.
 */
export function handleOwnerConfirmGet(c: Context<{ Bindings: Env }>) {
  const locale = pickLocale(c.req.header('accept-language'))
  const messages = getMessages(locale)

  const token = c.req.query('token')
  const notificationId = c.req.query('n')

  if (!token || !notificationId) {
    return html(renderOwnerInvalidPage(locale, messages), 400)
  }

  // Optional: message + location hints from the push URL (from Worker notify)
  const message = c.req.query('m') ?? undefined
  const lat = Number(c.req.query('lat'))
  const lng = Number(c.req.query('lng'))
  const requesterLocation =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : undefined

  return html(
    renderOwnerConfirmPage({
      token,
      notificationId,
      message,
      requesterLocation,
      locale,
      messages,
    })
  )
}

interface OwnerConfirmBody {
  oneTimeToken?: string
  notificationId?: string
  ownerReply?: string
  ownerLocation?: { lat: number; lng: number } | null
}

export async function handleOwnerConfirmPost(
  c: Context<{ Bindings: Env }>
) {
  let body: OwnerConfirmBody
  try {
    body = await c.req.json<OwnerConfirmBody>()
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!body.oneTimeToken || !body.notificationId || !body.ownerReply) {
    return c.json({ ok: false, error: 'missing_fields' }, 400)
  }

  try {
    const res = await submitOwnerConfirm(c.env, {
      oneTimeToken: body.oneTimeToken,
      notificationId: body.notificationId,
      ownerReply: body.ownerReply,
      ownerLocation: body.ownerLocation ?? undefined,
    })
    return c.json({ ok: true, success: res.success })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('→ 401')) {
      return c.json({ ok: false, error: 'invalid_token' }, 401)
    }
    if (msg.includes('→ 410')) {
      return c.json({ ok: false, error: 'already_replied' }, 410)
    }
    console.error('[owner-confirm] submit failed', err)
    return c.json({ ok: false, error: 'saas_unavailable' }, 502)
  }
}
