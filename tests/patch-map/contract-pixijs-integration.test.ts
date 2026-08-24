import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

// @ts-expect-error -- browser-safe contract handlers are authored as ESM JavaScript.
import * as handlerModule from '../../scripts/verification/core-v2-contract/handlers/pixijs-integration.mjs';
// @ts-expect-error -- browser-safe contract folds are authored as ESM JavaScript.
import * as foldModule from '../../scripts/verification/core-v2-contract/fold-pixijs-integration.mjs';

interface PixiHandlerRuntime {
  readonly PIXIJS_INTEGRATION_HANDLER_REVISION: string;
  readonly PIXIJS_INTEGRATION_CASE_IDS: readonly string[];
  readonly PIXIJS_INTEGRATION_ACTION_TYPES: readonly string[];
  createPixijsIntegrationHandlerEntries(this: void): readonly (
    readonly [string, (...args: unknown[]) => unknown]
  )[];
}

interface PixiFoldRuntime {
  readonly PIXIJS_INTEGRATION_FOLD_REVISION: string;
  foldPixijsIntegrationExecution(this: void, options: unknown): unknown;
}

const handlers = handlerModule as unknown as PixiHandlerRuntime;
const fold = foldModule as unknown as PixiFoldRuntime;

describe('PatchMap PixiJS integration automation substrate', () => {
  it('registers four cases through one collision-free shared handler family', () => {
    expect(handlers.PIXIJS_INTEGRATION_HANDLER_REVISION)
      .toBe('core-v2-pixijs-integration-handlers/1');
    expect(handlers.PIXIJS_INTEGRATION_CASE_IDS).toEqual([
      'PIX-001',
      'PIX-002',
      'PIX-003',
      'PIX-005',
    ]);
    expect(handlers.PIXIJS_INTEGRATION_ACTION_TYPES).toEqual([
      'initialize-engine',
      'load-dataset',
      'inspect-pixijs-public-surface',
      'query-logical-target',
      'map-logical-target-to-render-owner',
      'run-supported-runtime-matrix',
      'attempt-unsupported-backend',
      'run-renderer-loss-matrix',
    ]);
    const entries = handlers.createPixijsIntegrationHandlerEntries();
    expect(entries.map(([id]) => id)).toEqual(
      handlers.PIXIJS_INTEGRATION_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(new Set(entries.map(([id]) => id)).size).toBe(entries.length);
  });

  it('keeps handler and fold browser-safe and outside the expected/comparator boundary', async () => {
    const handlerSource = await readFile(
      new URL(
        '../../scripts/verification/core-v2-contract/handlers/pixijs-integration.mjs',
        import.meta.url,
      ),
      'utf8',
    );
    const foldSource = await readFile(
      new URL(
        '../../scripts/verification/core-v2-contract/fold-pixijs-integration.mjs',
        import.meta.url,
      ),
      'utf8',
    );
    const source = `${handlerSource}\n${foldSource}`;

    expect(fold.PIXIJS_INTEGRATION_FOLD_REVISION)
      .toBe('core-v2-pixijs-integration-fold/1');
    expect(typeof fold.foldPixijsIntegrationExecution).toBe('function');
    expect(source).not.toMatch(
      /catalog-normalized-expected|normalizedExpected|approvedExpected|compareObservation|expectedCase|node:fs|readFile/u,
    );
  });
});
