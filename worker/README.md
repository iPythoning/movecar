# MoveCar Edge Worker

Cloudflare Worker for MoveCar scan landing page, multi-channel push, and QR generation.

Routes in production:
- `t.autoglobalai.com/*`

Companion SaaS at `movecar.autoglobalai.com` (Next.js on Vercel).

## Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill secrets for local dev
pnpm dev
curl http://localhost:8787/health
```

## Deploy

```bash
# one-time: create KV namespace + copy IDs into wrangler.toml
wrangler kv namespace create MOVECAR_KV
wrangler kv namespace create MOVECAR_KV --env production
wrangler kv namespace create MOVECAR_KV --env staging

# put secrets per env
wrangler secret put WORKER_SECRET --env production
wrangler secret put TELEGRAM_MOVECAR_BOT_TOKEN --env production
wrangler secret put FCM_SERVER_KEY --env production

# deploy
pnpm deploy:staging
pnpm deploy:production
```

## Route map

| Method | Path | Status |
|---|---|---|
| GET  | `/health`                | ready |
| GET  | `/t/:shortCode`          | ready |
| POST | `/api/notify`            | ready |
| GET  | `/owner-confirm`         | ready |
| POST | `/api/owner-confirm`     | ready |
| GET  | `/api/qr/:tagId`         | ready |
| POST | `/api/test-push`         | internal, HMAC protected |

## Architecture

Worker → SaaS (HMAC-signed HTTP) → Supabase Postgres.

The Worker never talks to the DB directly; it calls `/api/internal/*` on the
SaaS app with an `X-Internal-Signature` header. See `/docs/PRD.md` §6 for the
exact contract.
