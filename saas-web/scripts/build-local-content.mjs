import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { require as tsxRequire } from 'tsx/cjs/api';

const projectDirectory = fileURLToPath(new URL('../', import.meta.url));
const outputPath = path.join(projectDirectory, 'lib/cms/local-posts.json');
const { POST_CONFIGS } = tsxRequire('../components/cms/post-config.ts', import.meta.url);
const manifest = {};

function collectDatePaths(value, keys = []) {
  if (value instanceof Date) return [keys];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => collectDatePaths(nested, [...keys, key]));
}

for (const [postType, config] of Object.entries(POST_CONFIGS)) {
  const locales = {};
  manifest[postType] = locales;
  if (!config.localDirectory) continue;

  const contentDirectory = path.join(projectDirectory, config.localDirectory);
  let localeDirectories;
  try {
    localeDirectories = await readdir(contentDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log(`No local content directory for ${postType}: ${config.localDirectory}`);
    continue;
  }

  for (const localeDirectory of localeDirectories) {
    if (!localeDirectory.isDirectory()) continue;
    const directory = path.join(contentDirectory, localeDirectory.name);
    const filenames = await readdir(directory);
    const posts = [];

    for (const filename of filenames) {
      const sourcePath = path.join(directory, filename);
      try {
        const source = await readFile(sourcePath, 'utf8');
        const { data, content } = matter(source);
        posts.push({ filename, data, content, datePaths: collectDatePaths(data) });
      } catch (error) {
        throw new Error(`Failed to build local content from ${sourcePath}`, { cause: error });
      }
    }

    locales[localeDirectory.name] = posts;
  }
}

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
let current;
try {
  current = await readFile(outputPath, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (current !== serialized) await writeFile(outputPath, serialized);
console.log(`Built local content for ${Object.keys(manifest).join(', ')}`);
