import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchTagMetadata } from './saas-client'
import type { Env } from '../index'

const mockEnv: Env = {
  ENVIRONMENT: 'test',
  SAAS_API_URL: 'https://api.example.com',
  WORKER_SECRET: 'test-secret',
  MOVECAR_KV: {} as unknown as Env['MOVECAR_KV'],
}

describe('saas-client', () => {
  let fetchSpy: any

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        tagId: 'tag-1',
        ownerId: 'owner-1',
        isActive: true,
        planType: 'pro_yearly',
        templateId: 'tpl-1',
        delaySeconds: 0,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('signs internal requests with HMAC-SHA256 headers', async () => {
    await fetchTagMetadata(mockEnv, 'abc123')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]

    expect(url).toBe('https://api.example.com/api/internal/movecar/tag/abc123')
    expect(init.method).toBe('GET')

    const headers = new Headers(init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-internal-signature')).toMatch(/^[a-f0-9]{64}$/)
    expect(headers.get('x-internal-timestamp')).toMatch(/^\d+$/)
  })

  it('returns null on 404', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not found', { status: 404 }))
    const result = await fetchTagMetadata(mockEnv, 'missing')
    expect(result).toBeNull()
  })

  it('throws on non-2xx/404 errors', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    await expect(fetchTagMetadata(mockEnv, 'bad')).rejects.toThrow('saas GET /api/internal/movecar/tag/bad → 500')
  })
})
