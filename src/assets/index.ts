import type { PatchMapAssetDescriptor, PatchMapAssetSource } from '../semantic/dataset';
import { stableHash64Hex as stableHash } from '../shared/stable-hash';
import {
  PatchMapAssetError,
  type PatchMapAssetAcquisition,
  type PatchMapAssetBackend,
  type PatchMapAssetBackendRequest,
  type PatchMapAssetPolicy,
  type PatchMapAssetRegistration,
  type PatchMapAssetRegistrationResult,
  type PatchMapAssetResourceProbe,
  type PatchMapAssetRuntimeProbe,
  type PatchMapAssetSessionProbe,
  type PatchMapNormalizedAssetRegistration,
} from './contracts';
import { allowPackageBuiltinsOnly } from './ingestion-policy';
import { createPatchMapPixiAssetBackend } from './pixi-backend';
import {
  BUILTIN_FONT_WEIGHTS,
  BUILTIN_IMAGE_ALIASES,
  PATCH_MAP_BUILTIN_ASSETS,
  canonicalDescriptor,
  deepFreeze,
  invalidAsset,
  isPackageBuiltin,
  nonempty,
  normalizeDescriptor,
  normalizeRegistration,
  registrationSignature,
  resourceIdentityFields,
} from './registration-normalization';

export { PatchMapAssetError } from './contracts';
export type {
  PatchMapAssetAcquisition,
  PatchMapAssetBackend,
  PatchMapAssetBackendRequest,
  PatchMapAssetDiagnosticCategory,
  PatchMapAssetDiagnosticCode,
  PatchMapAssetIngestionDecision,
  PatchMapAssetIngestionPolicyProfile,
  PatchMapAssetPolicy,
  PatchMapAssetPolicyContext,
  PatchMapAssetRegistration,
  PatchMapAssetRegistrationResult,
  PatchMapAssetResourceProbe,
  PatchMapAssetResponseMetadata,
  PatchMapAssetRuntimeProbe,
  PatchMapAssetSessionProbe,
  PatchMapNormalizedAssetRegistration,
  PatchMapPixiAssetBackendOptions,
} from './contracts';
export {
  assertPatchMapAssetResponseAllowed,
  createPatchMapAssetIngestionPolicy,
  evaluatePatchMapAssetResponsePolicy,
} from './ingestion-policy';
export { createPatchMapPixiAssetBackend } from './pixi-backend';
export {
  PATCH_MAP_BUILTIN_ASSETS,
  normalizePatchMapAssetDescriptor,
} from './registration-normalization';

interface AssetCatalogEntry extends PatchMapNormalizedAssetRegistration {
  readonly canonical: string;
  readonly resourceIdentity: string;
  readonly cacheIdentity: string;
  readonly packageOwned: boolean;
}

interface SharedResource {
  readonly canonical: string;
  readonly cacheIdentity: string;
  readonly backendKey: string;
  readonly request: PatchMapAssetBackendRequest;
  readonly descriptor: PatchMapAssetDescriptor;
  readonly ownership: 'patch-map' | 'external';
  readonly resource: Promise<unknown>;
  readonly pendingUsers: Set<SessionUse>;
  readonly leases: Set<SessionUse>;
  state: 'pending' | 'resolved' | 'releasing' | 'cleanup-failed';
  failed: boolean;
  description?: PatchMapAssetResourceDescription;
  settlementCollection?: Promise<void>;
  releasing?: Promise<void>;
}

interface SessionUse {
  readonly canonical: string;
  readonly cacheIdentity: string;
  readonly descriptor: PatchMapAssetDescriptor;
  readonly packageOwned: boolean;
  readonly promise: Promise<unknown>;
  status: 'validating' | 'pending' | 'leased' | 'released';
  handleCount: number;
  description?: PatchMapAssetResourceDescription;
  entry?: SharedResource;
}

