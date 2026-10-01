/**
 * HTML utilities for Worker responses.
 * Keep this trivially small — no dependencies.
 */

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function scriptJson(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('Value cannot be serialized')
  return serialized.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

export function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  })
}
