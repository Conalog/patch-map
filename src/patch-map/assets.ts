import { Assets } from 'pixi.js';

import type { PatchMapAssetDescriptor, PatchMapAssetSource } from './semantic/dataset';
import { stableHash64Hex as stableHash } from './shared/stable-hash';

export type PatchMapAssetDiagnosticCategory =
  | 'INVALID_INPUT'
  | 'CONFLICT'
  | 'ASSET_FAILURE'
  | 'CANCELLED'
  | 'INTERNAL_FAILURE';

export type PatchMapAssetDiagnosticCode =
  | 'INVALID_VALUE'
  | 'CONFLICT'
  | 'ASSET_POLICY_REJECTED'
  | 'ASSET_LOAD_FAILED'
  | 'ASSET_DECODE_FAILED'
  | 'ASSET_UPLOAD_FAILED'
  | 'CANCELLED'
  | 'INTERNAL_FAILURE';

export class PatchMapAssetError extends Error {
  public constructor(
    public readonly code: PatchMapAssetDiagnosticCode,
    public readonly category: PatchMapAssetDiagnosticCategory,
    public readonly retryable: boolean,
  ) {
    super(`${code}: asset`);
    this.name = 'PatchMapAssetError';
  }
}

export interface PatchMapAssetRegistration {
  readonly alias: string;
  readonly descriptor: PatchMapAssetSource;
  readonly kind?: 'image' | 'font';
  readonly fontWeight?: number;
}

export interface PatchMapNormalizedAssetRegistration {
  readonly alias: string;
  readonly descriptor: PatchMapAssetDescriptor;
  readonly kind: 'image' | 'font';
  readonly fontWeight?: number;
}

export interface PatchMapAssetPolicyContext {
  readonly instanceId: string;
  readonly descriptor: PatchMapAssetDescriptor;
  readonly cacheIdentity: string;
  readonly packageOwned: boolean;
}

export type PatchMapAssetPolicy = (
  context: PatchMapAssetPolicyContext,
) => void | Promise<void>;

export interface PatchMapAssetBackendRequest {
  readonly key: string;
  readonly descriptor: PatchMapAssetDescriptor;
  readonly cacheIdentity: string;
  readonly packageOwned: boolean;
}

export interface PatchMapAssetBackend {
  readonly keyNamespace?: string;
  get(request: PatchMapAssetBackendRequest): unknown;
  load(request: PatchMapAssetBackendRequest): Promise<unknown>;
  describe?(
    request: PatchMapAssetBackendRequest,
    resource: unknown,
  ): Readonly<{
    /** Stable decoded-resource identity, independent from physical Pixi keys. */
    readonly normalizedResourceIdentity: string;
    /** Optional sanitized semantic identity reported by the decoder/fixture. */
    readonly cacheIdentity?: string;
  }>;
  unload(key: string): Promise<void>;
}

export interface PatchMapPixiAssetBackendOptions {
  readonly fetchAsset?: (src: string) => Promise<Blob>;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  /**
   * Optional defense-in-depth profile. The owning session must still install
   * `createPatchMapAssetIngestionPolicy(profile)` so denied URLs cannot reach
   * the backend lookup/fetch boundary.
   */
  readonly ingestionPolicy?: PatchMapAssetIngestionPolicyProfile;
  readonly inspectDecodedSize?: (
    blob: Blob,
  ) => Promise<Readonly<{ readonly width: number; readonly height: number }>>;
}

export interface PatchMapAssetIngestionPolicyProfile {
  readonly protocols: readonly string[];
  readonly origins: readonly string[];
  readonly redirects: 'revalidate';
  readonly credentials: 'omit';
  readonly mediaTypes: readonly string[];
  readonly maxEncodedBytes: number;
  readonly maxDecodedWidth: number;
  readonly maxDecodedHeight: number;
}

export interface PatchMapAssetResponseMetadata {
  readonly requestUrl: string;
  readonly finalUrl: string;
  readonly redirectUrls?: readonly string[];
  readonly mediaType: string;
  readonly encodedBytes: number;
  readonly decodedWidth?: number;
  readonly decodedHeight?: number;
  readonly svgText?: string;
}

export interface PatchMapAssetIngestionDecision {
  readonly accepted: boolean;
  readonly code: 'ASSET_POLICY_REJECTED' | null;
  readonly stage:
    | 'accepted'
    | 'descriptor'
    | 'redirect'
    | 'media-type'
    | 'encoded-bytes'
    | 'decoded-size'
    | 'svg-content';
}

