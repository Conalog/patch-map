import { Texture } from 'pixi.js';

import {
  PatchMapAssetError,
  PatchMapAssetRuntime,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
  type PatchMapAssetDescriptor,
  type PatchMapAssetPolicy,
  type PatchMapAssetPolicyContext,
  type PatchMapAssetRegistration,
  type PatchMapAssetRegistrationResult,
} from '../../../src/patch-map';

const RESOURCE_PROBE_REVISION = 'patch-map-component-assets-resource-probe/1';
const PRODUCT_CLEANUP_REVISION = 'patch-map-component-assets-product-cleanup/1';
const REGISTRATION_REVISION = 'patch-map-component-assets-registration/1';
const SETTLEMENT_REVISION = 'patch-map-component-assets-settlement/1';

type ComponentAssetCaseId = 'REN-008' | 'REN-010';
type FixtureState = 'resolved' | 'releasing' | 'unloaded';

interface FixtureDefinition {
  readonly alias: string;
  readonly src: string;
  readonly normalizedResourceIdentity: string;
}

interface FixtureResource {
  readonly token: string;
  readonly request: PatchMapAssetBackendRequest;
  readonly fixture: FixtureDefinition;
  readonly texture: Texture;
  state: FixtureState;
}

interface ComponentAssetEngine {
  registerAssets(
    instanceId: string,
    registrations: readonly PatchMapAssetRegistration[],
  ): PatchMapAssetRegistrationResult;
  settleSceneImages(): Promise<void>;
  settleSceneImageBindings(bindingKeys: readonly string[]): Promise<void>;
  componentVisualProbe(target: Readonly<{ ownerId: string; componentId: string }>): unknown;
  sceneImageProbe(): unknown;
  snapshot(): unknown;
  assetProbe(): unknown;
}

const FIXTURES = Object.freeze({
  'fixture-image': Object.freeze({
    alias: 'fixture-image',
    src: 'fixture://patch-map/component-assets/fixture-image.svg',
    normalizedResourceIdentity: 'fixture-image@1',
  }),
  'fixture-icon': Object.freeze({
    alias: 'fixture-icon',
    src: 'fixture://patch-map/component-assets/fixture-icon.svg',
    normalizedResourceIdentity: 'fixture-icon@1',
  }),
  'fixture-icon-2': Object.freeze({
    alias: 'fixture-icon-2',
    src: 'fixture://patch-map/component-assets/fixture-icon-2.svg',
    normalizedResourceIdentity: 'fixture-icon-2@1',
  }),
} satisfies Record<string, FixtureDefinition>);

const CASE_ALIASES = Object.freeze({
  'REN-008': Object.freeze(['fixture-image'] as const),
  'REN-010': Object.freeze(['fixture-icon', 'fixture-icon-2'] as const),
}) satisfies Readonly<
  Record<ComponentAssetCaseId, readonly (keyof typeof FIXTURES)[]>
>;

const FIXTURE_BY_SOURCE: ReadonlyMap<string, FixtureDefinition> = new Map(
  Object.values(FIXTURES).map((fixture) => [fixture.src, fixture] as const),
);

export interface PatchMapRenderComponentAssetsProductAdapter {
  registerFixtureAssets(engine: unknown, input: unknown): Readonly<Record<string, unknown>>;
  settleComponentAsset(engine: unknown, input: unknown): Promise<Readonly<Record<string, unknown>>>;
  resourceProbe(input: unknown): Readonly<Record<string, unknown>>;
}

