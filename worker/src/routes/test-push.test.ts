import { describe, expect, it, vi } from 'vitest'

import app from '../index'
import type { Env } from '../index'

vi.mock('../push', () => ({
  dispatchPush: vi.fn().mockResolvedValue([{ channel: 'bark', ok: true }]),
}))

const env: Env = {
  ENVIRONMENT: 'test',
  SAAS_API_URL: 'https://saas.example.com',
  WORKER_SECRET: 'test-secret',
  MOVECAR_KV: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  } as unknown as Env['MOVECAR_KV'],
}

async function sign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('POST /api/test-push', () => {
  it('rejects unsigned requests before dispatching', async () => {
    const res = await app.request(
      '/api/test-push',
      { method: 'POST', body: JSON.stringify({ userId: 'u', channel: 'bark', tokenValue: 'x' }) },
      env
    )
    expect(res.status).toBe(401)
  })

  it('dispatches a signed test notification', async () => {
    const body = JSON.stringify({ userId: 'user-1', channel: 'bark', tokenValue: 'https://api.day.app/key' })
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = await sign(
      env.WORKER_SECRET,
      `${timestamp}.POST./api/test-push.${body}`
    )
    const res = await app.request(
      '/api/test-push',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-timestamp': timestamp,
          'x-internal-signature': signature,
        },
        body,
      },
      env
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, channel: 'bark' })
  })
})

