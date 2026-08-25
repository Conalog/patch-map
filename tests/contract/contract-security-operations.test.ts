import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import normalizedExpectedCatalog from '../../contracts/evidence/catalog-normalized-expected.v1.json';
import { describe, expect, it } from 'vitest';

import { createPatchMapExecutableLabBridge } from '../../lab/contract/executable-bridge';
import {
  PATCH_MAP_SECURITY_OPERATIONS_CASE_IDS,
  PATCH_MAP_SECURITY_OPERATIONS_RUNTIME_REVISION,
  createPatchMapSecurityOperationsRuntime,
  type PatchMapSecurityOperationsCaseId,
} from '../../lab/contract/security-operations-runtime';
import type {
  PatchMapEngineSurface,
  PatchMapEngineSurfaceFactory,
  PatchMapPoint,
  PatchMapSurfaceDebug,
  PatchMapSurfaceOptions,
  PatchMapSurfaceReconcileOptions,
  PatchMapSurfaceReconcileResult,
  PatchMapSurfaceView,
} from '../../src/patch-map/engine';
import type { PatchMapPixiRendererLossProbe } from '../../src/patch-map/renderers/types';
// @ts-expect-error -- browser-safe contract handlers are authored as ESM JavaScript.
import * as handlerModule from '../../verification/contract/handlers/security-operations.mjs';
// @ts-expect-error -- browser-safe contract folds are authored as ESM JavaScript.
import * as foldModule from '../../verification/contract/fold-security-operations.mjs';

type JsonRecord = Record<string, unknown>;

interface HandlerRuntime {
  readonly SECURITY_OPERATIONS_HANDLER_REVISION: string;
  readonly SECURITY_OPERATIONS_CASE_IDS: readonly string[];
  readonly SECURITY_OPERATIONS_ACTION_TYPES: readonly string[];
  createSecurityOperationsHandlerEntries(
    this: void,
    product: Readonly<JsonRecord>,
  ): readonly (readonly [string, (...args: unknown[]) => unknown])[];
}

interface FoldRuntime {
  readonly SECURITY_OPERATIONS_FOLD_REVISION: string;
  foldSecurityOperationsExecution(this: void, options: unknown): unknown;
}

interface CompareRuntime {
  compareObservation(
    this: void,
    options: Readonly<JsonRecord>,
  ): Readonly<{
    readonly passed: number;
    readonly failed: number;
    readonly assertions: readonly Readonly<{
      readonly path: string;
      readonly passed: boolean;
    }>[];
  }>;
}

interface ExpectedCase extends JsonRecord {
  readonly id: string;
}

const handlers = handlerModule as unknown as HandlerRuntime;
const fold = foldModule as unknown as FoldRuntime;
const compareRuntime = await import(
  /* @vite-ignore */ new URL(
    '../../verification/contract/compare.mjs',
    import.meta.url,
  ).href
) as CompareRuntime;

