import { describe, it, expect } from 'vitest'
import { buildScanUrl } from './qr'

describe('buildScanUrl', () => {
  it('builds a /t/{shortCode} URL from a request URL', () => {
    const url = buildScanUrl('https://t.example.com/api/qr/ABC123?size=512', 'ABC123')
    expect(url).toBe('https://t.example.com/t/ABC123')
  })

  it('encodes short codes containing special characters', () => {
    const url = buildScanUrl('https://t.example.com/api/qr/a+b', 'a b/c')
    expect(url).toBe('https://t.example.com/t/a%20b%2Fc')
  })

  it('preserves the origin from the request URL', () => {
    const url = buildScanUrl('http://localhost:8787/api/qr/xyz', 'xyz')
    expect(url).toBe('http://localhost:8787/t/xyz')
  })
})