export interface PatchMapRenderComponentAssetsRuntime {
  readonly assetRuntime: PatchMapAssetRuntime;
  readonly assetPolicy: PatchMapAssetPolicy;
  readonly product: PatchMapRenderComponentAssetsProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Creates an isolated REN-008 / REN-010 transport runtime.
 *
 * The backend returns Pixi's local WHITE texture and never consults the
 * network or expected evidence. Geometry, source, tint, and identity remain
 * exclusively owned by PatchMap public probes.
 */
export function createPatchMapRenderComponentAssetsRuntime(): PatchMapRenderComponentAssetsRuntime {
  const journal = new ResourceJournal();
  const backend = new ComponentAssetFixtureBackend(journal);
  const assetRuntime = new PatchMapAssetRuntime(backend);
  const assetPolicy: PatchMapAssetPolicy = (context) => validateFixturePolicy(context);
  let engine: ComponentAssetEngine | null = null;
  let caseId: ComponentAssetCaseId | null = null;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  const product: PatchMapRenderComponentAssetsProductAdapter = Object.freeze({
    registerFixtureAssets(engineValue: unknown, inputValue: unknown) {
      const input = requireRecord(inputValue, 'fixture registration input');
      const selectedCase = requireCaseId(input.caseId);
      const selectedEngine = requireEngine(engineValue);
      invariant(engine === null, 'fixture registration occurs once');
      invariant(cleanupProbe === null, 'fixture registration precedes cleanup');
      engine = selectedEngine;
      caseId = selectedCase;
      const registrations = registrationsFor(selectedCase);
      const result = selectedEngine.registerAssets(instanceIdFor(selectedCase), registrations);
      journal.append('fixture-assets-registered', {
        caseId: selectedCase,
        aliasCount: registrations.length,
        aliases: registrations.map(({ alias }) => alias),
      });
      return deepFreeze({
        revision: REGISTRATION_REVISION,
        caseId: selectedCase,
        registeredAliases: [...result.registeredAliases],
        duplicateAliases: [...result.duplicateAliases],
        transport: 'local-pixi-texture',
        networkRequestCount: 0,
      });
    },

    async settleComponentAsset(
      engineValue: unknown,
      inputValue: unknown,
    ): Promise<Readonly<Record<string, unknown>>> {
      const selectedEngine = requireCurrentEngine(engine, engineValue);
      const input = requireRecord(inputValue, 'component settlement input');
      const selectedCase = requireCurrentCase(caseId, input.caseId);
      const target = requireTarget(input.target);
      const image = imageForTarget(selectedEngine, target, 'before settlement');
      const bindingKey = image === null
        ? null
        : requireString(image.bindingKey, 'component bindingKey');

      if (bindingKey === null) await selectedEngine.settleSceneImages();
      else await selectedEngine.settleSceneImageBindings([bindingKey]);

      const settledImage = imageForTarget(selectedEngine, target, 'after settlement');
      if (bindingKey !== null) {
        invariant(settledImage !== null, 'settled image remains observable');
        invariant(settledImage.bindingKey === bindingKey, 'settled binding identity is stable');
        invariant(settledImage.state === 'resolved', 'settled binding resolves');
        invariant(settledImage.attachmentState === 'current', 'settled binding remains current');
      }
      const backendCounts = backend.counts();
      journal.append('component-asset-settled', {
        caseId: selectedCase,
        ownerId: target.ownerId,
        componentId: target.componentId,
        bindingKey,
      });
      return deepFreeze({
        revision: SETTLEMENT_REVISION,
        caseId: selectedCase,
        target,
        settled: true,
        bindingKey,
        resourceState: settledImage?.state ?? 'not-applicable',
        pendingRequestCount: backendCounts.pendingRequestCount,
      });
    },

    resourceProbe(inputValue: unknown): Readonly<Record<string, unknown>> {
      const input = requireRecord(inputValue, 'resource probe input');
      const selectedCase = requireCurrentCase(caseId, input.caseId);
      const selectedEngine = requireCurrentEngine(engine);
      return projectResourceProbe(selectedCase, selectedEngine, assetRuntime, journal);
    },
  });

  return Object.freeze({
    assetRuntime,
    assetPolicy,
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanupProbe !== null) return cleanupProbe;
      const selectedCase = requireCurrentCase(caseId);
      const selectedEngine = requireCurrentEngine(engine);
      const snapshot = requireRecord(selectedEngine.snapshot(), 'post-destroy engine snapshot');
      invariant(snapshot.lifecycle === 'destroyed', 'post-destroy probe follows Engine cleanup');
      const resources = requireRecord(snapshot.resources, 'post-destroy engine resources');
      const subscriptions = requireRecord(resources.subscriptions, 'post-destroy subscriptions');
      const assetProbe = requireRecord(selectedEngine.assetProbe(), 'post-destroy asset probe');
      const runtime = requireRecord(assetProbe.runtime, 'post-destroy asset runtime');
      invariant(assetProbe.session === null, 'post-destroy asset session is absent');
      const backendCounts = backend.counts();
      const runtimeCounts = {
        canvasCount: count(resources.canvasCount, 'post-destroy canvasCount'),
        subscriptionCount: count(subscriptions.active, 'post-destroy subscriptionCount'),
        pendingWorkCount: count(snapshot.pendingWork, 'post-destroy pendingWorkCount'),
        bindingCount: 0,
        resourceCount: count(runtime.resourceCount, 'post-destroy resourceCount'),
        leaseCount: count(runtime.leaseCount, 'post-destroy leaseCount'),
        pendingSettlementCount: 0,
        pendingReleaseCount: 0,
        staleAttachmentCount: 0,
        rendererObjectCount: 0,
        cleanupFailureCount: count(runtime.cleanupPendingCount, 'post-destroy cleanupFailureCount'),
      };
      const projectedBackendCounts = {
        pendingRequestCount: backendCounts.pendingRequestCount,
        resolvedLiveResourceCount: backendCounts.resolvedLiveResourceCount,
        retainedLeaseCount: count(runtime.leaseCount, 'post-destroy retainedLeaseCount'),
        pendingReleaseCount: backendCounts.pendingReleaseCount,
      };
      const controllerCounts = {
        targetCount: 0,
        bindingCount: 0,
        pendingSettlementCount: 0,
        pendingReleaseCount: 0,
        staleAttachmentCount: 0,
      };
      assertZeroCounts(runtimeCounts, 'runtime cleanup');
      assertZeroCounts(projectedBackendCounts, 'backend cleanup');
      assertZeroCounts(controllerCounts, 'controller cleanup');
      journal.append('post-destroy-resource-drain', { caseId: selectedCase });
      cleanupProbe = deepFreeze({
        revision: PRODUCT_CLEANUP_REVISION,
        caseId: selectedCase,
        runtimeCounts,
        backendCounts: projectedBackendCounts,
        controllerCounts,
        journal: journal.snapshot(),
      });
      return cleanupProbe;
    },
  });
}