describe('PatchMap security and operations automation substrate', () => {
  it('registers five cases through one expected-blind runtime, handler, and fold', async () => {
    const runtime = createPatchMapSecurityOperationsRuntime('SEC-003');
    const entries = handlers.createSecurityOperationsHandlerEntries(
      runtime.product as unknown as Readonly<JsonRecord>,
    );
    const sources = await Promise.all([
      '../../lab/contract/security-operations-runtime.ts',
      '../../verification/contract/handlers/security-operations.mjs',
      '../../verification/contract/fold-security-operations.mjs',
    ].map(async (relativePath) => readFile(
      fileURLToPath(new URL(relativePath, import.meta.url)),
      'utf8',
    )));
    const source = sources.join('\n');

    expect(PATCH_MAP_SECURITY_OPERATIONS_RUNTIME_REVISION)
      .toBe('patch-map-security-operations-runtime/1');
    expect(PATCH_MAP_SECURITY_OPERATIONS_CASE_IDS).toEqual([
      'SEC-002',
      'SEC-003',
      'SEC-004',
      'OPS-001',
      'OPS-002',
    ]);
    expect(handlers.SECURITY_OPERATIONS_HANDLER_REVISION)
      .toBe('patch-map-security-operations-handlers/1');
    expect(handlers.SECURITY_OPERATIONS_CASE_IDS)
      .toEqual(PATCH_MAP_SECURITY_OPERATIONS_CASE_IDS);
    expect(fold.SECURITY_OPERATIONS_FOLD_REVISION)
      .toBe('patch-map-security-operations-fold/1');
    expect(entries.map(([id]) => id)).toEqual(
      handlers.SECURITY_OPERATIONS_ACTION_TYPES.map((type) => `contract/${type}`),
    );
    expect(new Set(entries.map(([id]) => id)).size).toBe(entries.length);
    expect(source).not.toMatch(
      /catalog-normalized-expected|normalizedExpected|approvedExpected|compareObservation|expectedCase/u,
    );
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:compare|observe)\.mjs['"]/u);
    expect(runtime.postDestroyProductProbe()).toMatchObject({
      callbackRegistrations: 0,
      queuedActionCount: 0,
      retainedChannelRecordCount: 0,
    });
  });

  it('redacts every approved channel and releases its local observers', () => {
    const runtime = createPatchMapSecurityOperationsRuntime('SEC-003');
    const marker = 'fixture-sensitive-value';
    const injection = runtime.product.injectSensitiveFailure({
      marker,
      fields: ['text', 'dataUri', 'token', 'queryString', 'attrs'],
    });
    const captured = runtime.product.captureSensitiveChannels([
      'return',
      'observer',
      'telemetry',
      'log',
      'lab',
      'evidence-artifact',
    ]);
    const serialized = JSON.stringify({ injection, captured });

    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain('Bearer ');
    expect(serialized).not.toContain('data:');
    expect(runtime.postDestroyProductProbe()).toEqual({
      revision: 'patch-map-security-operations-cleanup/1',
      caseId: 'SEC-003',
      callbackRegistrations: 0,
      queuedActionCount: 0,
      retainedChannelRecordCount: 0,
    });
    expect(() => runtime.product.captureSensitiveChannels([]))
      .toThrow(/after release/u);
  });

  it.each(PATCH_MAP_SECURITY_OPERATIONS_CASE_IDS)(
    'executes and repeats %s through the same focused Lab bridge',
    async (caseId) => {
      const surfaces: OperationsContractSurface[] = [];
      const bridge = createPatchMapExecutableLabBridge({
        caseId,
        rootTestId: `scenario-${caseId.toLowerCase()}`,
        size: '100',
        seed: 319,
        surfaceHost: emptySurfaceHost(),
        surfaceFactory: operationsSurfaceFactory(surfaces),
        environment: {
          browser: 'vitest',
          browserVersion: 'vitest',
          backend: 'webgl2',
          platform: process.platform,
          locale: 'en-US',
          devicePixelRatio: 1,
          routeSize: '100',
        },
      });

      const first = await bridge.runCase();
      const repeated = await bridge.repeatCase();
      const comparison = compareRuntime.compareObservation({
        expectedCase: approvedExpected(caseId),
        actual: first.actualObservation,
        fixtures: first.fixtures,
        captures: first.captures,
      });

      expect(first.status).toBe('observed');
      expect(repeated.status).toBe('observed');
      expect(repeated.actualObservation).toEqual(first.actualObservation);
      expect(first.actualObservation.case).toMatchObject({ id: caseId });
      if (caseId === 'OPS-002') {
        const actionResults = first.execution.actionResults as readonly Readonly<{
          readonly delta: Readonly<{
            readonly actual: Readonly<JsonRecord>;
          }>;
        }>[];
        expect(actionResults[3]?.delta.actual.transaction)
          .toMatchObject({ status: 'committed' });
        expect(first.actualObservation.revisions).toMatchObject({ scene: 3 });
      }
      expect(first.cleanup).toMatchObject({ status: 'completed', errors: [] });
      expect(repeated.cleanup).toMatchObject({ status: 'completed', errors: [] });
      expect(
        comparison.assertions.filter(({ passed }) => !passed).map(({ path }) => path),
      ).toEqual([]);
      const destroyed = await bridge.destroyCase();
      expect(destroyed).toMatchObject({
        status: 'completed',
        runCount: 2,
        completedRunCount: 2,
      });
      expect(destroyed).toMatchObject(surfaces.length === 0
        ? {
            retainedCanvasCount: null,
            retainedSubscriptionCount: null,
            retainedPendingWork: null,
          }
        : {
            retainedCanvasCount: 0,
            retainedSubscriptionCount: 0,
            retainedPendingWork: 0,
          });
      expect(surfaces.every((surface) => surface.destroyed)).toBe(true);
      expect(surfaces.every((surface) => surface.canvasCount === 0)).toBe(true);
    },
  );
});

