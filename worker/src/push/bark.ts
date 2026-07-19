import type { NotifyPayload, PushResult } from './index'

/**
 * Bark push — user supplies a full device URL like
 * `https://api.day.app/XXXXXXXX`. We POST to `<url>` with title/body in JSON.
 *
 * Levels (Bark v2): active | timeSensitive | passive | critical
 */
export async function sendBark(
  url: string,
  payload: NotifyPayload
): Promise<PushResult> {
  // Bark accepts POST JSON on the root URL
  const target = url.replace(/\/$/, '')

  const res = await fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      level: payload.level ?? 'timeSensitive',
      group: 'movecar',
      sound: 'paymentsuccess',
      isArchive: '1',
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return {
      channel: 'bark',
      ok: false,
      detail: `status=${res.status} body=${text.slice(0, 200)}`,
    }
  }
  return { channel: 'bark', ok: true }
}
