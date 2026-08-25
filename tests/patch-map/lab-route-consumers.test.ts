import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const consumers = [
  '../../package.json',
  '../../lab/patch-map/index.html',
  '../../scripts/verification/patch-map-actual-production-browser.mjs',
  '../../scripts/verification/patch-map-bar-animation-pan-performance.mjs',
  '../../scripts/verification/patch-map-bar-retarget-performance.mjs',
  '../../scripts/verification/patch-map-contract-assets-browser.mjs',
  '../../scripts/verification/patch-map-contract-render-browser.mjs',
  '../../scripts/verification/patch-map-exploratory-10000-browser.mjs',
  '../../scripts/verification/patch-map-instance-bar-performance.mjs',
  '../../scripts/verification/patch-map-interaction-performance.mjs',
  '../../scripts/verification/patch-map-manual-lab-browser.mjs',
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
      expect(source, relativePath).not.toContain('/lab/patch-map/?');
      expect(source, relativePath).not.toContain('lab/patch-map/?');
    }

    const markup = sources.find(({ relativePath }) => relativePath.endsWith('index.html'))?.source;
    expect(markup).toContain('src="/lab/patch-map/contract/main.ts"');
    expect(markup).not.toContain('src="./contract/main.ts"');
  });
});
