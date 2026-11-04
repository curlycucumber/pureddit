import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { execFileSync } from 'node:child_process';

const {version} = JSON.parse(await readFile('package.json','utf8'));
const manifest = JSON.parse(await readFile('dist/extensions/chrome/manifest.json','utf8'));
if (manifest.version !== version) throw new Error('Build the current version before preparing a release.');
await mkdir('dist/release',{recursive:true});
const checksums = [];
for (const browser of ['chrome','firefox','safari']) {
  const file=`pureddit-${browser}-${version}.zip`,data=await readFile(`dist/downloads/pureddit-${browser}.zip`);
  await writeFile(`dist/release/${file}`,data);
  checksums.push(`${createHash('sha256').update(data).digest('hex')}  ${file}`);
}
// Source is included for store review/reproducibility, without local builds or credentials.
let files;
try {
  const top=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  if(top!==process.cwd())throw new Error('Use the source manifest outside the repository root.');
  files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
} catch {
  files=JSON.parse(await readFile('SOURCE_FILES.json','utf8'));
  if(!Array.isArray(files)||files.some(file=>typeof file!=='string'||file.startsWith('/')||file.includes('\\')||file.split('/').includes('..')))throw new Error('Invalid review-source manifest.');
}
const sources={};
for(const file of files) {
  if(!/^(extension\/|shared\/|src\/|scripts\/|docs\/|public\/|tests\/|package(?:-lock)?\.json$|tsconfig\.json$|(?:vite|playwright)\.config\.ts$|index\.html$|README\.md$)/.test(file))continue;
  sources[file]=new Uint8Array(await readFile(file));
}
sources['SOURCE_FILES.json']=new TextEncoder().encode(JSON.stringify(Object.keys(sources),null,2)+'\n');
const sourceFile=`pureddit-source-${version}.zip`,source=zipSync(sources,{level:6});
await writeFile(`dist/release/${sourceFile}`,source);checksums.push(`${createHash('sha256').update(source).digest('hex')}  ${sourceFile}`);
await writeFile('dist/release/SHA256SUMS',checksums.join('\n')+'\n');
await copyFile('docs/PUBLISHING.md','dist/release/PUBLISHING.md');
await writeFile('dist/release/README.txt',`Pureddit ${version}\n\nChrome and Firefox ZIPs are unsigned development packages. Chrome permanent installation requires Chrome Web Store review. Firefox permanent installation requires Mozilla signing; the optional signing workflow produces an unlisted XPI after AMO credentials are configured. The Safari ZIP is WebExtension source and cannot be installed directly on an iPhone. Build/sign the containing iOS app with Xcode; TestFlight requires Apple Developer Program and App Store Connect setup.\n\nSee PUBLISHING.md for the remaining account and review steps. SHA256SUMS verifies file integrity; checksums are not publisher signatures.\n`);
console.log(`Prepared versioned release candidates and SHA-256 checksums under dist/release (no store publication or Apple signing).`);
