import { describe, expect, it } from 'vitest'

import type { Env } from '../index'
import { verifyInternalRequest } from './internal-auth'

const env: Env = {
  ENVIRONMENT: 'test',
  SAAS_API_URL: 'https://saas.example.com',
  WORKER_SECRET: 'test-secret',
  MOVECAR_KV: {} as Env['MOVECAR_KV'],
}

async function signature(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  )
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('verifyInternalRequest', () => {
  it('accepts a valid timestamped HMAC request', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const body = JSON.stringify({ channel: 'bark' })
    const payload = `${timestamp}.POST./api/test-push.${body}`
    const req = new Request('https://worker.example.com/api/test-push', {
      method: 'POST',
      headers: {
        'x-internal-timestamp': timestamp,
        'x-internal-signature': await signature(env.WORKER_SECRET, payload),
      },
      body,
    })

    await expect(verifyInternalRequest(req, env, body)).resolves.toBe(true)
  })

  it('rejects a changed body and an expired timestamp', async () => {
    const timestamp = (Math.floor(Date.now() / 1000) - 301).toString()
    const body = '{}'
    const req = new Request('https://worker.example.com/api/test-push', {
      method: 'POST',
      headers: {
        'x-internal-timestamp': timestamp,
        'x-internal-signature': await signature(
          env.WORKER_SECRET,
          `${timestamp}.POST./api/test-push.${body}`
        ),
      },
      body,
    })

    await expect(verifyInternalRequest(req, env, '{"changed":true}')).resolves.toBe(false)
    await expect(verifyInternalRequest(req, env, body)).resolves.toBe(false)
  })
})

