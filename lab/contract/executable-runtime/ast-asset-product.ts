import { PATCH_MAP_BUILTIN_ASSETS } from '../../../src/assets/registration-normalization';
import {
  PatchMapAssetError,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
  type PatchMapAssetPolicy,
  type PatchMapAssetPolicyContext,
} from '../../../src/assets/contracts';
import { PatchMapAssetRuntime } from '../../../src/assets';
import { createPatchMapPixiAssetBackend } from '../../../src/assets/pixi-backend';
import type { PatchMap } from '../../../src/engine';
import type { PatchMapAssetDescriptor } from '../../../src/semantic/dataset/contracts';
import {
  deepFreezePatchMapLabValue as deepFreeze,
  isPatchMapLabRecord as isRecord,
} from '../runtime-values';
import {
  patchMapExecutableInvariant as invariant,
} from './descriptor';

const REQUIRED_ASSET_SOURCE = 'fixture://required-init-failure.png';
const DEVICE_SOURCE = 'patch-map-builtin://images/device.svg';

export interface PatchMapAstAssetRuntime {
  readonly assetRuntime: PatchMapAssetRuntime;
  readonly assetPolicy: PatchMapAssetPolicy;
  readonly product: Readonly<Record<string, unknown>>;
}

export function createPatchMapAstAssetRuntime(): PatchMapAstAssetRuntime {
  const assetRuntime = new PatchMapAssetRuntime(createAstPixiAssetBackend());
  return Object.freeze({
    assetRuntime,
    assetPolicy: AST_ASSET_POLICY,
    product: createAssetProductAdapter(assetRuntime),
  });
}

const AST_ASSET_POLICY: PatchMapAssetPolicy = (
  context: PatchMapAssetPolicyContext,
): void => {
  if (context.packageOwned || isRequiredFailureDescriptor(context.descriptor)) return;
  throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
};

function createAstPixiAssetBackend(): PatchMapAssetBackend {
  const pixi = createPatchMapPixiAssetBackend();
  const loadedKeys = new Set<string>();
  const nonBrowserResources = new Map<string, Readonly<Record<string, unknown>>>();
  const hasBrowserAssetEnvironment = typeof document !== 'undefined';
  return Object.freeze({
    get(request: PatchMapAssetBackendRequest): unknown {
      const kind = classifyAstAssetRequest(request);
      if (kind === 'required-failure') return undefined;
      return hasBrowserAssetEnvironment
        ? pixi.get(request)
        : nonBrowserResources.get(request.key);
    },
    async load(request: PatchMapAssetBackendRequest): Promise<unknown> {
      const kind = classifyAstAssetRequest(request);
      if (kind === 'required-failure') {
        throw new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
      }
      invariant(request.descriptor.src === DEVICE_SOURCE, 'AST-001 loads only device builtin');
      // Browser execution exercises Pixi Assets. Node tests keep only a stable
      // object identity because they intentionally have no DOM adapter.
      if (!hasBrowserAssetEnvironment) {
        const resource = deepFreeze({
          kind: 'non-browser-asset-identity',
          cacheIdentity: request.cacheIdentity,
        });
        nonBrowserResources.set(request.key, resource);
        loadedKeys.add(request.key);
        return resource;
      }
      const resource = await pixi.load(request);
      loadedKeys.add(request.key);
      return resource;
    },
    async unload(key: string): Promise<void> {
      invariant(loadedKeys.has(key), 'AST-001 unload owns the Pixi asset key');
      try {
        if (hasBrowserAssetEnvironment) {
          await pixi.unload(key);
        } else {
          nonBrowserResources.delete(key);
        }
      } finally {
        loadedKeys.delete(key);
      }
    },
  });
}

function classifyAstAssetRequest(
  request: PatchMapAssetBackendRequest,
): 'package-builtin' | 'required-failure' {
  if (request.packageOwned) return 'package-builtin';
  if (isRequiredFailureDescriptor(request.descriptor)) return 'required-failure';
  throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
}

function isRequiredFailureDescriptor(descriptor: PatchMapAssetDescriptor): boolean {
  return Object.keys(descriptor).length === 1
    && descriptor.src === REQUIRED_ASSET_SOURCE;
}

