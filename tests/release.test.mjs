import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

test('release candidates have valid checksums, matching versions, and review source without local build state',async()=>{
  execFileSync(process.execPath,['scripts/prepare-release.mjs']);
  const {version}=JSON.parse(await readFile('package.json','utf8'));
  const checksums=(await readFile('dist/release/SHA256SUMS','utf8')).trim().split('\n');assert.equal(checksums.length,4);
  for(const line of checksums){const [hash,name]=line.split('  ');const data=await readFile(`dist/release/${name}`);assert.equal(createHash('sha256').update(data).digest('hex'),hash);const archive=unzipSync(data);
    if(name.startsWith('pureddit-source-')){
      for(const file of ['shared/tools.ts','extension/enhancements.ts','scripts/build-extensions.mjs','public/privacy.html','docs/PUBLISHING.md','package-lock.json','SOURCE_FILES.json'])assert.ok(archive[file],`review source includes ${file}`);
      assert.ok(Object.keys(archive).every(file=>!file.startsWith('dist/')&&!file.startsWith('node_modules/')&&!file.startsWith('build/')&&!file.startsWith('.env')));
      const review=await mkdtemp(path.join(tmpdir(),'pureddit-review-'));
      try {
        for(const [file,bytes] of Object.entries(archive)){await mkdir(path.dirname(path.join(review,file)),{recursive:true});await writeFile(path.join(review,file),bytes);}
        await symlink(path.resolve('node_modules'),path.join(review,'node_modules'),'dir');
        await mkdir(path.join(review,'dist/extensions/chrome'),{recursive:true});await mkdir(path.join(review,'dist/downloads'),{recursive:true});
        await writeFile(path.join(review,'dist/extensions/chrome/manifest.json'),await readFile('dist/extensions/chrome/manifest.json'));
        for(const browser of ['chrome','firefox','safari'])await writeFile(path.join(review,`dist/downloads/pureddit-${browser}.zip`),await readFile(`dist/downloads/pureddit-${browser}.zip`));
        execFileSync(process.execPath,['scripts/prepare-release.mjs'],{cwd:review});
        assert.equal((await readFile(path.join(review,'dist/release/SHA256SUMS'),'utf8')).trim().split('\n').length,4);
      } finally { await rm(review,{recursive:true,force:true}); }
    }else assert.equal(JSON.parse(Buffer.from(archive['manifest.json']).toString()).version,version);
  }
  await readFile('dist/privacy.html');
});