interface PatchMapAssetResourceDescription {
  readonly normalizedResourceIdentity: string;
  readonly describedCacheIdentity?: string;
}

const RESOURCE_COORDINATORS = new WeakMap<PatchMapAssetBackend, Map<string, SharedResource>>();
const BACKEND_NAMESPACES = new WeakMap<PatchMapAssetBackend, string>();
const BACKEND_RESOURCE_SEQUENCES = new WeakMap<PatchMapAssetBackend, number>();
let backendNamespaceSequence = 0;
const DEFAULT_PIXI_ASSET_BACKEND = createPatchMapPixiAssetBackend();

export class PatchMapAssetRuntime {
  private readonly aliases = new Map<string, AssetCatalogEntry>();
  private readonly resources: Map<string, SharedResource>;
  private readonly backendNamespace: string;

  public constructor(
    private readonly backend: PatchMapAssetBackend = DEFAULT_PIXI_ASSET_BACKEND,
  ) {
    this.backendNamespace = resolveBackendNamespace(backend);
    const existing = RESOURCE_COORDINATORS.get(backend);
    if (existing) this.resources = existing;
    else {
      this.resources = new Map();
      RESOURCE_COORDINATORS.set(backend, this.resources);
    }
  }

  public createSession(options: Readonly<{
    instanceId: string;
    policy?: PatchMapAssetPolicy;
  }>): PatchMapAssetSession {
    return new PatchMapAssetSession(
      this,
      nonempty(options.instanceId, 'instanceId'),
      options.policy ?? allowPackageBuiltinsOnly,
    );
  }

  public registerAlias(registration: PatchMapAssetRegistration): PatchMapAssetRegistrationResult {
    const normalized = normalizeRegistration(registration);
    const canonical = canonicalDescriptor(normalized.descriptor);
    const existing = this.aliases.get(normalized.alias);
    if (existing) {
      if (
        existing.canonical !== canonical ||
        existing.kind !== normalized.kind ||
        existing.fontWeight !== normalized.fontWeight
      ) {
        // The closed diagnostic registry is authoritative. The immutable
        // AST-001 expected name remains a known contract mismatch.
        throw new PatchMapAssetError('CONFLICT', 'CONFLICT', false);
      }
      return Object.freeze({
        registeredAliases: Object.freeze([]),
        duplicateAliases: Object.freeze([normalized.alias]),
      });
    }
    const entry = Object.freeze({
      ...normalized,
      canonical,
      ...resourceIdentityFields(canonical, isPackageBuiltin(normalized, canonical)),
    });
    this.aliases.set(entry.alias, entry);
    return Object.freeze({
      registeredAliases: Object.freeze([entry.alias]),
      duplicateAliases: Object.freeze([]),
    });
  }

  public registerAssets(
    registrations: readonly PatchMapAssetRegistration[],
  ): PatchMapAssetRegistrationResult {
    if (!Array.isArray(registrations)) invalidAsset('registrations must be an array');
    const normalized = registrations.map(normalizeRegistration);
    const seen = new Map<string, string>();
    for (const registration of normalized) {
      const canonical = canonicalDescriptor(registration.descriptor);
      const signature = registrationSignature(registration, canonical);
      const previous = seen.get(registration.alias);
      if (previous !== undefined && previous !== signature) {
        throw new PatchMapAssetError('CONFLICT', 'CONFLICT', false);
      }
      seen.set(registration.alias, signature);
      const existing = this.aliases.get(registration.alias);
      if (
        existing &&
        (existing.canonical !== canonical ||
          existing.kind !== registration.kind ||
          existing.fontWeight !== registration.fontWeight)
      ) {
        throw new PatchMapAssetError('CONFLICT', 'CONFLICT', false);
      }
    }

    const registeredAliases: string[] = [];
    const duplicateAliases: string[] = [];
    for (const registration of normalized) {
      const result = this.registerAlias(registration);
      registeredAliases.push(...result.registeredAliases);
      duplicateAliases.push(...result.duplicateAliases);
    }
    return Object.freeze({
      registeredAliases: Object.freeze(registeredAliases),
      duplicateAliases: Object.freeze(duplicateAliases),
    });
  }

