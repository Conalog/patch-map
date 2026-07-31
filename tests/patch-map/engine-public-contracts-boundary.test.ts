import { readFile } from 'node:fs/promises';

import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  PatchMapEngineExtractionResult as RootExtractionResult,
  PatchMapEngineHistoryResult as RootHistoryResult,
  PatchMapEngineSnapshot as RootSnapshot,
  PatchMapEngineTransactionResult as RootTransactionResult,
  PatchMapEngineTransformerCompletionResult as RootTransformerCompletionResult,
  PatchMapOptions as RootOptions,
  PatchMapViewportState as RootViewportState,
} from '../../src/patch-map';
import type {
  PatchMapEngineExtractionResult as OwnedExtractionResult,
  PatchMapEngineHistoryResult as OwnedHistoryResult,
  PatchMapEngineSnapshot as OwnedSnapshot,
  PatchMapEngineTransactionResult as OwnedTransactionResult,
  PatchMapEngineTransformerCompletionResult as OwnedTransformerCompletionResult,
  PatchMapOptions as OwnedOptions,
  PatchMapViewportState as OwnedViewportState,
} from '../../src/patch-map/engine/public-contracts';

describe('PatchMap Engine public contract boundary', () => {
  it('keeps the contract owner type-only and the Engine facade runtime-owned', async () => {
    const [contractsSource, engineSource] = await Promise.all([
      readFile(
        new URL('../../src/patch-map/engine/public-contracts.ts', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../../src/patch-map/engine.ts', import.meta.url), 'utf8'),
    ]);

    expect(contractsSource).not.toMatch(/^import(?!\s+type\b)/mu);
    expect(contractsSource).not.toMatch(
      /^(?:export\s+)?(?:class|function|const|let|var|enum)\b/mu,
    );
    expect(contractsSource).not.toContain("from '../engine'");
    expect(contractsSource).not.toContain('type PatchMapEngineEventMap');
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
  });
});
