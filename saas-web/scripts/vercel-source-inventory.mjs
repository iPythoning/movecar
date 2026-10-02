import { pathToFileURL } from 'node:url';

// These are immutable boundaries of this MoveCar-only diagnostic capability.
const API_ORIGIN = 'https://api.vercel.com';
const PROJECT_NAME = 'movecar-saas';
const PROJECT_ID = /^prj_[A-Za-z0-9]+$/;
const TEAM_ID = /^team_[A-Za-z0-9]+$/;
const ENV_TYPES = new Set(['encrypted', 'plain', 'secret', 'sensitive', 'system']);
const VISIBILITIES = new Set(['config', 'secret']);
const TARGETS = new Set(['production', 'preview', 'development']);
export const ENV_KEYS = new Set(`
NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_BETTER_AUTH_URL NEXT_PUBLIC_PRICING_PATH
NEXT_PUBLIC_LOCALE_DETECTION NEXT_PUBLIC_OPTIMIZED_IMAGES NEXT_PUBLIC_LOGIN_MODE
NEXT_PUBLIC_COOKIE_CONSENT_ENABLED NEXT_PUBLIC_USER_SOURCE_TRACKING_ENABLED
NEXT_PUBLIC_RATE_LIMIT_ENABLED NEXT_PUBLIC_EMAIL_NORMALIZATION_ENABLED
DATABASE_URL BETTER_AUTH_SECRET NEXT_PUBLIC_GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET
NEXT_PUBLIC_GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET NEXT_PUBLIC_TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY RESEND_API_KEY ADMIN_EMAIL ADMIN_NAME
UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN NEXT_PUBLIC_DEFAULT_CURRENCY
STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET
STRIPE_CUSTOMER_PORTAL_URL STRIPE_RADAR_EARLY_FRAUD_WARNING_TYPE
CREEM_API_BASE_URL CREEM_API_KEY CREEM_WEBHOOK_SECRET
R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME R2_PUBLIC_URL
OPENAI_API_KEY DEEPSEEK_API_KEY ANTHROPIC_API_KEY XAI_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY OPENROUTER_API_KEY FIRECRAWL_API_KEY
REPLICATE_API_TOKEN REPLICATE_WEBHOOK_SIGNING_SECRET FAL_KEY FAL_VERIFY_WEBHOOKS
KIE_API_KEY KIE_WEBHOOK_HMAC_KEY WEBHOOK_BASE_URL CUSTOM_OPENAI_BASE_URL
CUSTOM_OPENAI_API_KEY NEXT_PUBLIC_CUSTOM_OPENAI_MODELS NEXT_PUBLIC_AI_MODEL_ID
NEXT_PUBLIC_AI_PROVIDER NEXT_PUBLIC_GOOGLE_ID NEXT_PUBLIC_GOOGLE_ADSENSE_ID
NEXT_PUBLIC_CLARITY_PROJECT_ID NEXT_PUBLIC_PLAUSIBLE_SRC NEXT_PUBLIC_PLAUSIBLE_DOMAIN
PLAUSIBLE_API_KEY PLAUSIBLE_URL NEXT_PUBLIC_UMAMI_SRC NEXT_PUBLIC_UMAMI_WEBSITE_ID
NEXT_PUBLIC_RYBBIT_SRC NEXT_PUBLIC_RYBBIT_SITE_ID NEXT_PUBLIC_RYBBIT_SESSION_REPLAY
NEXT_PUBLIC_RYBBIT_REPLAY_MASK_SELECTORS NEXT_PUBLIC_POSTHOG_HOST NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_CRISP_WEBSITE_ID NEXT_PUBLIC_DISCORD_INVITE_URL DISCORD_WEBHOOK_URL
NEXT_PUBLIC_TOLT_ID NEXT_PUBLIC_SENTRY_DSN SENTRY_AUTH_TOKEN SENTRY_ORG
SENTRY_PROJECT SENTRY_DEBUG NEXT_PUBLIC_WORKER_URL MOVECAR_WORKER_URL WORKER_SECRET
CRON_SECRET STRIPE_PRICE_ID_PRO_MONTHLY STRIPE_PRICE_ID_PRO_YEARLY
STRIPE_PRICE_ID_LIFETIME STRIPE_PRODUCT_ID_PRO_MONTHLY STRIPE_PRODUCT_ID_PRO_YEARLY
STRIPE_PRODUCT_ID_LIFETIME CREEM_PRODUCT_ID_PRO_MONTHLY CREEM_PRODUCT_ID_PRO_YEARLY
CREEM_PRODUCT_ID_LIFETIME TELEGRAM_MOVECAR_BOT_TOKEN NEXT_PUBLIC_TELEGRAM_MOVECAR_BOT_USERNAME
TELEGRAM_WEBHOOK_SECRET NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_VAPID_KEY LOG_LEVEL LOG_DIR PAY_API_BASE PAY_CHECKOUT_CHANNEL
PAY_WAFFO_API_BASE WAFFO_ENV WAFFO_PRODUCT_MAP WAFFO_TAX_CATEGORY PAY_ADMIN_TOKEN
PAIBAO_FULFILL_HMAC_SECRET PAY_CHECKOUT_TIMEOUT_MS PAY_RECONCILE_MIN_INTERVAL_MS
PAY_CHECKOUT_ALLOWED_ORIGINS PRICING_ENVIRONMENT PAY_FULFILL_URL PAY_SUCCESS_URL PAY_CANCEL_URL
`.trim().split(/\s+/));

