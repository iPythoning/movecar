import { describe, expect, it } from 'vitest'

import type { Env } from '../index'
import { sendFcm } from './fcm'

const env = (overrides: Partial<Env> = {}) =>
  ({
    ENVIRONMENT: 'test',
    SAAS_API_URL: 'https://saas.example.com',
    WORKER_SECRET: 'test-secret',
    MOVECAR_KV: {} as KVNamespace,
    ...overrides,
  }) as Env

describe('sendFcm', () => {
  it('fails closed when the HTTP v1 service account is not configured', async () => {
    await expect(
      sendFcm(env(), 'device-token', { title: 'MoveCar', body: 'Please move your car' })
    ).resolves.toEqual({
      channel: 'fcm',
      ok: false,
      detail: 'FCM_SERVICE_ACCOUNT_JSON_unset',
    })
  })

  it('rejects malformed service account configuration without sending', async () => {
    await expect(
      sendFcm(env({ FCM_SERVICE_ACCOUNT_JSON: '{}' }), 'device-token', {
        title: 'MoveCar',
        body: 'Please move your car',
      })
    ).resolves.toEqual({
      channel: 'fcm',
      ok: false,
      detail: 'FCM_SERVICE_ACCOUNT_JSON_invalid',
    })
  })
})