export interface PatchMapAssetAcquisition {
  /** Internal coordinator identity used for sharing and ownership. */
  readonly cacheIdentity: string;
  readonly normalizedResourceIdentity: string;
  /** Optional backend-described semantic identity; never used as a coordinator key. */
  readonly describedCacheIdentity?: string;
  readonly resource: unknown;
  release(): Promise<void>;
}

export interface PatchMapAssetRegistrationResult {
  readonly registeredAliases: readonly string[];
  readonly duplicateAliases: readonly string[];
}

export interface PatchMapAssetResourceProbe {
  readonly cacheIdentity: string;
  readonly resourceCount: number;
  readonly pendingCount: number;
  readonly leaseCount: number;
  readonly ownership: 'patch-map' | 'external' | null;
  readonly state: 'absent' | 'pending' | 'resolved' | 'releasing' | 'cleanup-failed';
  readonly cleanupPending: boolean;
  readonly cleanupRetryOwner: 'runtime' | null;
}

export interface PatchMapAssetRuntimeProbe {
  readonly builtins: Readonly<{ readonly aliases: readonly string[] }>;
  readonly fonts: Readonly<{ readonly weights: readonly number[] }>;
  readonly aliasCount: number;
  readonly resourceCount: number;
  readonly pendingCount: number;
  readonly leaseCount: number;
  readonly cleanupPendingCount: number;
  readonly resource: PatchMapAssetResourceProbe | null;
}

export interface PatchMapAssetSessionProbe {
  readonly instanceId: string;
  readonly destroyed: boolean;
  readonly pendingCount: number;
  readonly leaseCount: number;
  readonly acquisitionCount: number;
  readonly cleanupPendingCount: number;
}

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

const BUILTIN_IMAGE_ALIASES = Object.freeze([
  'object',
  'inverter',
  'combiner',
  'device',
  'edge',
  'loading',
  'warning',
  'wifi',
] as const);

const BUILTIN_FONT_WEIGHTS = Object.freeze([300, 400, 500, 600, 700] as const);

const BUILTIN_FIRA_CODE_URL = new URL(
  '../../docs/reference/core-v2-functional-contract/evidence/fonts/FiraCode-Regular.woff2',
  import.meta.url,
).href;

export const PATCH_MAP_BUILTIN_ASSETS: readonly PatchMapAssetRegistration[] = Object.freeze([
  ...BUILTIN_IMAGE_ALIASES.map((alias) => Object.freeze({
    alias,
    descriptor: `patch-map-builtin://images/${alias}.svg`,
    kind: 'image' as const,
  })),
  ...BUILTIN_FONT_WEIGHTS.map((fontWeight) => Object.freeze({
    alias: `FiraCode-${fontWeight}`,
    descriptor: Object.freeze({
      src: 'patch-map-builtin://fonts/FiraCode.woff2',
      parser: 'web-font',
      data: Object.freeze({
        family: 'Fira Code',
        weights: Object.freeze(BUILTIN_FONT_WEIGHTS.map(String)),
      }),
    }),
    kind: 'font' as const,
    fontWeight,
  })),
]);

const PACKAGE_BUILTIN_SIGNATURES = new Map(PATCH_MAP_BUILTIN_ASSETS.map((registration) => {
  const normalized = normalizeRegistration(registration);
  const canonical = canonicalDescriptor(normalized.descriptor);
  return [normalized.alias, registrationSignature(normalized, canonical)] as const;
}));

const RESOURCE_COORDINATORS = new WeakMap<PatchMapAssetBackend, Map<string, SharedResource>>();
const BACKEND_NAMESPACES = new WeakMap<PatchMapAssetBackend, string>();
const BACKEND_RESOURCE_SEQUENCES = new WeakMap<PatchMapAssetBackend, number>();
let backendNamespaceSequence = 0;
let pixiBackendSequence = 0;
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

/**
 * Create the per-instance, pre-fetch half of the asset security boundary.
 * Package-owned builtins remain eligible; every host descriptor is checked
 * before the shared coordinator performs cache lookup or backend work.
 */
export function createPatchMapAssetIngestionPolicy(
  profile: PatchMapAssetIngestionPolicyProfile,
): PatchMapAssetPolicy {
  const normalized = normalizeIngestionProfile(profile);
  return (context): void => {
    if (context.packageOwned) return;
    assertAssetUrlAllowed(normalized, context.descriptor.src, 'descriptor');
  };
}