  public probe(alias?: string): PatchMapAssetRuntimeProbe {
    const entry = alias === undefined ? undefined : this.aliases.get(alias);
    const resource = entry ? this.resources.get(entry.resourceIdentity) : undefined;
    return deepFreeze({
      builtins: { aliases: [...BUILTIN_IMAGE_ALIASES] },
      fonts: { weights: [...BUILTIN_FONT_WEIGHTS] },
      aliasCount: this.aliases.size,
      resourceCount: this.resources.size,
      pendingCount: sum(this.resources, ({ pendingUsers }) => pendingUsers.size),
      leaseCount: sum(this.resources, ({ leases }) => leases.size),
      cleanupPendingCount: sum(
        this.resources,
        ({ state }) => state === 'cleanup-failed' ? 1 : 0,
      ),
      resource: entry
        ? resourceProbe(entry.cacheIdentity, resource)
        : null,
    });
  }

  public resolve(alias: string): AssetCatalogEntry {
    const cleanAlias = nonempty(alias, 'alias');
    const entry = this.aliases.get(cleanAlias);
    if (!entry) throw new PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
    return entry;
  }

  public sourceEntry(source: PatchMapAssetSource): AssetCatalogEntry {
    const descriptor = normalizeDescriptor(source);
    const canonical = canonicalDescriptor(descriptor);
    return Object.freeze({
      alias: '',
      descriptor,
      kind: 'image',
      canonical,
      ...resourceIdentityFields(canonical, false),
    });
  }

  public async attach(use: SessionUse): Promise<unknown> {
    while (true) {
      if (use.status === 'released') {
        throw new PatchMapAssetError('CANCELLED', 'CANCELLED', false);
      }
      const existing = this.resources.get(use.canonical);
      if (existing?.state === 'releasing') {
        await existing.releasing?.catch(() => undefined);
        continue;
      }
      if (existing?.state === 'cleanup-failed') {
        // Never lease a resource after its backend teardown has started and
        // failed. Pixi unload is not an atomic public contract: the cached
        // Texture or FontFace may already be partly destroyed. Finish cleanup
        // first, then loop and create a physically isolated replacement.
        await this.collect(existing);
        continue;
      }
      let resource: SharedResource;
      try {
        resource = existing ?? this.createResource(use);
      } catch {
        use.status = 'released';
        throw new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
      }
      use.entry = resource;
      use.status = 'pending';
      resource.pendingUsers.add(use);
      try {
        const value = await resource.resource;
        resource.pendingUsers.delete(use);
        if ((use.status as SessionUse['status']) === 'released') {
          throw new PatchMapAssetError('CANCELLED', 'CANCELLED', false);
        }
        resource.description ??= this.describeResource(resource, value);
        use.description = resource.description;
        resource.leases.add(use);
        use.status = 'leased';
        return value;
      } catch (error) {
        resource.pendingUsers.delete(use);
        const abandoned = (use.status as SessionUse['status']) === 'released';
        if (abandoned) {
          // release() already detached this consumer. Keep the public acquire
          // cancellation deterministic and let one settlement observer own
          // eventual backend cleanup without extending session destruction.
          this.collectAfterSettlement(resource);
        } else {
          use.status = 'released';
          await this.collect(resource);
        }
        if (abandoned) {
          throw new PatchMapAssetError('CANCELLED', 'CANCELLED', false);
        }
        if (error instanceof PatchMapAssetError) throw error;
        throw new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
      }
    }
  }

  public async release(use: SessionUse): Promise<void> {
    if (use.status === 'released') return;
    const entry = use.entry;
    use.status = 'released';
    if (!entry) return;
    entry.pendingUsers.delete(use);
    entry.leases.delete(use);
    await this.collect(entry);
  }

