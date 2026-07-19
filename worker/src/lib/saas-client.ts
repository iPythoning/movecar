/**
 * HTTP client for calling the SaaS `/api/internal/movecar/*` endpoints.
 *
 * Contract mirrors `saas-web/lib/movecar/internal-auth.ts`:
 *   X-Internal-Signature: hex(HMAC-SHA256(secret, `${ts}.${method}.${path}.${body}`))
 *   X-Internal-Timestamp: unix seconds
 *
 * Always send raw bodies (no JSON re-serialisation) so signature matches.
 */

import type { Env } from '../index'

export interface TagMetadata {
  tagId: string
  ownerId: string
  isActive: boolean
  planType: 'free' | 'pro_monthly' | 'pro_yearly' | 'lifetime'
  templateId: string
  delaySeconds: number
}

export interface NotifyPayload {
  shortCode: string
  message?: string
  requesterLocation?: { lat: number; lng: number }
  requesterIp: string
}

export interface NotifyResponse {
  notificationId: string
  oneTimeToken: string
  pushTokens: Array<{
    channel: 'bark' | 'fcm' | 'telegram' | 'email'
    tokenValue: string
  }>
  delayedUntil?: number
}

export interface OwnerConfirmPayload {
  notificationId: string
  oneTimeToken: string
  ownerReply: string
  ownerLocation?: { lat: number; lng: number }
}

export interface DeliveryPayload {
  channelsSent: string[]
  channelsFailed: string[]
}

export interface PushEmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

async function hexFromBytes(bytes: ArrayBuffer): Promise<string> {
  const view = new Uint8Array(bytes)
  let out = ''
  for (let i = 0; i < view.length; i++) {
    out += view[i]!.toString(16).padStart(2, '0')
  }
  return out
}

async function signPayload(secret: string, payload: string): Promise<string> {
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

async function callSaas<T>(
  env: Env,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const raw = body === undefined ? '' : JSON.stringify(body)
  const ts = Math.floor(Date.now() / 1000).toString()
  const pathWithQuery = path // callers embed query string themselves
  const toSign = `${ts}.${method}.${pathWithQuery}.${raw}`
  const signature = await signPayload(env.WORKER_SECRET, toSign)

  const res = await fetch(`${env.SAAS_API_URL}${pathWithQuery}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-internal-signature': signature,
      'x-internal-timestamp': ts,
    },
    body: method === 'GET' ? undefined : raw,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`saas ${method} ${path} → ${res.status}: ${text}`)
  }
  return (await res.json()) as T
}

export async function fetchTagMetadata(
  env: Env,
  shortCode: string
): Promise<TagMetadata | null> {
  try {
    return await callSaas<TagMetadata>(
      env,
      'GET',
      `/api/internal/movecar/tag/${encodeURIComponent(shortCode)}`
    )
  } catch (err) {
    if (String(err).includes('→ 404')) return null
    throw err
  }
}

export async function submitNotify(
  env: Env,
  payload: NotifyPayload
): Promise<NotifyResponse> {
  return callSaas<NotifyResponse>(env, 'POST', '/api/internal/movecar/notify', payload)
}

export async function submitOwnerConfirm(
  env: Env,
  payload: OwnerConfirmPayload
): Promise<{ success: boolean }> {
  return callSaas<{ success: boolean }>(
    env,
    'POST',
    '/api/internal/movecar/owner-confirm',
    payload
  )
}

export async function reportDelivery(
  env: Env,
  notificationId: string,
  payload: DeliveryPayload
): Promise<void> {
  await callSaas<unknown>(
    env,
    'PATCH',
    `/api/internal/movecar/notify/${encodeURIComponent(notificationId)}/delivery`,
    payload
  )
}

export async function pushEmail(
  env: Env,
  payload: PushEmailPayload
): Promise<{ ok: boolean }> {
  return callSaas<{ ok: boolean }>(
    env,
    'POST',
    '/api/internal/movecar/push-email',
    payload
  )
}