/** Evaluate decoded/fetched metadata before a cache lease or GPU upload. */
export function evaluatePatchMapAssetResponsePolicy(
  profile: PatchMapAssetIngestionPolicyProfile,
  metadata: PatchMapAssetResponseMetadata,
): PatchMapAssetIngestionDecision {
  const normalized = normalizeIngestionProfile(profile);
  try {
    const requestUrl = nonempty(metadata.requestUrl, 'asset response requestUrl');
    assertAssetUrlAllowed(normalized, requestUrl, 'descriptor');
    const redirects = metadata.redirectUrls === undefined
      ? []
      : [...metadata.redirectUrls];
    for (const redirectUrl of redirects) {
      assertAssetUrlAllowed(
        normalized,
        nonempty(redirectUrl, 'asset redirectUrl'),
        'redirect',
      );
    }
    assertAssetUrlAllowed(
      normalized,
      nonempty(metadata.finalUrl, 'asset response finalUrl'),
      redirects.length === 0 ? 'descriptor' : 'redirect',
    );
    const mediaType = normalizeMediaType(metadata.mediaType);
    if (!normalized.mediaTypes.includes(mediaType)) {
      return rejectedAssetDecision('media-type');
    }
    if (
      !Number.isSafeInteger(metadata.encodedBytes) ||
      metadata.encodedBytes < 0 ||
      metadata.encodedBytes > normalized.maxEncodedBytes
    ) {
      return rejectedAssetDecision('encoded-bytes');
    }
    if (
      metadata.decodedWidth !== undefined ||
      metadata.decodedHeight !== undefined
    ) {
      if (
        !positiveFinite(metadata.decodedWidth) ||
        !positiveFinite(metadata.decodedHeight) ||
        metadata.decodedWidth > normalized.maxDecodedWidth ||
        metadata.decodedHeight > normalized.maxDecodedHeight
      ) {
        return rejectedAssetDecision('decoded-size');
      }
    }
    if (
      mediaType === 'image/svg+xml' &&
      metadata.svgText !== undefined &&
      unsafeSvg(metadata.svgText)
    ) {
      return rejectedAssetDecision('svg-content');
    }
    return Object.freeze({
      accepted: true,
      code: null,
      stage: 'accepted',
    });
  } catch (error) {
    if (
      error instanceof PatchMapAssetError &&
      error.code === 'ASSET_POLICY_REJECTED'
    ) {
      const stage = error.message.includes('redirect')
        ? 'redirect'
        : 'descriptor';
      return rejectedAssetDecision(stage);
    }
    throw error;
  }
}

export function assertPatchMapAssetResponseAllowed(
  profile: PatchMapAssetIngestionPolicyProfile,
  metadata: PatchMapAssetResponseMetadata,
): void {
  const decision = evaluatePatchMapAssetResponsePolicy(profile, metadata);
  if (!decision.accepted) {
    throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
  }
}

export function createPatchMapPixiAssetBackend(
  options: PatchMapPixiAssetBackendOptions = {},
): PatchMapAssetBackend {
  const keyNamespace = `pixi-assets-${++pixiBackendSequence}`;
  const fetchAsset = options.fetchAsset ?? defaultFetchAsset;
  const createObjectURL = options.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectURL = options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const ownedObjectUrls = new Map<string, string>();
  return Object.freeze({
    keyNamespace,
    get(request: PatchMapAssetBackendRequest): unknown {
      const externalKey = externalBorrowKey(request);
      return externalKey === null ? undefined : Assets.get<unknown>(externalKey);
    },
    async load(request: PatchMapAssetBackendRequest): Promise<unknown> {
      if (options.ingestionPolicy && !request.packageOwned) {
        await createPatchMapAssetIngestionPolicy(options.ingestionPolicy)(Object.freeze({
          instanceId: 'patch-map-pixi-backend',
          descriptor: request.descriptor,
          cacheIdentity: request.cacheIdentity,
          packageOwned: false,
        }));
      }
      const logicalDescriptor = pixiDescriptor(request);
      let objectUrl: string | null = null;
      try {
        const descriptor = await isolatedPixiDescriptor(
          logicalDescriptor,
          fetchAsset,
          createObjectURL,
          request.packageOwned ? undefined : options.ingestionPolicy,
          options.inspectDecodedSize,
        );
        if (descriptor.src !== logicalDescriptor.src) {
          objectUrl = descriptor.src;
          ownedObjectUrls.set(request.key, objectUrl);
        }
        return await Assets.load({
          ...descriptor,
          alias: request.key,
        });
      } catch (error) {
        if (objectUrl !== null) {
          ownedObjectUrls.delete(request.key);
          revokeObjectURL(objectUrl);
        }
        throw error;
      }
    },
    async unload(key: string): Promise<void> {
      const objectUrl = ownedObjectUrls.get(key);
      await Assets.unload(key);
      if (objectUrl !== undefined) {
        ownedObjectUrls.delete(key);
        revokeObjectURL(objectUrl);
      }
    },
  });
}