  public async retryCleanup(): Promise<void> {
    await this.retryCleanupFor([...this.resources.keys()]);
  }

  public async retryCleanupFor(resourceIdentities: readonly string[]): Promise<void> {
    const identities = new Set(resourceIdentities);
    const candidates = [...this.resources.values()].filter(
      ({ canonical, pendingUsers, leases, state }) =>
        identities.has(canonical) &&
        state === 'cleanup-failed' &&
        pendingUsers.size === 0 &&
        leases.size === 0,
    );
    const settlements = await Promise.allSettled(
      candidates.map(async (entry) => this.collect(entry)),
    );
    const failure = settlements.find(
      (settlement): settlement is PromiseRejectedResult => settlement.status === 'rejected',
    );
    if (failure) throw assetInternalFailure();
  }

  private createResource(use: SessionUse): SharedResource {
    const backendKey = [
      'patch-map-asset',
      stableHash(this.backendNamespace),
      stableHash(use.canonical),
      use.canonical.length,
      nextBackendResourceSequence(this.backend),
    ].join(':');
    const request = Object.freeze({
      key: backendKey,
      descriptor: use.descriptor,
      cacheIdentity: use.cacheIdentity,
      packageOwned: use.packageOwned,
    });
    const cached = this.backend.get(request);
    const ownership = cached === undefined ? 'patch-map' : 'external';
    const resource = cached === undefined
      ? this.backend.load(request)
      : Promise.resolve(cached);
    const entry: SharedResource = {
      canonical: use.canonical,
      cacheIdentity: use.cacheIdentity,
      backendKey,
      request,
      descriptor: use.descriptor,
      ownership,
      resource,
      pendingUsers: new Set(),
      leases: new Set(),
      state: 'pending',
      failed: false,
    };
    resource.then(
      () => {
        if (entry.state === 'pending') entry.state = 'resolved';
      },
      () => {
        entry.failed = true;
      },
    );
    this.resources.set(entry.canonical, entry);
    return entry;
  }

  private async collect(entry: SharedResource): Promise<void> {
    if (entry.pendingUsers.size > 0 || entry.leases.size > 0) return;
    if (this.resources.get(entry.canonical) !== entry) return;
    if (entry.failed) {
      this.resources.delete(entry.canonical);
      return;
    }
    if (entry.state === 'pending') {
      this.collectAfterSettlement(entry);
      return;
    }
    if (entry.ownership === 'external') {
      this.resources.delete(entry.canonical);
      return;
    }
    if (entry.state === 'releasing') {
      await entry.releasing;
      return;
    }
    entry.state = 'releasing';
    entry.releasing = Promise.resolve().then(async () => this.backend.unload(entry.backendKey));
    try {
      await entry.releasing;
      if (this.resources.get(entry.canonical) === entry) {
        this.resources.delete(entry.canonical);
      }
    } catch {
      entry.state = 'cleanup-failed';
      delete entry.releasing;
      throw assetInternalFailure();
    }
  }

  private collectAfterSettlement(entry: SharedResource): void {
    if (entry.settlementCollection) return;
    entry.settlementCollection = entry.resource.then(
      async () => this.collect(entry),
      async () => this.collect(entry),
    ).catch(() => undefined);
  }

  private describeResource(
    entry: SharedResource,
    resource: unknown,
  ): PatchMapAssetResourceDescription {
    const description = this.backend.describe?.(entry.request, resource);
    if (description === undefined) {
      return Object.freeze({ normalizedResourceIdentity: entry.cacheIdentity });
    }
    return Object.freeze({
      normalizedResourceIdentity: nonempty(
        description.normalizedResourceIdentity,
        'normalizedResourceIdentity',
      ),
      ...(description.cacheIdentity === undefined
        ? {}
        : {
            describedCacheIdentity: nonempty(
              description.cacheIdentity,
              'described cacheIdentity',
            ),
          }),
    });
  }
}

