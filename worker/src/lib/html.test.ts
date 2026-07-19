import { describe, it, expect } from 'vitest'
import { escapeHtml, html } from './html'

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })
})

describe('html', () => {
  it('returns a Response with HTML content type', () => {
    const response = html('<p>hello</p>', 200)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
