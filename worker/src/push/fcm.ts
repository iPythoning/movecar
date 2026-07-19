import type { Env } from '../index'
import type { NotifyPayload, PushResult } from './index'

/**
 * FCM via the HTTP v1 API. The service account JSON is stored as a
 * Cloudflare Worker secret and never sent to the client.
 */
interface FcmServiceAccount {
  client_email: string
  private_key: string
  project_id: string
}

interface CachedAccessToken {
  clientEmail: string
  value: string
  expiresAt: number
}

let cachedAccessToken: CachedAccessToken | null = null

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return bytes.buffer
}

function parseServiceAccount(raw: string): FcmServiceAccount {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') throw new Error('FCM_SERVICE_ACCOUNT_JSON_invalid')
  const value = parsed as Record<string, unknown>
  const clientEmail = value.client_email
  const privateKey = value.private_key
  const projectId = value.project_id
  if (
    typeof clientEmail !== 'string' ||
    typeof privateKey !== 'string' ||
    typeof projectId !== 'string' ||
    !clientEmail ||
    !privateKey ||
    !projectId
  ) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON_invalid')
  }
  return {
    client_email: clientEmail,
    private_key: privateKey.replaceAll('\\n', '\n'),
    project_id: projectId,
  }
}

async function createServiceAccountJwt(account: FcmServiceAccount, now: number): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )
  const unsignedToken = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken)
  )
  return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`
}

async function getAccessToken(account: FcmServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (
    cachedAccessToken &&
    cachedAccessToken.clientEmail === account.client_email &&
    cachedAccessToken.expiresAt > now + 60
  ) {
    return cachedAccessToken.value
  }

  const assertion = await createServiceAccountJwt(account, now)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !body || typeof body !== 'object') {
    throw new Error(`FCM_oauth_failed_status=${response.status}`)
  }
  const accessToken = (body as Record<string, unknown>).access_token
  const expiresIn = (body as Record<string, unknown>).expires_in
  if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
    throw new Error('FCM_oauth_response_invalid')
  }
  cachedAccessToken = {
    clientEmail: account.client_email,
    value: accessToken,
    expiresAt: now + expiresIn,
  }
  return accessToken
}
export async function sendFcm(
  env: Env,
  deviceToken: string,
  payload: NotifyPayload
): Promise<PushResult> {
  if (!env.FCM_SERVICE_ACCOUNT_JSON) {
    return { channel: 'fcm', ok: false, detail: 'FCM_SERVICE_ACCOUNT_JSON_unset' }
  }

  try {
    const account = parseServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON)
    const accessToken = await getAccessToken(account)
    const notification: Record<string, string> = {
      title: payload.title,
      body: payload.body,
    }
    if (payload.url) notification.click_action = payload.url
    const message: Record<string, unknown> = {
      token: deviceToken,
      notification,
      data: {
        url: payload.url ?? '',
        kind: 'movecar_notify',
      },
      webpush: {
        headers: { Urgency: 'high' },
      },
    }
    if (payload.url) {
      message.webpush = {
        headers: { Urgency: 'high' },
        fcm_options: { link: payload.url },
      }
    }

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message }),
      }
    )

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        channel: 'fcm',
        ok: false,
        detail: `status=${res.status} body=${body.slice(0, 200)}`,
      }
    }
    return { channel: 'fcm', ok: true }
  } catch (error) {
    return {
      channel: 'fcm',
      ok: false,
      detail: error instanceof Error ? error.message : 'FCM_send_failed',
    }
  }
}