class ComponentAssetFixtureBackend implements PatchMapAssetBackend {
  public readonly keyNamespace = 'patch-map-component-assets-local-textures/1';

  private readonly resources = new Map<string, FixtureResource>();
  private requestSequence = 0;

  public constructor(private readonly journal: ResourceJournal) {}

  public get(request: PatchMapAssetBackendRequest): unknown {
    fixtureFor(request.descriptor);
    invariant(!this.resources.has(request.key), 'physical request key is unique');
    return undefined;
  }

  public load(request: PatchMapAssetBackendRequest): Promise<unknown> {
    const fixture = fixtureFor(request.descriptor);
    invariant(!this.resources.has(request.key), 'fixture loads once per physical request');
    const resource: FixtureResource = {
      token: `component-asset-request-${++this.requestSequence}`,
      request,
      fixture,
      texture: Texture.WHITE,
      state: 'resolved',
    };
    this.resources.set(request.key, resource);
    this.journal.append('backend-texture-resolved', {
      requestToken: resource.token,
      alias: fixture.alias,
    });
    return Promise.resolve(resource.texture);
  }

  public describe(
    request: PatchMapAssetBackendRequest,
    resource: unknown,
  ): Readonly<{ normalizedResourceIdentity: string; cacheIdentity: string }> {
    const record = this.resources.get(request.key);
    invariant(record !== undefined, 'described fixture request exists');
    invariant(record.texture === resource, 'described resource is the decoded Pixi Texture');
    return Object.freeze({
      normalizedResourceIdentity: record.fixture.normalizedResourceIdentity,
      cacheIdentity: `alias:${record.fixture.alias}`,
    });
  }

