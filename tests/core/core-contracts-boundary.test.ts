import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('PatchMap Core contract boundary', () => {
  it('remains a type-only dependency leaf with the compatible Core facade', async () => {
    const [contractsSource, coreSource] = await Promise.all([
      readFile(
        new URL('../../src/core/contracts.ts', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../../src/core/index.ts', import.meta.url), 'utf8'),
    ]);

    expect(contractsSource).not.toMatch(/^import(?!\s+type\b)/mu);
    expect(contractsSource).not.toContain('export class PatchMapRuntime');
    expect(contractsSource).not.toContain('new PatchMapPixiRenderer');
    expect(contractsSource).not.toContain('new InvalidationScheduler');
    expect(contractsSource).not.toContain("from '../rendering/pixi-renderer'");
    expect(contractsSource).toContain("from '../rendering-port'");
    expect(coreSource).toContain(
      "export { normalizePatchMapTextTarget } from './contracts';",
    );
    expect(coreSource).toContain("export type * from './contracts';");
  });
});
