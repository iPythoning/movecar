import type { Context } from 'hono'

import type { Env } from '../index'

// qrcode-generator is a pure JS QR encoder — no native deps, Worker-safe.
// Output format is SVG (text), which every modern scanner handles and can be
// scaled crisply for print.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
import qrcode from 'qrcode-generator'

const MIN_CELL_SIZE = 2
const MAX_CELL_SIZE = 40

/**
 * GET /api/qr/:tagId?size=512&ec=M
 *
 * Returns an SVG QR encoding the public scan short-link. The route takes the
 * tag UUID (not the short code) — the edge looks up `shortCode` via the
 * internal API. However for MVP we accept the short code directly too to
 * avoid one round trip (UIs always know the short_code when embedding QRs).
 *
 * Query:
 *   size:   pixel-ish hint for consumers (we encode viewBox accurately; clients can scale)
 *   ec:     error correction level — L (7%), M (15%), Q (25%), H (30%). Default M.
 */
export function handleQr(c: Context<{ Bindings: Env }>) {
  const idOrCode = c.req.param('tagId')
  if (!idOrCode || idOrCode.length > 64) {
    return c.text('bad_request', 400)
  }

  const ec = (c.req.query('ec') ?? 'M').toUpperCase() as 'L' | 'M' | 'Q' | 'H'
  const targetPx = clamp(Number(c.req.query('size') ?? 512), 128, 1024)

  const scanUrl = buildScanUrl(c.req.url, idOrCode)

  // typeNumber = 0 lets the library auto-pick capacity for the data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qr: any = (qrcode as any)(0, ec)
  qr.addData(scanUrl)
  qr.make()
  const count: number = qr.getModuleCount()
  const cell = clamp(Math.round(targetPx / (count + 8)), MIN_CELL_SIZE, MAX_CELL_SIZE)
  const margin = cell * 4
  const size = count * cell + margin * 2

  const rects: string[] = []
  for (let r = 0; r < count; r++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(r, col)) {
        const x = margin + col * cell
        const y = margin + r * cell
        rects.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}"/>`)
      }
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
<rect width="100%" height="100%" fill="#ffffff"/>
<g fill="#000000">${rects.join('')}</g>
</svg>`

  return new Response(svg, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  })
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

export function buildScanUrl(requestUrl: string, shortCode: string): string {
  const u = new URL(requestUrl)
  // Strip /api/qr/... → /t/{shortCode} on the same origin (t.autoglobalai.com)
  return `${u.origin}/t/${encodeURIComponent(shortCode)}`
}