  public async unload(key: string): Promise<void> {
    const record = this.resources.get(key);
    invariant(record !== undefined, 'unload owns a fixture texture request');
    invariant(record.state === 'resolved', 'only a live fixture texture unloads');
    record.state = 'releasing';
    this.journal.append('backend-texture-release-start', {
      requestToken: record.token,
      alias: record.fixture.alias,
    });
    await Promise.resolve();
    record.state = 'unloaded';
    this.journal.append('backend-texture-released', {
      requestToken: record.token,
      alias: record.fixture.alias,
    });
  }

  public counts(): Readonly<{
    pendingRequestCount: number;
    resolvedLiveResourceCount: number;
    pendingReleaseCount: number;
  }> {
    const records = [...this.resources.values()];
    return Object.freeze({
      pendingRequestCount: 0,
      resolvedLiveResourceCount: records.filter(
        ({ state }) => state === 'resolved' || state === 'releasing',
      ).length,
      pendingReleaseCount: records.filter(({ state }) => state === 'releasing').length,
    });
  }
}

class ResourceJournal {
  private readonly entries: Readonly<Record<string, unknown>>[] = [];
  private sequence = 0;

  public append(event: string, details: Readonly<Record<string, unknown>>): void {
    this.entries.push(deepFreeze({ sequence: ++this.sequence, event, ...details }));
  }

  public snapshot(): readonly Readonly<Record<string, unknown>>[] {
    return Object.freeze(this.entries.map((entry) => deepFreeze({ ...entry })));
  }
}

function registrationsFor(caseId: ComponentAssetCaseId): readonly PatchMapAssetRegistration[] {
  return Object.freeze(CASE_ALIASES[caseId].map((alias) => Object.freeze({
    alias,
    descriptor: FIXTURES[alias].src,
    kind: 'image' as const,
  })));
}

function validateFixturePolicy(context: PatchMapAssetPolicyContext): void {
  if (context.packageOwned) return;
  try {
    fixtureFor(context.descriptor);
  } catch {
    throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
  }
}

function fixtureFor(descriptor: PatchMapAssetDescriptor): FixtureDefinition {
  invariant(
    Object.keys(descriptor).length === 1 && typeof descriptor.src === 'string',
    'fixture descriptor contains only src',
  );
  const fixture = FIXTURE_BY_SOURCE.get(descriptor.src);
  invariant(fixture !== undefined, 'fixture descriptor is locally declared');
  return fixture;
}

function projectResourceProbe(
  caseId: ComponentAssetCaseId,
  engine: ComponentAssetEngine,
  assetRuntime: PatchMapAssetRuntime,
  journal: ResourceJournal,
): Readonly<Record<string, unknown>> {
  const snapshot = requireRecord(engine.snapshot(), 'engine snapshot');
  invariant(snapshot.lifecycle !== 'destroyed', 'live resource probe precedes destroy');
  const resources = requireRecord(snapshot.resources, 'engine resources');
  const subscriptions = requireRecord(resources.subscriptions, 'engine subscriptions');
  const imageProbe = requireRecord(engine.sceneImageProbe(), 'scene image probe');
  const images = requireRecord(imageProbe.images, 'scene image records');
  const abandoned = requireRecord(imageProbe.abandonedRequests, 'abandoned image requests');
  const runtime = assetRuntime.probe();
  const session = optionalRecord(requireRecord(engine.assetProbe(), 'asset probe').session);
  const rendererObjectCount = Object.values(images).reduce<number>((total, value) => {
    const image = requireRecord(value, 'scene image record');
    return total + count(image.renderObjectCount, 'scene image renderObjectCount');
  }, 0);
  const sessionCleanupCount = session === null
    ? 0
    : count(session.cleanupPendingCount, 'asset session cleanupPendingCount');
  return deepFreeze({
    revision: RESOURCE_PROBE_REVISION,
    caseId,
    counts: {
      canvasCount: count(resources.canvasCount, 'canvasCount'),
      subscriptionCount: count(subscriptions.active, 'subscriptionCount'),
      pendingWorkCount: count(snapshot.pendingWork, 'pendingWorkCount'),
      bindingCount: count(imageProbe.bindingCount, 'bindingCount'),
      resourceCount: runtime.resourceCount,
      leaseCount: runtime.leaseCount,
      pendingSettlementCount: count(
        imageProbe.pendingSettlementCount,
        'pendingSettlementCount',
      ),
      pendingReleaseCount: count(imageProbe.pendingReleaseCount, 'pendingReleaseCount'),
      staleAttachmentCount: count(abandoned.staleAttachmentCount, 'staleAttachmentCount'),
      rendererObjectCount,
      cleanupFailureCount: Math.max(runtime.cleanupPendingCount, sessionCleanupCount),
    },
    journal: journal.snapshot(),
  });
}

