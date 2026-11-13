/*
 * Runs at the end of "npm run build".
 * Lists every file in dist/ and writes dist/sw.js (the offline service worker)
 * from scripts/sw-template.js, with that list baked in.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');

const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) =>
    join(entry.parentPath, entry.name)
      .slice(dist.length + 1)
      .replaceAll('\\', '/'),
  )
  .filter((file) => file !== 'sw.js')
  .sort();

// The version changes whenever any file changes, which is what tells
// phones that already have the app to fetch the new one.
const hash = createHash('sha256');
for (const file of files) hash.update(file).update(readFileSync(join(dist, file)));
const version = hash.digest('hex').slice(0, 12);

const serviceWorker = readFileSync(join(root, 'scripts', 'sw-template.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace(
    '__FILES__',
    JSON.stringify(
      files.map((file) => `./${file}`),
      null,
      2,
    ),
  );

writeFileSync(join(dist, 'sw.js'), serviceWorker);
console.log(`Service worker written: version ${version}, ${files.length} files available offline.`);
