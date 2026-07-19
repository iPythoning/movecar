import { Hono } from 'hono'

import { rateLimitMiddleware } from './middleware/rate-limit'
import { handleNotify } from './routes/notify'
import {
  handleOwnerConfirmGet,
  handleOwnerConfirmPost,
} from './routes/owner-confirm'
import { handleQr } from './routes/qr'
import { handleScan } from './routes/scan'
import { handleTestPush } from './routes/test-push'

export interface Env {
  ENVIRONMENT: string
  SAAS_API_URL: string
  WORKER_SECRET: string
  TELEGRAM_MOVECAR_BOT_TOKEN?: string
  FCM_SERVER_KEY?: string
  BARK_DEFAULT_URL?: string
  MOVECAR_KV: KVNamespace
}

const app = new Hono<{ Bindings: Env }>()

// ---------- Public health check -------------------------------------------
app.get('/health', (c) =>
  c.json({ ok: true, env: c.env.ENVIRONMENT, ts: Date.now() })
)

// ---------- Scan & Notify --------------------------------------------------
// Scan page: no rate limit at page level (low cost) — abuse is gated at
// /api/notify which actually dispatches pushes.
app.get('/t/:shortCode', handleScan)

// POST /api/notify: throttle per IP at 5/min to limit flood attacks.
app.post(
  '/api/notify',
  rateLimitMiddleware({ scope: 'notify:ip', max: 5, windowSeconds: 60 }),
  handleNotify
)

// ---------- Owner confirm --------------------------------------------------
app.get('/owner-confirm', handleOwnerConfirmGet)
app.post(
  '/api/owner-confirm',
  rateLimitMiddleware({ scope: 'confirm:ip', max: 10, windowSeconds: 60 }),
  handleOwnerConfirmPost
)

// ---------- QR --------------------------------------------------------------
app.get('/api/qr/:tagId', handleQr)
app.post('/api/test-push', handleTestPush)

// ---------- 404 + error ----------------------------------------------------
app.notFound((c) => c.text('not found', 404))

app.onError((err, c) => {
  console.error('[worker error]', err)
  return c.json({ ok: false, error: 'internal_error' }, 500)
})

export default app
