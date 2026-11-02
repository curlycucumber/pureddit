import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
const root = process.cwd();
const base = JSON.parse(await readFile('extension/manifest.base.json', 'utf8'));
const css = await readFile('shared/theme.css', 'utf8');
const bundles = path.join(root, 'dist/extensions');
await rm(bundles, { recursive: true, force: true }); await mkdir(bundles, { recursive: true });
await mkdir('dist/downloads', { recursive: true });
for (const browser of ['chrome', 'firefox', 'safari']) {
  const directory = path.join(bundles, browser); await mkdir(directory, { recursive: true });
  const manifest = structuredClone(base);
  if (browser === 'chrome') manifest.minimum_chrome_version = '109';
  if (browser === 'firefox') manifest.browser_specific_settings = { gecko: { id: 'pureddit@curlycucumber.github.io', strict_min_version: '142.0', data_collection_permissions: { required: ['none'] } } };
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await build({ entryPoints: ['extension/content.ts'], outfile: path.join(directory, 'content.js'), bundle: true, format: 'iife', target: 'es2022', define: { __PUREDDIT_THEME__: JSON.stringify(css) } });
  await build({ entryPoints: ['extension/popup.ts'], outfile: path.join(directory, 'popup.js'), bundle: true, format: 'iife', target: 'es2022' });
  await cp('extension/popup.html', path.join(directory, 'popup.html')); await cp('extension/popup.css', path.join(directory, 'popup.css'));
  await cp('extension/icons', path.join(directory, 'icons'), { recursive: true });
  const archive = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) { const absolute = path.join(entry.parentPath, entry.name); archive[path.relative(directory, absolute).replaceAll(path.sep, '/')] = new Uint8Array(await readFile(absolute)); }
  }
  await writeFile(`dist/downloads/pureddit-${browser}.zip`, zipSync(archive, { level: 6 }));
}
console.log('Built Chrome, Firefox, and Safari WebExtension sources and downloadable ZIPs. Safari is not a signed iOS application.');