function externalBorrowKey(request: PatchMapAssetBackendRequest): string | null {
  if (request.packageOwned || Object.keys(request.descriptor).length !== 1) return null;
  return request.descriptor.src;
}

function pixiDescriptor(request: PatchMapAssetBackendRequest): PatchMapAssetDescriptor {
  if (!request.packageOwned) return request.descriptor;

  const imageMatch = /^patch-map-builtin:\/\/images\/([a-z]+)\.svg$/.exec(
    request.descriptor.src,
  );
  const imageAlias = imageMatch?.[1];
  if (imageAlias && BUILTIN_IMAGE_ALIASES.some((alias) => alias === imageAlias)) {
    return Object.freeze({
      src: builtinImageDataUri(imageAlias),
      parser: 'svg',
    });
  }

  if (request.descriptor.src === 'patch-map-builtin://fonts/FiraCode.woff2') {
    return deepFreeze({
      src: BUILTIN_FIRA_CODE_URL,
      parser: 'web-font',
      data: {
        family: 'Fira Code',
        weights: BUILTIN_FONT_WEIGHTS.map(String),
      },
    });
  }

  throw new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', false);
}

async function isolatedPixiDescriptor(
  descriptor: PatchMapAssetDescriptor,
  fetchAsset: (src: string) => Promise<Blob>,
  createObjectURL: (blob: Blob) => string,
  ingestionPolicy?: PatchMapAssetIngestionPolicyProfile,
  inspectDecodedSize?: (
    blob: Blob,
  ) => Promise<Readonly<{ readonly width: number; readonly height: number }>>,
): Promise<PatchMapAssetDescriptor> {
  const blob = await fetchAsset(descriptor.src);
  if (ingestionPolicy) {
    const decoded = inspectDecodedSize ? await inspectDecodedSize(blob) : undefined;
    assertPatchMapAssetResponseAllowed(ingestionPolicy, {
      requestUrl: descriptor.src,
      finalUrl: descriptor.src,
      mediaType: blob.type,
      encodedBytes: blob.size,
      ...(decoded === undefined
        ? {}
        : {
            decodedWidth: decoded.width,
            decodedHeight: decoded.height,
          }),
      ...(normalizeMediaType(blob.type) === 'image/svg+xml'
        ? { svgText: await blob.text() }
        : {}),
    });
  }
  const objectUrl = createObjectURL(blob);
  const parser = descriptor.parser ?? inferAssetParser(descriptor, blob.type);
  return deepFreeze({
    ...descriptor,
    src: objectUrl,
    ...(parser === null ? {} : { parser }),
  });
}

async function defaultFetchAsset(src: string): Promise<Blob> {
  const response = await fetch(src, {
    credentials: 'omit',
    redirect: 'error',
  });
  if (!response.ok) throw new PatchMapAssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
  return response.blob();
}

