import { Assets } from 'pixi.js';

import type { CoreV2AssetDescriptor, CoreV2AssetSource } from './semantic/dataset';

export type CoreV2AssetDiagnosticCategory =
  | 'INVALID_INPUT'
  | 'CONFLICT'
  | 'ASSET_FAILURE'
  | 'CANCELLED'
  | 'INTERNAL_FAILURE';

export type CoreV2AssetDiagnosticCode =
  | 'INVALID_VALUE'
  | 'CONFLICT'
  | 'ASSET_POLICY_REJECTED'
  | 'ASSET_LOAD_FAILED'
  | 'ASSET_DECODE_FAILED'
  | 'ASSET_UPLOAD_FAILED'
  | 'CANCELLED'
  | 'INTERNAL_FAILURE';

export class CoreV2AssetError extends Error {
  public constructor(
    public readonly code: CoreV2AssetDiagnosticCode,
    public readonly category: CoreV2AssetDiagnosticCategory,
    public readonly retryable: boolean,
  ) {
    super(`${code}: asset`);
    this.name = 'CoreV2AssetError';
  }
}

export interface CoreV2AssetRegistration {
  readonly alias: string;
  readonly descriptor: CoreV2AssetSource;
  readonly kind?: 'image' | 'font';
  readonly fontWeight?: number;
}

export interface CoreV2NormalizedAssetRegistration {
  readonly alias: string;
  readonly descriptor: CoreV2AssetDescriptor;
  readonly kind: 'image' | 'font';
  readonly fontWeight?: number;
}

export interface CoreV2AssetPolicyContext {
  readonly instanceId: string;
  readonly descriptor: CoreV2AssetDescriptor;
  readonly cacheIdentity: string;
  readonly packageOwned: boolean;
}

export type CoreV2AssetPolicy = (
  context: CoreV2AssetPolicyContext,
) => void | Promise<void>;

export interface CoreV2AssetBackendRequest {
  readonly key: string;
  readonly descriptor: CoreV2AssetDescriptor;
  readonly cacheIdentity: string;
  readonly packageOwned: boolean;
}

export interface CoreV2AssetBackend {
  readonly keyNamespace?: string;
  get(request: CoreV2AssetBackendRequest): unknown;
  load(request: CoreV2AssetBackendRequest): Promise<unknown>;
  unload(key: string): Promise<void>;
}

export interface CoreV2PixiAssetBackendOptions {
  readonly fetchAsset?: (src: string) => Promise<Blob>;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
}

export interface CoreV2AssetAcquisition {
  readonly cacheIdentity: string;
  readonly resource: unknown;
  release(): Promise<void>;
}

export interface CoreV2AssetRegistrationResult {
  readonly registeredAliases: readonly string[];
  readonly duplicateAliases: readonly string[];
}

export interface CoreV2AssetResourceProbe {
  readonly cacheIdentity: string;
  readonly resourceCount: number;
  readonly pendingCount: number;
  readonly leaseCount: number;
  readonly ownership: 'core-v2' | 'external' | null;
  readonly state: 'absent' | 'pending' | 'resolved' | 'releasing' | 'cleanup-failed';
  readonly cleanupPending: boolean;
  readonly cleanupRetryOwner: 'runtime' | null;
}

export interface CoreV2AssetRuntimeProbe {
  readonly builtins: Readonly<{ readonly aliases: readonly string[] }>;
  readonly fonts: Readonly<{ readonly weights: readonly number[] }>;
  readonly aliasCount: number;
  readonly resourceCount: number;
  readonly pendingCount: number;
  readonly leaseCount: number;
  readonly cleanupPendingCount: number;
  readonly resource: CoreV2AssetResourceProbe | null;
}

export interface CoreV2AssetSessionProbe {
  readonly instanceId: string;
  readonly destroyed: boolean;
  readonly pendingCount: number;
  readonly leaseCount: number;
  readonly acquisitionCount: number;
  readonly cleanupPendingCount: number;
}

interface AssetCatalogEntry extends CoreV2NormalizedAssetRegistration {
  readonly canonical: string;
  readonly resourceIdentity: string;
  readonly cacheIdentity: string;
  readonly packageOwned: boolean;
}

