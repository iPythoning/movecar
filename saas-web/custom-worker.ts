import handler from 'movecar-generated-worker';
import { withDatabaseRequest } from './lib/db/request';
import runtimeConfig from './config/cloudflare-runtime.json';

type Environment = Record<string, unknown>;
type Context = { waitUntil(promise: Promise<unknown>): void };

function fetchApplication(request: Request, env: Environment, ctx: Context) {
  if (runtimeConfig.requiredSecrets.some(key => typeof env[key] !== 'string' || !(env[key] as string).trim()) ||
      (env.BETTER_AUTH_SECRET as string).trim().length < runtimeConfig.authSecretMinLength) {
    return Promise.resolve(Response.json({ ok: false, error: 'service_unavailable' }, { status: 503 }));
  }
  return withDatabaseRequest(env, promise => ctx.waitUntil(promise), () => handler.fetch(request, env, ctx));
}

const worker = {
  fetch: fetchApplication,
  async scheduled(_event: unknown, env: Environment, ctx: Context) {
    const origin = env.NEXT_PUBLIC_SITE_URL;
    const secret = env.CRON_SECRET;
    if (typeof origin !== 'string' || typeof secret !== 'string' || !secret) {
      throw new Error('Cron origin and authorization must be configured');
    }
    const url = new URL('/api/cron/expire-check', origin);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Cron origin must be an HTTPS application origin');
    }
    const response = await fetchApplication(new Request(url, {
      headers: { authorization: `Bearer ${secret}` },
    }), env, ctx);
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`Expiration cron failed with HTTP ${response.status}`);
  },
};

export default worker;
