import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));

test('compiled Vercel API entrypoints load and serve JSON in plain Node without a TypeScript loader', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pureddit-deployment-'));
  try {
    const configPath = path.join(root, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
    for (const folder of ['api', 'server']) {
      const entries = await readdir(path.join(root, folder), { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
        const source = path.join(entry.parentPath, entry.name);
        const target = path.join(directory, path.relative(root, source).replace(/\.ts$/, '.js'));
        const result = ts.transpileModule(await readFile(source, 'utf8'), {
          fileName: source,
          compilerOptions: { ...parsed.options, noEmit: false, sourceMap: false, inlineSources: false, incremental: false },
        });
        await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, result.outputText);
      }
    }
    const entrypoints = ['api/read-only.js', 'api/reddit.js', 'api/auth/[action].js'];
    const urls = entrypoints.map(entry => pathToFileURL(path.join(directory, entry)).href);
    const script = `
      import assert from 'node:assert/strict';
      globalThis.fetch = async () => { throw new Error('The deployment smoke test must not contact Reddit'); };
      const urls = ${JSON.stringify(urls)};
      const paths = ['/api/read-only?feed=invalid', '/api/reddit?resource=home', '/api/auth/session'];
      for (let index = 0; index < urls.length; index++) {
        const { default: handler } = await import(urls[index]);
        assert.equal(typeof handler, 'function');
        const headers = {}; let data;
        const response = { statusCode: 0, setHeader(name, value) { headers[name] = value; }, getHeader(name) { return headers[name]; }, end(body) { data = JSON.parse(body); } };
        await handler({ method: 'GET', url: paths[index], headers: {} }, response);
        assert.match(headers['Content-Type'], /application\\/json/);
        assert.equal(response.statusCode, [400, 401, 200][index]);
        assert.equal(typeof data, 'object');
      }
      console.log('All three compiled API entrypoints loaded and returned JSON.');
    `;
    const result = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], { cwd: directory });
    assert.match(result.stdout, /All three compiled API entrypoints/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
