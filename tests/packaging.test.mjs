import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { unzipSync } from 'fflate';

test('all browser archives contain complete, local WebExtensions with minimal permissions', async () => {
  for (const browser of ['chrome','firefox','safari']) {
    const archive = unzipSync(await readFile(`dist/downloads/pureddit-${browser}.zip`));
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']).toString());
    assert.equal(manifest.manifest_version, 3); assert.equal(manifest.name, 'pureddit'); assert.deepEqual(manifest.permissions, ['storage']);
    assert.ok(manifest.host_permissions.every(host => /^https:\/\/(?:www\.|old\.|new\.)?reddit\.com\/\*$/.test(host)));
    for (const name of ['content.js','popup.js','popup.html','popup.css','icons/16.png','icons/32.png','icons/48.png','icons/128.png']) assert.ok(archive[name], `${browser} includes ${name}`);
    assert.equal(manifest.background, undefined); assert.equal(manifest.oauth2, undefined);
    const source = Buffer.from(archive['content.js']).toString();
    assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|api\/v1\/access_token|REDDIT_CLIENT_SECRET/);
    if (browser === 'firefox') assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
    else assert.equal(manifest.browser_specific_settings, undefined);
  }
});
test('the Vercel build is static and no retired API entrypoints or secrets are deployed', async () => {
  await access('dist/index.html');
  const html = await readFile('dist/index.html','utf8'); assert.doesNotMatch(html, /\/api\/|REDDIT_CLIENT/);
  await assert.rejects(access('api')); await assert.rejects(access('server'));
  const dependencies = JSON.parse(await readFile('package.json','utf8')).dependencies || {};
  assert.deepEqual(Object.keys(dependencies), []);
});
