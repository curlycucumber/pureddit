import { cp, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function syncSafari(source = 'dist/extensions/safari', project = 'build/safari') {
  const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  if (manifest.name !== 'pureddit' || manifest.manifest_version !== 3) throw new Error('Source is not a Pureddit extension build. Run npm run build first.');
  for (const file of ['content.js', 'popup.js', 'popup.html', 'popup.css']) await readFile(path.join(source, file));
  const root = await realpath(project).catch(() => { throw new Error('Safari wrapper not found. Generate it on your Mac with npm run safari:prepare first.'); });
  const targets = []; let hasProject = false;
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name.endsWith('.xcodeproj')) { hasProject = true; continue; }
        if (!['.git', 'node_modules', 'DerivedData', 'build'].includes(entry.name) && !entry.name.endsWith('.xcassets')) await inspect(file);
      } else if (entry.name === 'manifest.json') {
        const value = await readFile(file, 'utf8').then(JSON.parse).catch(() => null);
        if (value?.name === 'pureddit' && value.manifest_version === 3) targets.push(directory);
      }
    }
  }
  await inspect(root);
  if (!hasProject || !targets.length) throw new Error('No generated Xcode project with Pureddit extension resources was found. No files were changed.');
  for (const target of targets) {
    const resolved = await realpath(target);
    if (!resolved.startsWith(root + path.sep)) throw new Error('Extension resources must be inside the selected wrapper project.');
    async function checkLinks(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new Error('Remove symlinks from the extension resource destination before syncing. No files were changed.');
        if (entry.isDirectory()) await checkLinks(path.join(directory, entry.name));
      }
    }
    await checkLinks(target);
  }
  // Merge only extension resources; never replace the native project or signing files.
  for (const target of targets) await cp(source, target, { recursive: true, force: true, dereference: false });
  return { version: manifest.version, targets };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await syncSafari('dist/extensions/safari', process.argv[2]);
    console.log(`Updated ${result.targets.length} Safari resource folder(s) to Pureddit ${result.version}. Native project and signing settings preserved.`);
    console.log('Rebuild and run the iOS app in Xcode. Refresh existing Reddit tabs after updating.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
