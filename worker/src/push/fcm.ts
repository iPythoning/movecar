import type { Env } from '../index'
import type { NotifyPayload, PushResult } from './index'

/**
 * FCM (Firebase Cloud Messaging) via the legacy HTTP API.
 *
 * For MVP we accept the legacy server key (`FCM_SERVER_KEY`) because it's
 * zero-config; Google is deprecating it in 2024+ for HTTP v1. Revisit once
 * the push volume justifies generating OAuth2 tokens from a service account.
 *
 * `tokenValue` is the device/browser registration token captured via
 * Web Push API / Firebase client SDK in the Dashboard.
 */
export async function sendFcm(
  env: Env,
  deviceToken: string,
  payload: NotifyPayload
): Promise<PushResult> {
  if (!env.FCM_SERVER_KEY) {
    return { channel: 'fcm', ok: false, detail: 'FCM_SERVER_KEY_unset' }
  }

  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `key=${env.FCM_SERVER_KEY}`,
    },
    body: JSON.stringify({
      to: deviceToken,
      priority: 'high',
      notification: {
        title: payload.title,
        body: payload.body,
        click_action: payload.url,
      },
      data: {
        url: payload.url ?? '',
        kind: 'movecar_notify',
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return {
      channel: 'fcm',
      ok: false,
      detail: `status=${res.status} body=${body.slice(0, 200)}`,
    }
  }
  const json = (await res.json().catch(() => ({}))) as { failure?: number }
  if (json.failure && json.failure > 0) {
    return { channel: 'fcm', ok: false, detail: 'fcm_reported_failure' }
  }
  return { channel: 'fcm', ok: true }
}
