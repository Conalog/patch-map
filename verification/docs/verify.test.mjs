import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const verifier = fileURLToPath(new URL('./verify.mjs', import.meta.url));

async function fixture(run) {
  const directory = await mkdtemp(resolve(tmpdir(), 'patch-map-docs-'));
  try {
    await mkdir(resolve(directory, 'packages/javascript/docs'), { recursive: true });
    await mkdir(resolve(directory, 'packages/javascript/examples'), { recursive: true });
    await mkdir(resolve(directory, 'packages/javascript/src'), { recursive: true });
    await writeFile(resolve(directory, 'packages/javascript/src/index.ts'), 'export {};');
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('package docs and consumers resolve the same real files without a root copy', async () => {
  await fixture(async (cwd) => {
    await mkdir(resolve(cwd, 'docs/engineering'), { recursive: true });
    await writeFile(resolve(cwd, 'docs/engineering/verification.md'), '# Internal policy');
    await writeFile(resolve(cwd, '.nvmrc'), '22');
    await writeFile(resolve(cwd, 'packages/javascript/README.md'), '[Docs](docs/README.md)');
    await writeFile(resolve(cwd, 'packages/javascript/docs/README.md'), '[Examples](../examples/)\nSource: `src/index.ts`; repository: `.nvmrc`, `docs/engineering/verification.md`');
    assert.match(execFileSync(process.execPath, [verifier], { cwd, encoding: 'utf8' }), /3 Markdown files checked/u);
  });
});

test('broken public doc links and source references are rejected', async () => {
  await fixture(async (cwd) => {
    await writeFile(resolve(cwd, 'packages/javascript/docs/README.md'), '[API](api/missing.md)\nSource: `src/missing.ts`');
    assert.throws(() => execFileSync(process.execPath, [verifier], { cwd, stdio: 'pipe' }), (error) => {
      const output = error.stderr.toString();
      assert.match(output, /links to missing api\/missing\.md/u);
      assert.match(output, /names missing src\/missing\.ts/u);
      return true;
    });
  });
});

test('package documentation routers retain the size budget', async () => {
  await fixture(async (cwd) => {
    await writeFile(resolve(cwd, 'packages/javascript/docs/README.md'), 'line\n'.repeat(81));
    assert.throws(() => execFileSync(process.execPath, [verifier], { cwd, stdio: 'pipe' }), (error) => {
      assert.match(error.stderr.toString(), /exceeds its budget/u);
      return true;
    });
  });
});