function positiveInteger(env, key) {
  const value = env[key];
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw new Error();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error();
  return parsed;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cursor(value) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error();
  return value;
}

function readability(entry) {
  // Vercel visibility is authoritative; presence/ciphertext is not decryption proof.
  if (entry.visibility === 'secret') return 'write-only';
  if (entry.visibility === 'config') return 'config-readable-by-authorized-actor';
  if (entry.type === 'sensitive') return 'write-only';
  if (entry.type === 'plain' || entry.type === 'encrypted') {
    return 'config-readable-by-authorized-actor';
  }
  return 'unknown';
}

function envInventory(body) {
  if (!record(body)) throw new Error();
  const entries = Array.isArray(body.envs) ? body.envs : [body];
  // This endpoint has no documented pagination query. Never accept a partial list.
  if (body.pagination !== undefined &&
      (!record(body.pagination) || cursor(body.pagination.next) !== null)) throw new Error();
  if (body.hiddenProductionEnvCount !== undefined &&
      (!Number.isSafeInteger(body.hiddenProductionEnvCount) || body.hiddenProductionEnvCount < 0)) {
    throw new Error();
  }
  const variables = [];
  const seen = new Set();
  let unlistedProductionKeysPresent = false;
  for (const entry of entries) {
    if (!record(entry) || typeof entry.key !== 'string') throw new Error();
    if (entry.target === undefined) {
      if (Array.isArray(entry.customEnvironmentIds) && entry.customEnvironmentIds.length > 0 &&
          entry.customEnvironmentIds.every(id => typeof id === 'string' && id !== '')) continue;
      throw new Error();
    }
    const targets = Array.isArray(entry.target) ? entry.target : [entry.target];
    if (targets.some(target => !TARGETS.has(target))) throw new Error();
    if (!targets.includes('production')) continue;
    if (!ENV_KEYS.has(entry.key)) {
      unlistedProductionKeysPresent = true;
      continue;
    }
    if (seen.has(entry.key) || !ENV_TYPES.has(entry.type) ||
        (entry.visibility !== undefined && !VISIBILITIES.has(entry.visibility)) ||
        entry.decrypted === true ||
        (entry.gitBranch !== undefined && entry.gitBranch !== null) ||
        (entry.customEnvironmentIds !== undefined &&
          (!Array.isArray(entry.customEnvironmentIds) || entry.customEnvironmentIds.length !== 0))) {
      throw new Error();
    }
    seen.add(entry.key);
    variables.push({
      key: entry.key,
      productionTarget: true,
      secretType: entry.type,
      visibility: entry.visibility ?? null,
      valuePresentInResponse: typeof entry.value === 'string' ? entry.value !== '' : null,
      documentedReadability: readability(entry),
    });
  }
  variables.sort((a, b) => a.key.localeCompare(b.key));
  return {
    decryptRequested: false,
    plaintextAccessTested: false,
    hiddenProductionKeysPresent: body.hiddenProductionEnvCount === undefined
      ? null : body.hiddenProductionEnvCount > 0,
    unlistedProductionKeysPresent,
    variables,
  };
}