function approvedExpected(caseId: PatchMapSecurityOperationsCaseId): ExpectedCase {
  const selected = (normalizedExpectedCatalog.cases as readonly ExpectedCase[])
    .find(({ id }) => id === caseId);
  if (selected === undefined) throw new Error(`Missing expected ${caseId}`);
  return selected;
}

function emptySurfaceHost(): HTMLElement {
  return {
    querySelector(): null {
      return null;
    },
  } as unknown as HTMLElement;
}

function operationsSurfaceFactory(
  surfaces: OperationsContractSurface[],
): PatchMapEngineSurfaceFactory {
  return (options) => {
    const surface = new OperationsContractSurface(options);
    surfaces.push(surface);
    return Promise.resolve(surface);
  };
}

class OperationsContractSurface implements PatchMapEngineSurface {
  public canvasCount = 1;
  public destroyed = false;
  private readonly canvas = {} as HTMLCanvasElement;
  private rendererLost = false;

  public constructor(private readonly options: PatchMapSurfaceOptions) {}

  public canvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  public captureBase64(): Promise<string> {
    return Promise.resolve('data:image/png;base64,cGl4aQ==');
  }

  public load(): void {}

  public reconcile(
    _input: unknown,
    _options: PatchMapSurfaceReconcileOptions = {},
  ): PatchMapSurfaceReconcileResult {
    return Object.freeze({
      status: 'committed',
      operationCount: 1,
      denseChanged: true,
      diagnostics: Object.freeze([]),
    });
  }

  public publishFrame(): void {}

  public resize(): boolean {
    return false;
  }

  public setView(_view: PatchMapSurfaceView): void {}

  public select(): void {}

  public hitTestScreen(): string | null {
    return null;
  }

  public screenToWorld(point: PatchMapPoint): PatchMapPoint {
    return point;
  }

  public debugSnapshot(): PatchMapSurfaceDebug {
    return Object.freeze({
      cssSize: Object.freeze([this.options.width, this.options.height] as const),
      backingSize: Object.freeze([
        this.options.width * this.options.pixelRatio,
        this.options.height * this.options.pixelRatio,
      ] as const),
      selectionIds: Object.freeze([]),
      activeAnimationCount: 0,
      activeGestureCount: 0,
      renderCommandCount: 2,
      visiblePrimitiveCount: 4,
    });
  }

  public rendererLossProbe(): PatchMapPixiRendererLossProbe {
    return Object.freeze({
      backend: 'webgl2',
      webGLVersion: 2,
      state: this.rendererLost ? 'lost' : 'healthy',
      contextLost: this.rendererLost,
      lossEventCount: this.rendererLost ? 1 : 0,
      restorationEventCount: 0,
      recoveredFrameCount: 0,
      listenerCount: this.destroyed ? 0 : 2,
      lastLossFrame: this.rendererLost ? 1 : null,
      lastRecoveryFrame: null,
      destroyed: this.destroyed,
    });
  }

  public forceRendererLoss(): boolean {
    this.rendererLost = true;
    return true;
  }

  public destroy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false);
    this.destroyed = true;
    this.canvasCount = 0;
    return Promise.resolve(true);
  }
}