export class PatchMapAssetSession {
  private readonly uses = new Map<string, SessionUse>();
  private readonly cleanupCandidates = new Set<string>();
  private destroyedValue = false;

  public constructor(
    private readonly runtime: PatchMapAssetRuntime,
    public readonly instanceId: string,
    private readonly policy: PatchMapAssetPolicy,
  ) {}

  public registerAssets(
    registrations: readonly PatchMapAssetRegistration[] = PATCH_MAP_BUILTIN_ASSETS,
  ): PatchMapAssetRegistrationResult {
    this.assertAlive();
    return this.runtime.registerAssets(registrations);
  }

  public acquire(alias: string): Promise<PatchMapAssetAcquisition> {
    this.assertAlive();
    return observeRejection(this.acquireEntry(this.runtime.resolve(alias)));
  }

  public acquireSource(source: PatchMapAssetSource): Promise<PatchMapAssetAcquisition> {
    this.assertAlive();
    return observeRejection(this.acquireEntry(this.runtime.sourceEntry(source)));
  }

  public probe(): PatchMapAssetSessionProbe {
    let pendingCount = 0;
    let leaseCount = 0;
    for (const use of this.uses.values()) {
      if (use.status === 'validating' || use.status === 'pending') pendingCount += 1;
      if (use.status === 'leased') leaseCount += 1;
    }
    return Object.freeze({
      instanceId: this.instanceId,
      destroyed: this.destroyedValue,
      pendingCount,
      leaseCount,
      acquisitionCount: pendingCount + leaseCount,
      cleanupPendingCount: this.cleanupCandidates.size,
    });
  }

  public runtimeProbe(alias?: string): PatchMapAssetRuntimeProbe {
    return this.runtime.probe(alias);
  }

  public async destroy(): Promise<void> {
    if (this.destroyedValue) return this.retryCleanup();
    this.destroyedValue = true;
    const uses = [...this.uses.values()];
    await Promise.allSettled(uses.map(async (use) => {
      use.handleCount = 0;
      try {
        await this.runtime.release(use);
      } catch (error) {
        this.cleanupCandidates.add(use.canonical);
        throw error;
      }
    }));
    this.uses.clear();
    await this.retryCleanup();
  }

  public async retryCleanup(): Promise<void> {
    const candidates = [...this.cleanupCandidates];
    if (candidates.length === 0) return;
    await this.runtime.retryCleanupFor(candidates);
    for (const candidate of candidates) this.cleanupCandidates.delete(candidate);
  }

  private async acquireEntry(entry: AssetCatalogEntry): Promise<PatchMapAssetAcquisition> {
    let use = this.uses.get(entry.resourceIdentity);
    if (!use || use.status === 'released') {
      let resolveUse!: (value: unknown) => void;
      let rejectUse!: (reason?: unknown) => void;
      const promise = new Promise<unknown>((resolve, reject) => {
        resolveUse = resolve;
        rejectUse = reject;
      });
      use = {
        canonical: entry.resourceIdentity,
        cacheIdentity: entry.cacheIdentity,
        descriptor: entry.descriptor,
        packageOwned: entry.packageOwned,
        promise,
        status: 'validating',
        handleCount: 0,
      };
      this.uses.set(entry.resourceIdentity, use);
      void this.beginAcquire(use).then(resolveUse, rejectUse);
    }
    use.handleCount += 1;
    const resource = await use.promise;
    if (this.destroyedValue || use.status !== 'leased') {
      throw new PatchMapAssetError('CANCELLED', 'CANCELLED', false);
    }
    const description = use.description;
    if (description === undefined) throw assetInternalFailure();
    this.cleanupCandidates.delete(use.canonical);
    const acquiredUse = use;
    let released = false;
    return Object.freeze({
      cacheIdentity: acquiredUse.cacheIdentity,
      normalizedResourceIdentity: description.normalizedResourceIdentity,
      ...(description.describedCacheIdentity === undefined
        ? {}
        : { describedCacheIdentity: description.describedCacheIdentity }),
      resource,
      release: async (): Promise<void> => {
        if (released) return;
        released = true;
        if (acquiredUse.status === 'released') return;
        acquiredUse.handleCount -= 1;
        if (acquiredUse.handleCount > 0) return;
        this.uses.delete(acquiredUse.canonical);
        try {
          await this.runtime.release(acquiredUse);
        } catch (error) {
          this.cleanupCandidates.add(acquiredUse.canonical);
          throw error;
        }
      },
    });
  }

