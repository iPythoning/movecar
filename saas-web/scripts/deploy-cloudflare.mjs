import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { verifyArtifact } from './prepare-cloudflare-artifact.mjs';

verifyArtifact();
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const origin = new URL(config.vars.NEXT_PUBLIC_SITE_URL);
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' ||
    config.routes.length !== 1 || config.routes[0].pattern !== origin.hostname || !config.routes[0].custom_domain) {
  throw new Error('Release origin must match the configured custom domain');
}
for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'GITHUB_SHA']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
if (!/^[a-f\d]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID) || !/^[a-f\d]{40}$/i.test(process.env.GITHUB_SHA)) {
  throw new Error('Release account and commit metadata are invalid');
}
function positive(name) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
const commandTimeout = positive('MOVECAR_DEPLOY_TIMEOUT_MS');
const smokeTimeout = positive('MOVECAR_SMOKE_TIMEOUT_MS');

function wrangler(args, allowMissing = false) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    encoding: 'utf8', timeout: commandTimeout,
  });
  if (result.error || result.status !== 0) {
    // Only the provider's explicit missing-Worker code permits initial creation.
    if (allowMissing && result.status !== 0 && /\[code: 10007\]/.test(result.stderr)) return null;
    throw new Error(`Cloudflare ${args[0]} command failed`);
  }
  return result.stdout;
}
function activeVersion(allowMissing = false) {
  const output = wrangler(['deployments', 'list', '--json'], allowMissing);
  if (output === null) return null;
  const deployments = JSON.parse(output);
  if (!Array.isArray(deployments) || !deployments.length ||
      deployments.some(item => !Number.isFinite(Date.parse(item.created_on)))) {
    throw new Error('Missing or invalid Cloudflare deployment history');
  }
  const latest = [...deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  if (deployments.filter(item => Date.parse(item.created_on) === Date.parse(latest.created_on)).length !== 1 ||
      latest.versions?.length !== 1 || latest.versions[0].percentage !== 100 ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(latest.versions[0].version_id)) {
    throw new Error('Cloudflare release must have one unambiguous version at 100%');
  }
  return latest.versions[0].version_id;
}
async function check(path, expected, init) {
  const response = await fetch(new URL(path, origin), {
    ...init, redirect: 'follow', signal: AbortSignal.timeout(smokeTimeout),
  });
  if (!expected.includes(response.status) || new URL(response.url).origin !== origin.origin) {
    throw new Error(`Release check failed for ${path}`);
  }
  return response;
}
async function smoke() {
  const health = await (await check('/api/health', [200])).json();
  if (health.ok !== true) throw new Error('Cloudflare database health failed');
  for (const path of ['/', '/zh', '/login', '/privacy-policy', '/about', '/zh/about', '/ja/about']) {
    await (await check(path, [200])).arrayBuffer();
  }
  await (await check('/api/internal/movecar/tag/deployment-smoke', [401])).arrayBuffer();
  await check('/api/payment/paibao/fulfill', [401], {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
}
function report(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}

const previous = activeVersion(true);
report(`MoveCar source: ${process.env.GITHUB_SHA}; previous version: ${previous ?? 'initial Cloudflare release'}`);
let writeStarted = false;
try {
  if (!previous && !process.env.MOVECAR_RUNTIME_SECRETS_FILE) {
    throw new Error('Initial Cloudflare release requires a safely provisioned runtime secrets file');
  }
  const args = ['deploy', '--config', '.open-next/release.json', '--no-bundle', '--tag', process.env.GITHUB_SHA, '--message', `Git release ${process.env.GITHUB_SHA}`];
  if (process.env.MOVECAR_RUNTIME_SECRETS_FILE) args.push('--secrets-file', process.env.MOVECAR_RUNTIME_SECRETS_FILE);
  writeStarted = true;
  wrangler(args);
  const released = activeVersion();
  if (released === previous) throw new Error('Cloudflare did not publish a new version');
  await smoke();
  report(`MoveCar Cloudflare version: ${released}; Free launch: database, public pages and authorization smoke passed; paid checkout remains gated on its approved product configuration`);
} catch {
  if (writeStarted && previous) {
    try {
      wrangler(['rollback', previous, '--yes']);
      if (activeVersion() !== previous) throw new Error('Rollback version mismatch');
      await smoke();
      report(`MoveCar rollback verified: ${previous}`);
    } catch {
      report('MoveCar rollback failed verification; manual recovery required');
    }
  } else if (writeStarted) {
    report('Initial Cloudflare release failed; the existing short-link origin has not been switched');
  }
  process.exitCode = 1;
  report('MoveCar Cloudflare release failed');
}
