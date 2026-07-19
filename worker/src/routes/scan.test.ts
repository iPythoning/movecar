import { describe, it, expect, vi } from 'vitest'
import app from '../index'
import type { Env } from '../index'

const mockEnv: Env = {
  ENVIRONMENT: 'test',
  SAAS_API_URL: 'https://api.example.com',
  WORKER_SECRET: 'test-secret',
  MOVECAR_KV: {
    get: vi.fn(),
    put: vi.fn(),
  } as unknown as Env['MOVECAR_KV'],
}

vi.mock('../lib/saas-client', () => ({
  fetchTagMetadata: vi.fn(),
}))

import { fetchTagMetadata } from '../lib/saas-client'
const mockedFetchTagMetadata = vi.mocked(fetchTagMetadata)

describe('handleScan', () => {
  it('returns 404 for missing short code', async () => {
    const res = await app.request('/t/', undefined, mockEnv)
    expect(res.status).toBe(404)
  })

  it('returns 404 for too-long short code', async () => {
    const longCode = 'a'.repeat(33)
    const res = await app.request(`/t/${longCode}`, undefined, mockEnv)
    expect(res.status).toBe(404)
  })

  it('returns 410 for inactive tags', async () => {
    mockedFetchTagMetadata.mockResolvedValueOnce({
      tagId: 'tag-1',
      ownerId: 'owner-1',
      isActive: false,
      planType: 'free',
      templateId: 'tpl-1',
      delaySeconds: 0,
    })

    const res = await app.request('/t/ABC123', undefined, mockEnv)
    expect(res.status).toBe(410)
    const text = await res.text()
    expect(text).toContain('expired')
  })

  it('renders scan page for active pro tags', async () => {
    mockedFetchTagMetadata.mockResolvedValueOnce({
      tagId: 'tag-1',
      ownerId: 'owner-1',
      isActive: true,
      planType: 'pro_monthly',
      templateId: 'tpl-1',
      delaySeconds: 0,
    })

    const res = await app.request('/t/ABC123', undefined, mockEnv)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('ABC123')
  })
})