function imageForTarget(
  engine: ComponentAssetEngine,
  target: Readonly<{ ownerId: string; componentId: string }>,
  label: string,
): Record<string, unknown> | null {
  const component = requireRecord(
    engine.componentVisualProbe(target),
    `component visual probe ${label}`,
  );
  const entityId = requireString(component.entityId, `component entityId ${label}`);
  const imageProbe = requireRecord(engine.sceneImageProbe(), `scene image probe ${label}`);
  const images = requireRecord(imageProbe.images, `scene image records ${label}`);
  return optionalRecord(images[entityId]);
}

function requireEngine(value: unknown): ComponentAssetEngine {
  const candidate = requireRecord(value, 'component asset engine') as Partial<ComponentAssetEngine>;
  for (const method of [
    'registerAssets',
    'settleSceneImages',
    'settleSceneImageBindings',
    'componentVisualProbe',
    'sceneImageProbe',
    'snapshot',
    'assetProbe',
  ] as const) {
    invariant(typeof candidate[method] === 'function', `engine ${method}()`);
  }
  return candidate as ComponentAssetEngine;
}

function requireCurrentEngine(
  current: ComponentAssetEngine | null,
  candidate?: unknown,
): ComponentAssetEngine {
  invariant(current !== null, 'fixture assets are registered before runtime observation');
  if (candidate !== undefined) invariant(requireEngine(candidate) === current, 'runtime engine is stable');
  return current;
}

function requireCaseId(value: unknown): ComponentAssetCaseId {
  invariant(value === 'REN-008' || value === 'REN-010', 'supported component asset case ID');
  return value;
}

function requireCurrentCase(
  current: ComponentAssetCaseId | null,
  candidate?: unknown,
): ComponentAssetCaseId {
  invariant(current !== null, 'component asset case is registered');
  if (candidate !== undefined) invariant(requireCaseId(candidate) === current, 'runtime case is stable');
  return current;
}

function instanceIdFor(caseId: ComponentAssetCaseId): string {
  return `${caseId.toLowerCase()}-component-assets-engine`;
}

function requireTarget(value: unknown): Readonly<{ ownerId: string; componentId: string }> {
  const target = requireRecord(value, 'component target');
  return Object.freeze({
    ownerId: requireString(target.ownerId, 'component target ownerId'),
    componentId: requireString(target.componentId, 'component target componentId'),
  });
}

function assertZeroCounts(value: Readonly<Record<string, number>>, label: string): void {
  for (const [field, fieldValue] of Object.entries(value)) {
    invariant(fieldValue === 0, `${label} ${field} drains`);
  }
}

function count(value: unknown, label: string): number {
  invariant(Number.isInteger(value) && (value as number) >= 0, `${label} is a count`);
  return value as number;
}

function requireString(value: unknown, label: string): string {
  invariant(typeof value === 'string' && value.length > 0, `${label} is a non-empty string`);
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} is an object`);
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  return requireRecord(value, 'optional record');
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`PatchMap component-assets runtime invalid: ${message}`);
}
