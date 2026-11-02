import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { syncSafari } from '../scripts/sync-safari.mjs';

test('Safari resource sync updates copied extension code and preserves native signing and custom files', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'pureddit-sync-'));
  try {
    const native = path.join(project, 'Pureddit.xcodeproj'), resources = path.join(project, 'Shared (Extension)', 'Resources');
    await mkdir(native); await mkdir(resources, { recursive: true });
    await writeFile(path.join(native, 'project.pbxproj'), 'Owner signing settings must survive');
    await writeFile(path.join(resources, 'manifest.json'), JSON.stringify({ name: 'pureddit', manifest_version: 3, version: '0.0.1' }));
    await writeFile(path.join(resources, 'custom.txt'), 'Keep this native resource');
    const result = await syncSafari('dist/extensions/safari', project);
    assert.equal(result.targets.length, 1);
    assert.equal(await readFile(path.join(resources, 'content.js'), 'utf8'), await readFile('dist/extensions/safari/content.js', 'utf8'));
    assert.equal(await readFile(path.join(native, 'project.pbxproj'), 'utf8'), 'Owner signing settings must survive');
    assert.equal(await readFile(path.join(resources, 'custom.txt'), 'utf8'), 'Keep this native resource');
  } finally { await rm(project, { recursive: true, force: true }); }
});
test('Safari sync refuses unrelated folders without writing extension files', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'pureddit-sync-reject-'));
  try {
    await writeFile(path.join(project, 'keep.txt'), 'Keep');
    await assert.rejects(syncSafari('dist/extensions/safari', project), /No generated Xcode project/);
    await assert.rejects(readFile(path.join(project, 'content.js')));
    assert.equal(await readFile(path.join(project, 'keep.txt'), 'utf8'), 'Keep');
  } finally { await rm(project, { recursive: true, force: true }); }
});
