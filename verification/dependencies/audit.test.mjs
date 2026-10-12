import assert from 'node:assert/strict';
import test from 'node:test';
import { NPM_ARTIFACT_AUDIT_ARGS } from '../../packages/javascript/verification/package/supply-chain.mjs';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const execute = promisify(execFile);
test('npm artifact audit excludes private tooling while still rejecting vulnerable build dependencies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'patch-map-audit-scope-'));
  const server = createServer(async (request, response) => {
    for await (const _ of request) { /* Drain audit request. */ }
    response.setHeader('content-type', 'application/json');
    if (request.url.endsWith('/advisories/bulk')) {
      response.end(JSON.stringify(Object.fromEntries(['tool', 'build'].map((name, i) => [name, [{ id: i + 1, url: `https://example.invalid/${name}`, title: `${name} fixture advisory`, severity: 'high', vulnerable_versions: '<2.0.0' }]]))));
    } else {
      const name = decodeURIComponent(request.url.slice(1));
      response.end(JSON.stringify({ name, 'dist-tags': { latest: '2.0.0' }, versions: { '1.0.0': { name, version: '1.0.0' }, '2.0.0': { name, version: '2.0.0' } } }));
    }
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const registry = `http://127.0.0.1:${server.address().port}`;
    const js = { name: '@conalog/patch-map', version: '1.0.0', devDependencies: { build: '1.0.0' } };
    const verifier = { name: '@patch-map/verification', private: true, devDependencies: { tool: '1.0.0' } };
    for (const [path, data] of Object.entries({
      'package.json': { name: 'fixture', private: true, workspaces: ['packages/javascript', 'verification'] },
      'packages/javascript/package.json': js, 'verification/package.json': verifier,
      'package-lock.json': { name: 'fixture', lockfileVersion: 3, packages: {
        '': { name: 'fixture', workspaces: ['packages/javascript', 'verification'] }, 'packages/javascript': js, verification: verifier,
        'node_modules/@conalog/patch-map': { resolved: 'packages/javascript', link: true },
        'node_modules/@patch-map/verification': { resolved: 'verification', link: true },
        'node_modules/build': { version: '1.0.0', dev: true, resolved: `${registry}/build/-/build-1.0.0.tgz` },
        'node_modules/tool': { version: '1.0.0', dev: true, resolved: `${registry}/tool/-/tool-1.0.0.tgz` },
      } },
    })) {
      const target = join(directory, path);
      await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, JSON.stringify(data));
    }
    const results = {};
    for (const [scope, selection] of [['repository', ['audit', '--package-lock-only', '--json', '--audit-level=low']], ['javascript', NPM_ARTIFACT_AUDIT_ARGS]]) {
      let output;
      try { output = (await execute('npm', [...selection, `--registry=${registry}`, `--cache=${directory}/cache`], { cwd: directory })).stdout; }
      catch (error) { output = error.stdout; }
      const audit = JSON.parse(output);
      results[scope] = { vulnerabilities: Object.keys(audit.vulnerabilities ?? {}), total: audit.metadata?.vulnerabilities?.total, error: audit.error };
    }
    assert.deepEqual(results.repository.vulnerabilities, ['build', 'tool']);
    assert.equal(results.repository.total, 2);
    assert.deepEqual(results.javascript.vulnerabilities, ['build']);
    assert.equal(results.javascript.total, 1);
    assert.equal(results.javascript.error, undefined);
  } finally {
    await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true });
  }

});