interface SharedResource {
  readonly canonical: string;
  readonly cacheIdentity: string;
  readonly backendKey: string;
  readonly descriptor: CoreV2AssetDescriptor;
  readonly ownership: 'core-v2' | 'external';
  readonly resource: Promise<unknown>;
  readonly pendingUsers: Set<SessionUse>;
  readonly leases: Set<SessionUse>;
  state: 'pending' | 'resolved' | 'releasing' | 'cleanup-failed';
  failed: boolean;
  releasing?: Promise<void>;
}

interface SessionUse {
  readonly canonical: string;
  readonly cacheIdentity: string;
  readonly descriptor: CoreV2AssetDescriptor;
  readonly packageOwned: boolean;
  readonly promise: Promise<unknown>;
  status: 'validating' | 'pending' | 'leased' | 'released';
  handleCount: number;
  entry?: SharedResource;
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

export const CORE_V2_BUILTIN_ASSETS: readonly CoreV2AssetRegistration[] = Object.freeze([
  ...BUILTIN_IMAGE_ALIASES.map((alias) => Object.freeze({
    alias,
    descriptor: `core-v2-builtin://images/${alias}.svg`,
    kind: 'image' as const,
  })),
  ...BUILTIN_FONT_WEIGHTS.map((fontWeight) => Object.freeze({
    alias: `FiraCode-${fontWeight}`,
    descriptor: Object.freeze({
      src: 'core-v2-builtin://fonts/FiraCode.woff2',
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

const PACKAGE_BUILTIN_SIGNATURES = new Map(CORE_V2_BUILTIN_ASSETS.map((registration) => {
  const normalized = normalizeRegistration(registration);
  const canonical = canonicalDescriptor(normalized.descriptor);
  return [normalized.alias, registrationSignature(normalized, canonical)] as const;
}));

const RESOURCE_COORDINATORS = new WeakMap<CoreV2AssetBackend, Map<string, SharedResource>>();
const BACKEND_NAMESPACES = new WeakMap<CoreV2AssetBackend, string>();
const BACKEND_RESOURCE_SEQUENCES = new WeakMap<CoreV2AssetBackend, number>();
let backendNamespaceSequence = 0;
let pixiBackendSequence = 0;
const DEFAULT_PIXI_ASSET_BACKEND = createCoreV2PixiAssetBackend();

export class CoreV2AssetRuntime {
  private readonly aliases = new Map<string, AssetCatalogEntry>();
  private readonly resources: Map<string, SharedResource>;
  private readonly backendNamespace: string;

  public constructor(
    private readonly backend: CoreV2AssetBackend = DEFAULT_PIXI_ASSET_BACKEND,
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
    policy?: CoreV2AssetPolicy;
  }>): CoreV2AssetSession {
    return new CoreV2AssetSession(
      this,
      nonempty(options.instanceId, 'instanceId'),
      options.policy ?? allowPackageBuiltinsOnly,
    );
  }

  public registerAlias(registration: CoreV2AssetRegistration): CoreV2AssetRegistrationResult {
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
        throw new CoreV2AssetError('CONFLICT', 'CONFLICT', false);
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
    registrations: readonly CoreV2AssetRegistration[],
  ): CoreV2AssetRegistrationResult {
    if (!Array.isArray(registrations)) invalidAsset('registrations must be an array');
    const normalized = registrations.map(normalizeRegistration);
    const seen = new Map<string, string>();
    for (const registration of normalized) {
      const canonical = canonicalDescriptor(registration.descriptor);
      const signature = registrationSignature(registration, canonical);
      const previous = seen.get(registration.alias);
      if (previous !== undefined && previous !== signature) {
        throw new CoreV2AssetError('CONFLICT', 'CONFLICT', false);
      }
      seen.set(registration.alias, signature);
      const existing = this.aliases.get(registration.alias);
      if (
        existing &&
        (existing.canonical !== canonical ||
          existing.kind !== registration.kind ||
          existing.fontWeight !== registration.fontWeight)
      ) {
        throw new CoreV2AssetError('CONFLICT', 'CONFLICT', false);
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

  public probe(alias?: string): CoreV2AssetRuntimeProbe {
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
    if (!entry) throw new CoreV2AssetError('INVALID_VALUE', 'INVALID_INPUT', false);
    return entry;
  }

  public sourceEntry(source: CoreV2AssetSource): AssetCatalogEntry {
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
        throw new CoreV2AssetError('CANCELLED', 'CANCELLED', false);
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
        throw new CoreV2AssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
      }
      use.entry = resource;
      use.status = 'pending';
      resource.pendingUsers.add(use);
      try {
        const value = await resource.resource;
        resource.pendingUsers.delete(use);
        if ((use.status as SessionUse['status']) === 'released') {
          await this.collect(resource);
          throw new CoreV2AssetError('CANCELLED', 'CANCELLED', false);
        }
        resource.leases.add(use);
        use.status = 'leased';
        return value;
      } catch (error) {
        resource.pendingUsers.delete(use);
        if ((use.status as SessionUse['status']) !== 'released') use.status = 'released';
        await this.collect(resource);
        if (error instanceof CoreV2AssetError) throw error;
        throw new CoreV2AssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
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
      'core-v2-asset',
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
    const ownership = cached === undefined ? 'core-v2' : 'external';
    const resource = cached === undefined
      ? this.backend.load(request)
      : Promise.resolve(cached);
    const entry: SharedResource = {
      canonical: use.canonical,
      cacheIdentity: use.cacheIdentity,
      backendKey,
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
    if (entry.state === 'pending') {
      await entry.resource.catch(() => undefined);
      if (entry.pendingUsers.size > 0 || entry.leases.size > 0) return;
    }
    if (entry.failed) {
      this.resources.delete(entry.canonical);
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
}

export class CoreV2AssetSession {
  private readonly uses = new Map<string, SessionUse>();
  private readonly cleanupCandidates = new Set<string>();
  private destroyedValue = false;

  public constructor(
    private readonly runtime: CoreV2AssetRuntime,
    public readonly instanceId: string,
    private readonly policy: CoreV2AssetPolicy,
  ) {}

  public registerAssets(
    registrations: readonly CoreV2AssetRegistration[] = CORE_V2_BUILTIN_ASSETS,
  ): CoreV2AssetRegistrationResult {
    this.assertAlive();
    return this.runtime.registerAssets(registrations);
  }

  public acquire(alias: string): Promise<CoreV2AssetAcquisition> {
    this.assertAlive();
    return this.acquireEntry(this.runtime.resolve(alias));
  }

  public acquireSource(source: CoreV2AssetSource): Promise<CoreV2AssetAcquisition> {
    this.assertAlive();
    return this.acquireEntry(this.runtime.sourceEntry(source));
  }

  public probe(): CoreV2AssetSessionProbe {
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

  public runtimeProbe(alias?: string): CoreV2AssetRuntimeProbe {
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
      await use.promise.catch(() => undefined);
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

  private async acquireEntry(entry: AssetCatalogEntry): Promise<CoreV2AssetAcquisition> {
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
      throw new CoreV2AssetError('CANCELLED', 'CANCELLED', false);
    }
    this.cleanupCandidates.delete(use.canonical);
    const acquiredUse = use;
    let released = false;
    return Object.freeze({
      cacheIdentity: acquiredUse.cacheIdentity,
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
        throw new CoreV2AssetError('CANCELLED', 'CANCELLED', false);
      }
      return await this.runtime.attach(use);
    } catch (error) {
      this.uses.delete(use.canonical);
      if (use.status === 'validating') use.status = 'released';
      throw error;
    }
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new CoreV2AssetError('CANCELLED', 'CANCELLED', false);
  }
}

export const CORE_V2_ASSET_RUNTIME = new CoreV2AssetRuntime();

let leafSessionSequence = 0;

export function createCoreV2LeafAssetSession(
  policy?: CoreV2AssetPolicy,
): CoreV2AssetSession {
  return CORE_V2_ASSET_RUNTIME.createSession({
    instanceId: `core-v2-leaf-${++leafSessionSequence}`,
    ...(policy ? { policy } : {}),
  });
}

export function createCoreV2PixiAssetBackend(
  options: CoreV2PixiAssetBackendOptions = {},
): CoreV2AssetBackend {
  const keyNamespace = `pixi-assets-${++pixiBackendSequence}`;
  const fetchAsset = options.fetchAsset ?? defaultFetchAsset;
  const createObjectURL = options.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectURL = options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const ownedObjectUrls = new Map<string, string>();
  return Object.freeze({
    keyNamespace,
    get(request: CoreV2AssetBackendRequest): unknown {
      const externalKey = externalBorrowKey(request);
      return externalKey === null ? undefined : Assets.get<unknown>(externalKey);
    },
    async load(request: CoreV2AssetBackendRequest): Promise<unknown> {
      const logicalDescriptor = pixiDescriptor(request);
      let objectUrl: string | null = null;
      try {
        const descriptor = await isolatedPixiDescriptor(
          logicalDescriptor,
          fetchAsset,
          createObjectURL,
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

function externalBorrowKey(request: CoreV2AssetBackendRequest): string | null {
  if (request.packageOwned || Object.keys(request.descriptor).length !== 1) return null;
  return request.descriptor.src;
}

function pixiDescriptor(request: CoreV2AssetBackendRequest): CoreV2AssetDescriptor {
  if (!request.packageOwned) return request.descriptor;

  const imageMatch = /^core-v2-builtin:\/\/images\/([a-z]+)\.svg$/.exec(
    request.descriptor.src,
  );
  const imageAlias = imageMatch?.[1];
  if (imageAlias && BUILTIN_IMAGE_ALIASES.some((alias) => alias === imageAlias)) {
    return Object.freeze({
      src: builtinImageDataUri(imageAlias),
      parser: 'svg',
    });
  }

  if (request.descriptor.src === 'core-v2-builtin://fonts/FiraCode.woff2') {
    return deepFreeze({
      src: BUILTIN_FIRA_CODE_URL,
      parser: 'web-font',
      data: {
        family: 'Fira Code',
        weights: BUILTIN_FONT_WEIGHTS.map(String),
      },
    });
  }

  throw new CoreV2AssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', false);
}

async function isolatedPixiDescriptor(
  descriptor: CoreV2AssetDescriptor,
  fetchAsset: (src: string) => Promise<Blob>,
  createObjectURL: (blob: Blob) => string,
): Promise<CoreV2AssetDescriptor> {
  const blob = await fetchAsset(descriptor.src);
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
  if (!response.ok) throw new CoreV2AssetError('ASSET_LOAD_FAILED', 'ASSET_FAILURE', true);
  return response.blob();
}

function inferAssetParser(
  descriptor: CoreV2AssetDescriptor,
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
  registration: CoreV2AssetRegistration,
): CoreV2NormalizedAssetRegistration {
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

export function normalizeCoreV2AssetDescriptor(source: CoreV2AssetSource): CoreV2AssetDescriptor {
  return normalizeDescriptor(source);
}

function normalizeDescriptor(source: CoreV2AssetSource): CoreV2AssetDescriptor {
  if (typeof source === 'string') return Object.freeze({ src: nonempty(source, 'asset src') });
  if (!isPlainRecord(source)) invalidAsset('asset descriptor must be a plain object');
  const keys = Object.keys(source);
  const allowed = new Set(['src', 'data', 'format', 'parser', 'loadParser']);
  if (keys.some((key) => !allowed.has(key))) invalidAsset('asset descriptor has an unknown field');
  const descriptor: CoreV2AssetDescriptor = {
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

function canonicalDescriptor(descriptor: CoreV2AssetDescriptor): string {
  return stableSerialize(descriptor);
}

function registrationSignature(
  registration: CoreV2NormalizedAssetRegistration,
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

function resolveBackendNamespace(backend: CoreV2AssetBackend): string {
  const declared = backend.keyNamespace?.trim();
  if (declared) return declared;
  const existing = BACKEND_NAMESPACES.get(backend);
  if (existing) return existing;
  const namespace = `backend-${++backendNamespaceSequence}`;
  BACKEND_NAMESPACES.set(backend, namespace);
  return namespace;
}

function nextBackendResourceSequence(backend: CoreV2AssetBackend): number {
  const sequence = (BACKEND_RESOURCE_SEQUENCES.get(backend) ?? 0) + 1;
  BACKEND_RESOURCE_SEQUENCES.set(backend, sequence);
  return sequence;
}

function isPackageBuiltin(
  registration: CoreV2NormalizedAssetRegistration,
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
): CoreV2AssetResourceProbe {
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

function allowPackageBuiltinsOnly(context: CoreV2AssetPolicyContext): void {
  if (!context.packageOwned) {
    throw new CoreV2AssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', true);
  }
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalidAsset(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function invalidAsset(message: string): never {
  const error = new CoreV2AssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  error.message = `INVALID_VALUE: ${message}`;
  throw error;
}

function assetInternalFailure(): CoreV2AssetError {
  return new CoreV2AssetError('INTERNAL_FAILURE', 'INTERNAL_FAILURE', false);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function sum(
  resources: ReadonlyMap<string, SharedResource>,
  select: (resource: SharedResource) => number,
): number {
  let result = 0;
  for (const resource of resources.values()) result += select(resource);
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
