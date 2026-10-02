import { fork } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyArtifact } from './prepare-cloudflare-artifact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = JSON.parse(readFileSync(new URL('../config/cloudflare-runtime.json', import.meta.url), 'utf8'));
function positive(key) {
  const value = Number(process.env[key]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Local canary limits are required');
  return value;
}
const startupTimeout = positive('MOVECAR_LOCAL_START_TIMEOUT_MS');
const requestTimeout = positive('MOVECAR_LOCAL_REQUEST_TIMEOUT_MS');
const shutdownTimeout = positive('MOVECAR_LOCAL_SHUTDOWN_TIMEOUT_MS');
const database = new URL(process.env.MOVECAR_PAYMENT_TEST_DATABASE_URL);
// This capability is limited to the existing isolated CI database, never production.
if (process.env.DATABASE_URL !== database.href || database.hostname !== '127.0.0.1' ||
    database.pathname !== '/movecar_launch_test' || database.username !== 'movecar_test' ||
    database.password || database.search || !['postgres:', 'postgresql:'].includes(database.protocol)) {
  throw new Error('Local canary requires the isolated payment fixture database');
}
verifyArtifact();
const directory = mkdtempSync(path.join(root, '.open-next/local-canary-'));
let child;
let exit;
try {
  const values = Object.fromEntries(runtime.requiredSecrets.map(key => [key, 'synthetic-unused-canary-value']));
  values.DATABASE_URL = database.href;
  values.BETTER_AUTH_SECRET = 'synthetic-canary-auth-secret-with-at-least-32-characters';
  values.ADMIN_EMAIL = 'canary@fixture.invalid';
  const envFile = path.join(directory, 'fixture.env');
  writeFileSync(envFile, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'),
    { mode: 0o600, flag: 'wx' });
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
  delete env.CLOUDFLARE_API_TOKEN;
  delete env.CLOUDFLARE_ACCOUNT_ID;
  const localHyperdrive = new URL(database.href);
  // Miniflare requires a password; the isolated PostgreSQL service uses trust auth.
  localHyperdrive.password = 'synthetic-isolated-canary-password';
  env[`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${runtime.databaseBinding}`] = localHyperdrive.href;
  delete env.MOVECAR_RUNTIME_ENV;
  delete env.MOVECAR_RUNTIME_SECRETS_FILE;
  child = fork(path.join(root, 'node_modules/wrangler/bin/wrangler.js'), [
    'dev', '--config', '.open-next/release.json', '--no-bundle', '--local',
    '--ip', '127.0.0.1', '--port', '0', '--inspector-port', '0', '--env-file', envFile,
    '--log-level', 'error', '--no-types', '--no-show-interactive-dev-session',
  ], { cwd: root, env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  exit = new Promise(resolve => child.once('exit', resolve));
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local workerd startup timed out')), startupTimeout);
    const fail = () => { clearTimeout(timer); reject(new Error('Local workerd did not start')); };
    child.once('error', fail);
    child.once('exit', fail);
    child.on('message', message => {
      try {
        const ready = typeof message === 'string' ? JSON.parse(message) : message;
        if (ready?.event !== 'DEV_SERVER_READY') return;
        if (ready.ip !== '127.0.0.1' || !Number.isInteger(ready.port) || ready.port <= 0 || ready.port > 65535) {
          throw new Error();
        }
        clearTimeout(timer);
        resolve(new URL(`http://127.0.0.1:${ready.port}`));
      } catch { clearTimeout(timer); reject(new Error('Local workerd readiness metadata is invalid')); }
    });
  });
  async function check(route, status, init) {
    const response = await fetch(new URL(route, origin), {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(requestTimeout),
    });
    const body = await response.text();
    if (response.status !== status) throw new Error(`Local workerd check failed: ${route}`);
    return body;
  }
  for (const _ of [0, 1]) {
    if (JSON.parse(await check('/api/health', 200)).ok !== true) throw new Error('Local workerd database check failed');
  }
  if (JSON.parse(await check('/api/auth/get-session', 200)) !== null) throw new Error('Local anonymous session check failed');
  for (const route of ['/about', '/zh/about', '/ja/about']) {
    await check(route, 200);
  }
  await check('/api/internal/movecar/tag/deployment-smoke', 401);
  await check('/api/payment/paibao/fulfill', 401, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  console.log('Local workerd passed: repeated PostgreSQL health, anonymous session, static About pages and unsigned authorization boundaries');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    let timer;
    await Promise.race([exit, new Promise(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, shutdownTimeout); })]);
    clearTimeout(timer);
  }
  rmSync(directory, { recursive: true });
}