function createAssetProductAdapter(
  assetRuntime: PatchMapAssetRuntime,
): Readonly<Record<string, unknown>> {
  const acquisitions = new WeakMap<object, Map<string, Readonly<{
    cacheIdentity: string;
    resourceToken: string;
  }>>>();
  const resourceTokens = new WeakMap<object, string>();
  let resourceSequence = 0;

  const tokenFor = (resource: unknown): string => {
    invariant(isObjectLike(resource), 'asset acquisition resource identity');
    const existing = resourceTokens.get(resource);
    if (existing) return existing;
    const token = `asset-resource-${++resourceSequence}`;
    resourceTokens.set(resource, token);
    return token;
  };

  return Object.freeze({
    registerAssets(engineValue: unknown, optionsValue: unknown): Readonly<Record<string, unknown>> {
      const engine = requireAssetEngine(engineValue);
      const options = requireRuntimeRecord(optionsValue, 'registerAssets options');
      const instanceId = requireRuntimeString(options.instanceId, 'registerAssets instanceId');
      const aliases = requireRuntimeStringArray(options.aliases, 'registerAssets aliases');
      invariant(
        sameRuntimeArray(aliases, PATCH_MAP_BUILTIN_ASSETS.map(({ alias }) => alias)),
        'AST-001 builtin alias inventory',
      );
      const result = engine.registerAssets(instanceId, PATCH_MAP_BUILTIN_ASSETS);
      return deepFreeze({
        registeredAliases: [...result.registeredAliases],
        duplicateAliases: [...result.duplicateAliases],
      });
    },
    initializeWithRequiredAssetFailure(
      engineValue: unknown,
      optionsValue: unknown,
    ) {
      const engine = requireAssetEngine(engineValue);
      const options = requireRuntimeRecord(optionsValue, 'required failure options');
      const alias = requireRuntimeString(options.alias, 'required failure alias');
      const source = requireRuntimeString(options.source, 'required failure source');
      const instanceId = requireRuntimeString(options.instanceId, 'required failure instanceId');
      invariant(source === REQUIRED_ASSET_SOURCE, 'AST-001 required failure source');
      return engine.initialize({
        instanceId,
        width: 800,
        height: 600,
        pixelRatio: 1,
        strategy: 'mesh',
        preference: 'webgl',
        requiredAssets: Object.freeze([
          Object.freeze({ alias, descriptor: source, kind: 'image' as const }),
        ]),
      });
    },
    async acquireAsset(
      engineValue: unknown,
      optionsValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      const engine = requireAssetEngine(engineValue);
      const options = requireRuntimeRecord(optionsValue, 'acquireAsset options');
      const instanceId = requireRuntimeString(options.instanceId, 'acquireAsset instanceId');
      const alias = requireRuntimeString(options.alias, 'acquireAsset alias');
      invariant(
        engine.assetProbe().session?.instanceId === instanceId,
        'acquireAsset instance identity',
      );
      const acquisition = await engine.acquireAsset(alias);
      const resourceToken = tokenFor(acquisition.resource);
      const byAlias = acquisitions.get(engine) ?? new Map<string, Readonly<{
        cacheIdentity: string;
        resourceToken: string;
      }>>();
      byAlias.set(alias, Object.freeze({
        cacheIdentity: acquisition.cacheIdentity,
        resourceToken,
      }));
      acquisitions.set(engine, byAlias);
      return Object.freeze({
        cacheIdentity: acquisition.cacheIdentity,
        resourceToken,
      });
    },
    registerAlias(optionsValue: unknown): Readonly<Record<string, unknown>> {
      const options = requireRuntimeRecord(optionsValue, 'registerAlias options');
      const alias = requireRuntimeString(options.alias, 'registerAlias alias');
      const descriptor = requireRuntimeRecord(options.descriptor, 'registerAlias descriptor');
      invariant(Object.keys(descriptor).length === 1, 'registerAlias descriptor keys');
      const src = requireRuntimeString(descriptor.src, 'registerAlias descriptor src');
      const result = assetRuntime.registerAlias({ alias, descriptor: { src } });
      return deepFreeze({
        registeredAliases: [...result.registeredAliases],
        duplicateAliases: [...result.duplicateAliases],
      });
    },
    inspectAssetState(optionsValue: unknown): Readonly<Record<string, unknown>> {
      const options = requireRuntimeRecord(optionsValue, 'inspectAssetState options');
      const alias = requireRuntimeString(options.alias, 'inspectAssetState alias');
      const engine = options.engine === null ? null : requireAssetEngine(options.engine);
      const runtimeProbe = engine?.assetProbe(alias).runtime ?? assetRuntime.probe(alias);
      const acquisition = engine ? acquisitions.get(engine)?.get(alias) : undefined;
      return deepFreeze({
        catalog: {
          imageAliases: [...runtimeProbe.builtins.aliases],
          fontWeights: [...runtimeProbe.fonts.weights],
        },
        selected: {
          alias,
          cacheKey: acquisition?.cacheIdentity ?? null,
          resourceCount: runtimeProbe.resource?.resourceCount ?? 0,
          leaseCount: runtimeProbe.resource?.leaseCount ?? 0,
          pendingUserCount: runtimeProbe.resource?.pendingCount ?? 0,
          resourceToken: acquisition?.resourceToken ?? null,
        },
        totals: {
          resourceCount: runtimeProbe.resourceCount,
          leaseCount: runtimeProbe.leaseCount,
          pendingCount: runtimeProbe.pendingCount,
        },
      });
    },
  });
}

function requireAssetEngine(value: unknown): PatchMap {
  invariant(isObjectLike(value), 'asset engine');
  for (const method of [
    'registerAssets',
    'initialize',
    'acquireAsset',
    'assetProbe',
  ]) {
    invariant(
      typeof (value as Record<string, unknown>)[method] === 'function',
      `asset engine ${method}()`,
    );
  }
  return value as PatchMap;
}

function requireRuntimeRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  invariant(isRecord(value), label);
  return value;
}

function requireRuntimeString(value: unknown, label: string): string {
  invariant(typeof value === 'string' && value.length > 0, label);
  return value;
}

function requireRuntimeStringArray(value: unknown, label: string): readonly string[] {
  invariant(Array.isArray(value), label);
  return value.map((entry, index) => requireRuntimeString(entry, `${label} ${index}`));
}

function sameRuntimeArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isObjectLike(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}
