import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const consumers = [
  '../../package.json',
  '../../lab/index.html',
  '../../verification/browser/actual-production.mjs',
  '../../performance/runners/bar-animation-pan.mjs',
  '../../performance/runners/bar-retarget.mjs',
  '../../verification/browser/contract-assets.mjs',
  '../../verification/browser/contract-render.mjs',
  '../../verification/browser/exploratory-10000.mjs',
  '../../performance/runners/instance-bar.mjs',
  '../../performance/runners/interaction.mjs',
  '../../verification/browser/manual-lab.mjs',
] as const;

describe('PatchMap Lab route consumers', () => {
  it('uses the canonical slashless route without relative entry assets', async () => {
    const sources = await Promise.all(
      consumers.map(async (relativePath) => ({
        relativePath,
        source: await readFile(new URL(relativePath, import.meta.url), 'utf8'),
      })),
    );

    for (const { relativePath, source } of sources) {
      expect(source, relativePath).not.toContain('/lab/?');
      expect(source, relativePath).not.toContain('lab/?');
    }

    const markup = sources.find(({ relativePath }) => relativePath.endsWith('index.html'))?.source;
    expect(markup).toContain('src="/lab/contract/main.ts"');
    expect(markup).not.toContain('src="./contract/main.ts"');
  });
});