  private async beginAcquire(use: SessionUse): Promise<unknown> {
    try {
      await this.policy(Object.freeze({
        instanceId: this.instanceId,
        descriptor: use.descriptor,
        cacheIdentity: use.cacheIdentity,
        packageOwned: use.packageOwned,
      }));
      if (this.destroyedValue || use.status === 'released') {
        use.status = 'released';
        throw new PatchMapAssetError('CANCELLED', 'CANCELLED', false);
      }
      return await this.runtime.attach(use);
    } catch (error) {
      this.uses.delete(use.canonical);
      if (use.status === 'validating') use.status = 'released';
      throw error;
    }
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new PatchMapAssetError('CANCELLED', 'CANCELLED', false);
  }
}

export const PATCH_MAP_ASSET_RUNTIME = new PatchMapAssetRuntime();

let leafSessionSequence = 0;

export function createPatchMapLeafAssetSession(
  policy?: PatchMapAssetPolicy,
): PatchMapAssetSession {
  return PATCH_MAP_ASSET_RUNTIME.createSession({
    instanceId: `patch-map-leaf-${++leafSessionSequence}`,
    ...(policy ? { policy } : {}),
  });
}

function resolveBackendNamespace(backend: PatchMapAssetBackend): string {
  const declared = backend.keyNamespace?.trim();
  if (declared) return declared;
  const existing = BACKEND_NAMESPACES.get(backend);
  if (existing) return existing;
  const namespace = `backend-${++backendNamespaceSequence}`;
  BACKEND_NAMESPACES.set(backend, namespace);
  return namespace;
}

function nextBackendResourceSequence(backend: PatchMapAssetBackend): number {
  const sequence = (BACKEND_RESOURCE_SEQUENCES.get(backend) ?? 0) + 1;
  BACKEND_RESOURCE_SEQUENCES.set(backend, sequence);
  return sequence;
}

function resourceProbe(
  cacheIdentity: string,
  resource: SharedResource | undefined,
): PatchMapAssetResourceProbe {
  return Object.freeze({
    cacheIdentity,
    resourceCount: resource ? 1 : 0,
    pendingCount: resource?.pendingUsers.size ?? 0,
    leaseCount: resource?.leases.size ?? 0,
    ownership: resource?.ownership ?? null,
    state: resource?.state ?? 'absent',
    cleanupPending: resource?.state === 'cleanup-failed',
    cleanupRetryOwner: resource?.state === 'cleanup-failed' ? 'runtime' : null,
  });
}

function assetInternalFailure(): PatchMapAssetError {
  return new PatchMapAssetError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', false);
}

function sum(
  resources: ReadonlyMap<string, SharedResource>,
  select: (resource: SharedResource) => number,
): number {
  let result = 0;
  for (const resource of resources.values()) result += select(resource);
  return result;
}

function observeRejection<T>(promise: Promise<T>): Promise<T> {
  // Asset work is intentionally abandonable during source replacement and
  // engine teardown. Observing the original promise prevents a routine late
  // cancellation/failure from becoming a process-level unhandled rejection;
  // returning that same promise preserves its exact rejection for consumers.
  void promise.catch(() => undefined);
  return promise;
}
