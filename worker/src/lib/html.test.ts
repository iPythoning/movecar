import { describe, it, expect } from 'vitest'
import { escapeHtml, html, scriptJson } from './html'
import { getMessages } from './i18n'
import { renderOwnerConfirmPage } from '../templates/owner-confirm-page'

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

describe('untrusted data in inline scripts', () => {
  it('preserves data while preventing a closing script tag', () => {
    const value = '</script><img src=x onerror=alert(1)>\u2028\u2029'
    const serialized = scriptJson(value)
    expect(serialized).not.toContain('<')
    expect(JSON.parse(serialized)).toBe(value)
  })

  it('does not create injected elements in the public owner page', () => {
    const attack = '</script><img src=x onerror=alert(1)>'
    const page = renderOwnerConfirmPage({ token: attack, notificationId: attack,
      locale: 'en', messages: getMessages('en') })
    expect(page.match(/<script>/g)).toHaveLength(1)
    expect(page.match(/<\/script>/g)).toHaveLength(1)
    expect(page).not.toContain('<img src=x')
  })
})
