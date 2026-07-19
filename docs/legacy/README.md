# Legacy artifacts

Archived reference material from the pre-v3.0 architecture. Not used by the
live application; kept for historical context.

| File | Superseded by |
|---|---|
| `supabase_schema.sql` | `saas-web/lib/db/schema.ts` (movecarTags / movecarNotifications / movecarPushTokens). Subscriptions reuse nexty's existing tables. |

Previous top-level files deleted (tracked in git history):
- `movecar/movecar.js` → `worker/src/` (Hono + TS rewrite)
- `movecar/preview-owner.html` → `worker/src/templates/owner-confirm-page.ts`
- `movecar/preview-requester.html` → `worker/src/templates/scan-page.ts`

The outer `/Users/clarkfan/movecar/` directory is a second clone of the same
upstream; its copy of `movecar.js` and preview HTMLs remains untouched so the
original repository state is preserved.