export async function runVercelSourceInventory({
  env = process.env,
  fetchImpl = globalThis.fetch,
  write = line => process.stdout.write(`${line}\n`),
} = {}) {
  let token;
  let stage = "configuration";
  const emit = value => {
    const line = JSON.stringify(value);
    if (token && line.includes(token)) throw new Error();
    write(line);
  };
  try {
    token = typeof env.VERCEL_TOKEN === "string" ? env.VERCEL_TOKEN.trim() : undefined;
    if (typeof token !== 'string' || !/^[A-Za-z0-9._~+\/-]+=*$/.test(token)) throw new Error();
    const timeoutMs = positiveInteger(env, 'MOVECAR_VERCEL_REQUEST_TIMEOUT_MS');
    // Node timers cannot represent larger delays without clamping to 1 ms.
    if (timeoutMs > 2 ** 31 - 1) throw new Error();
    const maxPages = positiveInteger(env, 'MOVECAR_VERCEL_MAX_TEAM_PAGES');
    const pageSize = positiveInteger(env, 'MOVECAR_VERCEL_TEAM_PAGE_SIZE');
    const maxBytes = positiveInteger(env, 'MOVECAR_VERCEL_MAX_RESPONSE_BYTES');

    const request = async (path, parameters = {}) => {
      const url = new URL(path, API_ORIGIN);
      if (url.origin !== API_ORIGIN || url.search || url.hash || url.username || url.password) {
        throw new Error();
      }
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          redirect: 'error',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
          throw new Error();
        }
        if (response.status !== 200) {
          emit({ httpStatus: response.status });
          if (response.body) await response.body.cancel();
          return { status: response.status };
        }
        if (!response.body) throw new Error();
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let total = 0;
        let text = '';
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) throw new Error();
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
          return { status: 200, body: JSON.parse(text) };
        } finally {
          await reader.cancel();
        }
      } finally {
        clearTimeout(timer);
      }
    };

    const candidates = new Map();
    let complete = true;
    const inspect = async teamId => {
      const response = await request(`/v9/projects/${PROJECT_NAME}`, teamId ? { teamId } : {});
      if (response.status === 404) return;
      if (response.status !== 200) {
        complete = false;
        return;
      }
      const project = response.body;
      if (!record(project) || project.name !== PROJECT_NAME ||
          typeof project.id !== 'string' || !PROJECT_ID.test(project.id) ||
          typeof project.accountId !== 'string' || project.accountId === '' ||
          (teamId && project.accountId !== teamId)) throw new Error();
      const prior = candidates.get(project.id);
      if (prior && prior.accountId !== project.accountId) throw new Error();
      candidates.set(project.id, {
        id: project.id,
        accountId: project.accountId,
        teamId: teamId ?? prior?.teamId ?? null,
      });
    };

    stage = "personal-project";
    await inspect(null);
    stage = "team-enumeration";
    const teams = new Set();
    const cursors = new Set();
    let until;
    let teamEnumerationComplete = false;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await request('/v2/teams', {
        limit: pageSize,
        ...(until === undefined ? {} : { until }),
      });
      if (result.status !== 200) break;
      const body = result.body;
      if (!record(body) || !Array.isArray(body.teams) || body.teams.length > pageSize ||
          !record(body.pagination)) throw new Error();
      for (const team of body.teams) {
        if (!record(team) || typeof team.id !== 'string' || !TEAM_ID.test(team.id)) throw new Error();
        teams.add(team.id);
      }
      const next = cursor(body.pagination.next);
      if (next === null) {
        teamEnumerationComplete = true;
        break;
      }
      if (cursors.has(next) || (until !== undefined && next >= until)) throw new Error();
      cursors.add(next);
      until = next;
    }
    if (!teamEnumerationComplete) throw new Error();
    stage = "team-projects";
    for (const teamId of teams) await inspect(teamId);
    if (!complete || candidates.size !== 1) throw new Error();
    const [project] = candidates.values();
    stage = "environment-metadata";
    const response = await request(`/v10/projects/${project.id}/env`, {
      decrypt: 'false',
      ...(project.teamId === null ? {} : { teamId: project.teamId }),
    });
    if (response.status !== 200) throw new Error();
    emit({
      status: 'ok',
      project: { name: PROJECT_NAME, id: project.id, teamId: project.teamId },
      productionEnvironment: envInventory(response.body),
    });
    return 0;
  } catch {
    // Do not surface exception strings: fetch/JSON failures can contain credentials.
    write(JSON.stringify({ status: "failed-safe", stage }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    process.stdout.write('{"status":"failed-safe"}\n');
    process.exitCode = 1;
  } else {
    process.exitCode = await runVercelSourceInventory();
  }
}
