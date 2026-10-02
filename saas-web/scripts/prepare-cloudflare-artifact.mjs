import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const name = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) return files(name);
    if (!entry.isFile()) throw new Error('Cloudflare artifact must contain only regular files');
    return [name];
  });
}
function artifactHash() {
  const hash = createHash('sha256');
  for (const file of [...files('.open-next/validated'), ...files('.open-next/assets'), '.open-next/release.json'].sort()) {
    hash.update(file); hash.update('\0'); hash.update(readFileSync(path.join(root, file))); hash.update('\0');
  }
  return hash.digest('hex');
}
export function verifyArtifact() {
  const expected = readFileSync(path.join(root, '.open-next/artifact.sha256'), 'utf8').trim();
  if (!/^[a-f\d]{64}$/.test(expected) || artifactHash() !== expected) {
    throw new Error('Cloudflare artifact integrity check failed');
  }
  console.log(`Cloudflare artifact sha256: ${expected}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
  config.main = 'validated/custom-worker.js';
  config.assets.directory = 'assets';
  config.base_dir = 'validated';
  config.find_additional_modules = true;
  config.rules = [
    { type: 'CompiledWasm', globs: ['**/*.wasm'], fallthrough: true },
    { type: 'Data', globs: ['**/*.bin'], fallthrough: true },
  ];
  writeFileSync(path.join(root, '.open-next/release.json'), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(path.join(root, '.open-next/artifact.sha256'), `${artifactHash()}\n`);
  verifyArtifact();
}
