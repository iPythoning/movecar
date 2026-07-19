import { pushEmail } from '../lib/saas-client'
import type { Env } from '../index'
import type { NotifyPayload, PushResult } from './index'

/**
 * Email push — delegated to the SaaS side where Resend is configured.
 * The edge Worker pings `/api/internal/movecar/push-email` with HMAC auth.
 */
export async function sendEmail(
  env: Env,
  email: string,
  payload: NotifyPayload
): Promise<PushResult> {
  try {
    await pushEmail(env, {
      to: email,
      subject: payload.title,
      html: `<p>${escapeHtml(payload.body)}</p>${payload.url ? `<p><a href="${payload.url}">View</a></p>` : ''}`,
      text: payload.body,
    })
    return { channel: 'email', ok: true }
  } catch (err) {
    return {
      channel: 'email',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