function inferAssetParser(
  descriptor: PatchMapAssetDescriptor,
  mimeType: string,
): string | null {
  const format = descriptor.format?.toLowerCase();
  const sourcePath = descriptor.src.split(/[?#]/u, 1)[0]?.toLowerCase() ?? '';
  const mediaType = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (format === 'svg' || sourcePath.endsWith('.svg') || mediaType === 'image/svg+xml') {
    return 'svg';
  }
  if (
    ['png', 'jpg', 'jpeg', 'webp', 'avif'].includes(format ?? '') ||
    /\.(?:png|jpe?g|webp|avif)$/u.test(sourcePath) ||
    mediaType.startsWith('image/')
  ) {
    return 'texture';
  }
  if (
    ['woff', 'woff2', 'ttf', 'otf'].includes(format ?? '') ||
    /\.(?:woff2?|ttf|otf)$/u.test(sourcePath) ||
    mediaType.startsWith('font/')
  ) {
    return 'web-font';
  }
  return null;
}

function builtinImageDataUri(alias: string): string {
  const color = stableHash(`builtin-image:${alias}`).slice(0, 6);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    `<rect x="2" y="2" width="28" height="28" rx="6" fill="#${color}"/>`,
    '<path d="M9 16h14M16 9v14" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeRegistration(
  registration: PatchMapAssetRegistration,
): PatchMapNormalizedAssetRegistration {
  if (!isPlainRecord(registration)) invalidAsset('asset registration must be an object');
  const alias = nonempty(registration.alias, 'alias');
  const descriptor = normalizeDescriptor(registration.descriptor);
  const kind = registration.kind ?? 'image';
  if (kind !== 'image' && kind !== 'font') invalidAsset('asset kind must be image or font');
  if (
    registration.fontWeight !== undefined &&
    (!Number.isInteger(registration.fontWeight) || registration.fontWeight <= 0)
  ) {
    invalidAsset('fontWeight must be a positive integer');
  }
  return Object.freeze({
    alias,
    descriptor,
    kind,
    ...(registration.fontWeight === undefined ? {} : { fontWeight: registration.fontWeight }),
  });
}

export function normalizePatchMapAssetDescriptor(source: PatchMapAssetSource): PatchMapAssetDescriptor {
  return normalizeDescriptor(source);
}

function normalizeDescriptor(source: PatchMapAssetSource): PatchMapAssetDescriptor {
  if (typeof source === 'string') return Object.freeze({ src: nonempty(source, 'asset src') });
  if (!isPlainRecord(source)) invalidAsset('asset descriptor must be a plain object');
  const keys = Object.keys(source);
  const allowed = new Set(['src', 'data', 'format', 'parser', 'loadParser']);
  if (keys.some((key) => !allowed.has(key))) invalidAsset('asset descriptor has an unknown field');
  const descriptor: PatchMapAssetDescriptor = {
    src: nonempty(source.src, 'asset src'),
    ...(source.data === undefined ? {} : { data: cloneJsonRecord(source.data, 'asset data') }),
    ...(source.format === undefined ? {} : { format: nonempty(source.format, 'asset format') }),
    ...(source.parser === undefined ? {} : { parser: nonempty(source.parser, 'asset parser') }),
    ...(source.loadParser === undefined
      ? {}
      : { loadParser: nonempty(source.loadParser, 'asset loadParser') }),
  };
  return deepFreeze(descriptor);
}

function canonicalDescriptor(descriptor: PatchMapAssetDescriptor): string {
  return stableSerialize(descriptor);
}

function registrationSignature(
  registration: PatchMapNormalizedAssetRegistration,
  canonical: string,
): string {
  return `${canonical}|${registration.kind}|${registration.fontWeight ?? ''}`;
}

function resourceIdentityFields(canonical: string, packageOwned: boolean): Readonly<{
  resourceIdentity: string;
  cacheIdentity: string;
  packageOwned: boolean;
}> {
  const resourceIdentity = `${packageOwned ? 'package' : 'host'}:${canonical}`;
  return Object.freeze({
    resourceIdentity,
    cacheIdentity: `descriptor:${stableHash(resourceIdentity)}`,
    packageOwned,
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

function isPackageBuiltin(
  registration: PatchMapNormalizedAssetRegistration,
  canonical: string,
): boolean {
  return PACKAGE_BUILTIN_SIGNATURES.get(registration.alias) ===
    registrationSignature(registration, canonical);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidAsset('asset descriptor numbers must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return invalidAsset('asset descriptor must contain JSON values');
}

function cloneJsonRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) invalidAsset(`${label} must be a plain object`);
  return deepFreeze(cloneJson(value, new WeakSet<object>()) as Record<string, unknown>);
}

function cloneJson(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidAsset('asset descriptor numbers must be finite');
    return value;
  }
  if (typeof value !== 'object') invalidAsset('asset descriptor must contain JSON values');
  if (ancestors.has(value)) invalidAsset('asset descriptor cannot be cyclic');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((entry) => cloneJson(entry, ancestors)));
    if (!isPlainRecord(value)) invalidAsset('asset descriptor objects must be plain');
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) result[key] = cloneJson(value[key], ancestors);
    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
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

interface NormalizedIngestionProfile {
  readonly protocols: readonly string[];
  readonly origins: readonly string[];
  readonly mediaTypes: readonly string[];
  readonly maxEncodedBytes: number;
  readonly maxDecodedWidth: number;
  readonly maxDecodedHeight: number;
}

function normalizeIngestionProfile(
  profile: PatchMapAssetIngestionPolicyProfile,
): NormalizedIngestionProfile {
  if (!isPlainRecord(profile)) invalidAsset('asset ingestion policy must be an object');
  if (profile.redirects !== 'revalidate') {
    invalidAsset('asset redirects policy must be revalidate');
  }
  if (profile.credentials !== 'omit') {
    invalidAsset('asset credentials policy must be omit');
  }
  const protocols = uniquePolicyStrings(profile.protocols, 'asset protocols')
    .map((protocol) => protocol.replace(/:$/u, '').toLowerCase());
  const origins = uniquePolicyStrings(profile.origins, 'asset origins').map((origin) => {
    try {
      const parsed = new URL(origin);
      if (parsed.origin === 'null') invalidAsset('asset origin must be hierarchical');
      return parsed.origin.toLowerCase();
    } catch (error) {
      if (error instanceof PatchMapAssetError) throw error;
      return invalidAsset('asset origin must be an absolute URL');
    }
  });
  const mediaTypes = uniquePolicyStrings(profile.mediaTypes, 'asset mediaTypes')
    .map(normalizeMediaType);
  return Object.freeze({
    protocols: Object.freeze(protocols),
    origins: Object.freeze(origins),
    mediaTypes: Object.freeze(mediaTypes),
    maxEncodedBytes: positiveSafeInteger(profile.maxEncodedBytes, 'asset maxEncodedBytes'),
    maxDecodedWidth: positiveSafeInteger(profile.maxDecodedWidth, 'asset maxDecodedWidth'),
    maxDecodedHeight: positiveSafeInteger(profile.maxDecodedHeight, 'asset maxDecodedHeight'),
  });
}

function assertAssetUrlAllowed(
  profile: NormalizedIngestionProfile,
  source: string,
  stage: 'descriptor' | 'redirect',
): void {
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw policyRejected(stage);
  }
  const protocol = parsed.protocol.replace(/:$/u, '').toLowerCase();
  if (
    !profile.protocols.includes(protocol) ||
    parsed.origin === 'null' ||
    !profile.origins.includes(parsed.origin.toLowerCase()) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw policyRejected(stage);
  }
}

function rejectedAssetDecision(
  stage: Exclude<PatchMapAssetIngestionDecision['stage'], 'accepted'>,
): PatchMapAssetIngestionDecision {
  return Object.freeze({
    accepted: false,
    code: 'ASSET_POLICY_REJECTED',
    stage,
  });
}

function policyRejected(stage: 'descriptor' | 'redirect'): PatchMapAssetError {
  const error = new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
  error.message = `ASSET_POLICY_REJECTED: ${stage}`;
  return error;
}

function uniquePolicyStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    invalidAsset(`${label} must be a non-empty array`);
  }
  const values = value.map((entry, index) => nonempty(entry, `${label}[${index}]`));
  if (new Set(values).size !== values.length) invalidAsset(`${label} must be unique`);
  return values;
}

function normalizeMediaType(value: unknown): string {
  const mediaType = nonempty(value, 'asset media type')
    .split(';', 1)[0]!
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(mediaType)) {
    invalidAsset('asset media type is invalid');
  }
  return mediaType;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    invalidAsset(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function unsafeSvg(value: string): boolean {
  if (typeof value !== 'string') return true;
  return /<\s*(?:script|foreignObject)\b/iu.test(value) ||
    /\bon[a-z]+\s*=/iu.test(value) ||
    /\b(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/iu.test(value) ||
    /\burl\(\s*["']?\s*(?:https?:|\/\/)/iu.test(value);
}

function allowPackageBuiltinsOnly(context: PatchMapAssetPolicyContext): void {
  if (!context.packageOwned) {
    throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', true);
  }
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalidAsset(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function invalidAsset(message: string): never {
  const error = new PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  error.message = `INVALID_VALUE: ${message}`;
  throw error;
}

function assetInternalFailure(): PatchMapAssetError {
  return new PatchMapAssetError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', false);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
