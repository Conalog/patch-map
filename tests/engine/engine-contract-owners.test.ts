import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, expectTypeOf, it } from 'vitest';

import type { PatchMapEngineExtractionResult as RootExtractionResult } from '../../src/engine/contracts/extraction';
import type {
  PatchMapEngineHistoryResult as RootHistoryResult,
  PatchMapEngineTransformerCompletionResult as RootTransformerCompletionResult,
} from '../../src/engine/contracts/history-transformer';
import type {
  PatchMapEngineSnapshot as RootSnapshot,
  PatchMapEngineOptions as RootOptions,
} from '../../src/engine/contracts/product';
import type { PatchMapEngineTransactionResult as RootTransactionResult } from '../../src/engine/contracts/mutation';
import type { PatchMapViewportState as RootViewportState } from '../../src/engine/contracts/viewport';
import type {
  PatchMapEngineHistoryResult as OwnedHistoryResult,
  PatchMapEngineTransformerCompletionResult as OwnedTransformerCompletionResult,
} from '../../src/engine/contracts/history-transformer';
import type {
  PatchMapEngineTransactionResult as OwnedTransactionResult,
} from '../../src/engine/contracts/mutation';
import type {
  PatchMapEngineSnapshot as OwnedSnapshot,
  PatchMapEngineOptions as OwnedOptions,
} from '../../src/engine/contracts/product';
import type {
  PatchMapEngineExtractionResult as OwnedExtractionResult,
} from '../../src/engine/contracts/extraction';
import type {
  PatchMapViewportState as OwnedViewportState,
} from '../../src/engine/contracts/viewport';

describe('PatchMap Engine public contract boundary', () => {
  it('publishes every type-only contract owner directly from Engine', async () => {
    const contractsDirectory = new URL(
      '../../src/engine/contracts/',
      import.meta.url,
    );
    const contractModuleNames = (await readdir(contractsDirectory))
      .filter((name) => name.endsWith('.ts'))
      .sort();
    const [engineSource, ...ownedContractSources] = await Promise.all([
      readFile(new URL('../../src/engine/index.ts', import.meta.url), 'utf8'),
      ...contractModuleNames.map((name) => (
        readFile(new URL(name, contractsDirectory), 'utf8')
      )),
    ]);

    expect(contractModuleNames).toEqual([
      'editor.ts',
      'extraction.ts',
      'history-transformer.ts',
      'lifecycle.ts',
      'mutation.ts',
      'product.ts',
      'query-selection.ts',
      'rendering.ts',
      'viewport.ts',
    ]);
    for (const source of ownedContractSources) {
      expect(source).not.toMatch(/^import(?!\s+type\b)/mu);
      expect(source).not.toMatch(
        /^(?:export\s+)?(?:class|function|const|let|var|enum)\b/mu,
      );
    }
    const exportedOwnerModules = [...engineSource.matchAll(
      /^export type \* from '\.\/contracts\/([^']+)';$/gmu,
    )].map((match) => `${match[1]}.ts`);
    expect(exportedOwnerModules).toEqual(contractModuleNames);
    expect(engineSource).toContain('type PatchMapEngineEventMap = {');
    expect(engineSource).toContain('export class PatchMap {');
  });

  it('preserves representative root contract exports exactly', () => {
    expectTypeOf<RootOptions>().toEqualTypeOf<OwnedOptions>();
    expectTypeOf<RootSnapshot>().toEqualTypeOf<OwnedSnapshot>();
    expectTypeOf<RootTransactionResult>().toEqualTypeOf<OwnedTransactionResult>();
    expectTypeOf<RootHistoryResult>().toEqualTypeOf<OwnedHistoryResult>();
    expectTypeOf<RootViewportState>().toEqualTypeOf<OwnedViewportState>();
    expectTypeOf<RootTransformerCompletionResult>()
      .toEqualTypeOf<OwnedTransformerCompletionResult>();
    expectTypeOf<RootExtractionResult>().toEqualTypeOf<OwnedExtractionResult>();
  });
});
