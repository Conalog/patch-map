import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../', import.meta.url));

test('shared lint checks CI scripts and typed conformance without owning package sources', async () => {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: `${root}verification/eslint.config.js` });
  const [ci] = await eslint.lintText('const unused = 1;', { filePath: '.github/scripts/probe.mjs' });
  assert.ok(ci.messages.some((message) => message.ruleId === 'no-unused-vars'));
  const typed = await eslint.calculateConfigForFile('verification/conformance/public-runner.ts');
  assert.equal(typed.rules['@typescript-eslint/no-floating-promises'][0], 2);
  assert.equal(typed.languageOptions.parserOptions.projectService, true);
  assert.equal(await eslint.isPathIgnored('packages/javascript/src/index.ts'), true);
});
