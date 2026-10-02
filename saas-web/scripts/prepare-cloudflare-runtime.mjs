import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { ENV_KEYS } from './vercel-source-inventory.mjs';
const runtimeConfig = JSON.parse(readFileSync(new URL('../config/cloudflare-runtime.json', import.meta.url), 'utf8'));

try {
  const input = process.env.MOVECAR_RUNTIME_ENV;
  if (input) {
    const values = JSON.parse(input);
    const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error();
    for (const [key, value] of Object.entries(values)) {
      if (!ENV_KEYS.has(key) || typeof value !== 'string' || key === 'LOG_DIR' ||
          (key in config.vars && value !== config.vars[key])) throw new Error();
    }
    for (const key of runtimeConfig.requiredSecrets) {
      if (!values[key]?.trim()) throw new Error();
    }
    if (values.BETTER_AUTH_SECRET.trim().length < runtimeConfig.authSecretMinLength) throw new Error();
    const database = new URL(values.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.pathname) throw new Error();
    const publicKeys = Object.keys(values).filter(key => key.startsWith('NEXT_PUBLIC_'));
    for (const key of publicKeys) {
      if (/[\r\n]/.test(values[key])) throw new Error();
      config.vars[key] = values[key];
      delete values[key];
    }
    const directory = process.env.MOVECAR_RUNTIME_DIRECTORY;
    if (!directory || !path.isAbsolute(directory) || /[\r\n]/.test(directory)) throw new Error();
    mkdirSync(directory, { mode: 0o700 });
    const file = path.join(directory, 'secrets.json');
    writeFileSync(file, JSON.stringify(values), { mode: 0o600, flag: 'wx' });
    writeFileSync(new URL('../wrangler.jsonc', import.meta.url), `${JSON.stringify(config, null, 2)}\n`);
    appendFileSync(process.env.GITHUB_ENV, `MOVECAR_RUNTIME_SECRETS_FILE=${file}\n`);
    console.log(`MoveCar runtime configuration staged securely; public settings projected: ${publicKeys.join(', ')}`);
  } else {
    console.log('Using existing Cloudflare runtime secrets; initial release requires secure provisioning');
  }
} catch {
  console.error('MoveCar runtime configuration is missing, invalid, or not aligned with its Cloudflare target');
  process.exitCode = 1;
}
