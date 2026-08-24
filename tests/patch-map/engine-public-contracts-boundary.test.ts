import { readdir, readFile } from 'node:fs/promises';

import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  PatchMapEngineExtractionResult as RootExtractionResult,
  PatchMapEngineHistoryResult as RootHistoryResult,
  PatchMapEngineSnapshot as RootSnapshot,
  PatchMapEngineTransactionResult as RootTransactionResult,
  PatchMapEngineTransformerCompletionResult as RootTransformerCompletionResult,
  PatchMapEngineOptions as RootOptions,
  PatchMapViewportState as RootViewportState,
} from '../../src/patch-map';
import type {
  PatchMapEngineExtractionResult as OwnedExtractionResult,
  PatchMapEngineGeometryProbe as OwnedGeometryProbe,
  PatchMapEngineHistoryResult as OwnedHistoryResult,
  PatchMapEngineQueryResult as OwnedQueryResult,
  PatchMapEngineSnapshot as OwnedSnapshot,
  PatchMapEngineTransactionResult as OwnedTransactionResult,
  PatchMapEngineTransformerCompletionResult as OwnedTransformerCompletionResult,
  PatchMapEngineOptions as OwnedOptions,
  PatchMapViewportState as OwnedViewportState,
} from '../../src/patch-map/engine/public-contracts';
import type {
  PatchMapEngineHistoryResult as DownwardHistoryResult,
  PatchMapEngineTransformerCompletionResult as DownwardTransformerCompletionResult,
} from '../../src/patch-map/engine/contracts/history-transformer';
import type {
  PatchMapEngineTransactionResult as DownwardTransactionResult,
} from '../../src/patch-map/engine/contracts/mutation';
import type {
  PatchMapEngineSnapshot as DownwardSnapshot,
  PatchMapEngineOptions as DownwardOptions,
} from '../../src/patch-map/engine/contracts/product';
import type {
  PatchMapEngineQueryResult as DownwardQueryResult,
} from '../../src/patch-map/engine/contracts/query-selection';
import type {
  PatchMapEngineGeometryProbe as DownwardGeometryProbe,
} from '../../src/patch-map/engine/contracts/rendering';

describe('PatchMap Engine public contract boundary', () => {
  it('keeps the contract owner type-only and the Engine facade runtime-owned', async () => {
    const contractsDirectory = new URL(
      '../../src/patch-map/engine/contracts/',
      import.meta.url,
    );
    const contractModuleNames = (await readdir(contractsDirectory))
      .filter((name) => name.endsWith('.ts'))
      .sort();
    const [contractsSource, engineSource, ...ownedContractSources] = await Promise.all([
      readFile(
        new URL('../../src/patch-map/engine/public-contracts.ts', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../../src/patch-map/engine.ts', import.meta.url), 'utf8'),
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
    for (const source of [contractsSource, ...ownedContractSources]) {
      expect(source).not.toMatch(/^import(?!\s+type\b)/mu);
      expect(source).not.toMatch(
        /^(?:export\s+)?(?:class|function|const|let|var|enum)\b/mu,
      );
      expect(source).not.toContain("from '../public-contracts'");
    }
    expect(contractsSource).not.toContain("from '../engine'");
    expect(contractsSource).not.toContain('type PatchMapEngineEventMap');
    expect(contractsSource).toContain("export type * from './contracts/rendering';");
    expect(contractsSource).toContain("export type * from './contracts/product';");
    expect(contractsSource).toContain("export type * from './contracts/mutation';");
    expect(engineSource).toContain("export type * from './engine/public-contracts';");
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
    expectTypeOf<OwnedOptions>().toEqualTypeOf<DownwardOptions>();
    expectTypeOf<OwnedSnapshot>().toEqualTypeOf<DownwardSnapshot>();
    expectTypeOf<OwnedTransactionResult>()
      .toEqualTypeOf<DownwardTransactionResult>();
    expectTypeOf<OwnedHistoryResult>().toEqualTypeOf<DownwardHistoryResult>();
    expectTypeOf<OwnedTransformerCompletionResult>()
      .toEqualTypeOf<DownwardTransformerCompletionResult>();
    expectTypeOf<OwnedGeometryProbe>().toEqualTypeOf<DownwardGeometryProbe>();
    expectTypeOf<OwnedQueryResult>().toEqualTypeOf<DownwardQueryResult>();
  });
});
