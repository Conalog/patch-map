import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  PATCH_MAP_EXECUTABLE_CASE_IDS,
  PATCH_MAP_EXECUTABLE_COUNT,
} from '../../lab/patch-map/contract/executable-cases';
import {
  resolvePatchMapExecutableRuntime,
} from '../../lab/patch-map/contract/executable-runtime';

const REGISTRY_ROOT = new URL(
  '../../lab/patch-map/contract/executable-runtime/registry/',
  import.meta.url,
);

describe('PatchMap executable runtime registry composition', () => {
  it('resolves all approved cases deterministically through one descriptor', () => {
    expect(PATCH_MAP_EXECUTABLE_CASE_IDS).toHaveLength(PATCH_MAP_EXECUTABLE_COUNT);
    expect(new Set(PATCH_MAP_EXECUTABLE_CASE_IDS).size).toBe(PATCH_MAP_EXECUTABLE_COUNT);

    const firstPass = PATCH_MAP_EXECUTABLE_CASE_IDS.map((caseId) => (
      resolvePatchMapExecutableRuntime(caseId)
    ));
    const secondPass = PATCH_MAP_EXECUTABLE_CASE_IDS.map((caseId) => (
      resolvePatchMapExecutableRuntime(caseId)
    ));

    firstPass.forEach((descriptor, index) => {
      expect(descriptor).toBe(secondPass[index]);
      expect(descriptor.key).toBeTypeOf('string');
    });
  });

  it('keeps every registry shard outside comparison and answer-evidence imports', async () => {
    const shardNames = (await readdir(REGISTRY_ROOT))
      .filter((name) => name.endsWith('.ts'))
      .sort();
    const sources = await Promise.all([
      readFile(new URL(
        '../../lab/patch-map/contract/executable-runtime/registry.ts',
        import.meta.url,
      ), 'utf8'),
      ...shardNames.map((name) => readFile(new URL(name, REGISTRY_ROOT), 'utf8')),
    ]);
    const forbiddenImport = /(?:from\s+|import\s*\()['"][^'"]*(?:compare|evidence|expected|normalized)[^'"]*['"]/u;

    expect(shardNames).toEqual([
      'assets-operations.ts',
      'foundation-lifecycle.ts',
      'integrations.ts',
      'interaction.ts',
      'rendering.ts',
      'runtime-descriptor.ts',
    ]);
    for (const source of sources) {
      expect(source).not.toMatch(forbiddenImport);
      expect(source).not.toContain('compareObservation');
      expect(source).not.toContain('normalizedExpected');
      expect(source).not.toContain('approvedExpected');
    }
  });
});
