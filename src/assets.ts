import { Assets, Cache, Texture } from 'pixi.js';

type AssetRecord = Record<string, unknown>;

export interface PublicAssetsApi {
  add(assets: unknown): void;
  addBundle(bundleId: string, assets: unknown): void;
  load(assets: unknown): Promise<unknown>;
  loadBundle(bundleIds: string | string[]): Promise<unknown>;
  unload(assets: string | string[]): Promise<void>;
  unloadBundle(bundleIds: string | string[]): Promise<void>;
}

export interface PublicAssetCacheApi {
  has(key: string): boolean;
}

interface SceneAssetSource {
  key: string;
  load: unknown;
  descriptor: boolean;
}

interface NormalizedAssets {
  bundles: Array<{ name: string; assets: unknown }>;
  direct: unknown[];
  unloadKeys: string[];
}

const record = (value: unknown): AssetRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as AssetRecord
    : null;

const isRectangleTexture = (value: unknown): boolean =>
  record(value)?.type === 'rect';

const isLoadableLocation = (value: string): boolean =>
  /^(?:https?:|data:|blob:|\/|\.\.?\/)/i.test(value) ||
  /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value);

const stableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  const object = record(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .filter((key) => object[key] !== undefined)
      .map((key) => [key, stableJsonValue(object[key])]),
  );
};

const inlineAssetKey = (descriptor: AssetRecord): string => {
  const identity = stableJsonValue({
    src: descriptor.src,
    data: descriptor.data,
    format: descriptor.format,
    parser: descriptor.parser,
    loadParser: descriptor.loadParser,
  });
  return `patch-map:inline:${encodeURIComponent(JSON.stringify(identity))}`;
};

const sceneAssetSource = (value: unknown): SceneAssetSource | null => {
  if (typeof value === 'string') {
    return { key: value, load: value, descriptor: false };
  }
  const descriptor = record(value);
  if (!descriptor || isRectangleTexture(descriptor)) return null;
  if (typeof descriptor.src !== 'string' || descriptor.src.length === 0) {
    return null;
  }
  const key = inlineAssetKey(descriptor);
  return {
    key,
    load: { ...descriptor, alias: key },
    descriptor: true,
  };
};

export const sceneAssetKey = (source: unknown): string | null =>
  sceneAssetSource(source)?.key ?? null;

/** Synchronous lookup used after an explicit Assets.load completion. */
export const getCachedSceneTexture = (source: unknown): Texture | null => {
  const key = sceneAssetKey(source);
  if (!key || !Cache.has(key)) return null;
  try {
    const value: unknown = Cache.get(key);
    return value instanceof Texture ? value : null;
  } catch {
    return null;
  }
};

/** Collect public visual sources without retaining caller-owned scene data. */
export const collectSceneAssetSources = (input: unknown): SceneAssetSource[] => {
  const output = new Map<string, SceneAssetSource>();
  const visited = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (visited.has(value)) return;
      visited.add(value);
      for (const entry of value) visit(entry);
      return;
    }
    const candidate = record(value);
    if (!candidate || visited.has(candidate)) return;
    visited.add(candidate);

    if ('source' in candidate) {
      const source = sceneAssetSource(candidate.source);
      if (source && !output.has(source.key)) output.set(source.key, source);
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (key !== 'source') visit(child);
    }
  };
  visit(input);
  return [...output.values()];
};

const stringValues = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];

const directUnloadKeys = (asset: unknown): string[] => {
  if (typeof asset === 'string') return [asset];
  const descriptor = record(asset);
  if (!descriptor) return [];
  const aliases = stringValues(descriptor.alias);
  if (aliases.length > 0) return aliases;
  return stringValues(descriptor.src);
};

const normalizeAssets = (input: unknown): NormalizedAssets => {
  const bundles: NormalizedAssets['bundles'] = [];
  const direct: unknown[] = [];

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (typeof value === 'string') {
      direct.push(value);
      return;
    }
    const candidate = record(value);
    if (!candidate) return;
    if (Array.isArray(candidate.bundles)) {
      for (const bundle of candidate.bundles) visit(bundle);
      return;
    }
    if (typeof candidate.name === 'string' && candidate.assets !== undefined) {
      bundles.push({ name: candidate.name, assets: candidate.assets });
      return;
    }
    if ('alias' in candidate || 'src' in candidate) {
      direct.push(candidate);
      return;
    }
    for (const [alias, source] of Object.entries(candidate)) {
      const descriptor = record(source);
      direct.push(
        descriptor && 'src' in descriptor
          ? { ...descriptor, alias: descriptor.alias ?? alias }
          : { alias, src: source },
      );
    }
  };

  visit(input);
  return {
    bundles,
    direct,
    unloadKeys: [...new Set(direct.flatMap(directUnloadKeys))],
  };
};

export class ManagedAssets {
  readonly #api: PublicAssetsApi;
  #generation = 0;
  #bundleIds: string[] = [];
  #assetKeys: string[] = [];

  public constructor(api: PublicAssetsApi = Assets as unknown as PublicAssetsApi) {
    this.#api = api;
  }

  public async register(input: unknown): Promise<void> {
    const generation = ++this.#generation;
    await this.#releaseCurrent();
    const normalized = normalizeAssets(input);
    const bundleIds = normalized.bundles.map(({ name }) => name);
    for (const bundle of normalized.bundles) {
      this.#api.addBundle(bundle.name, bundle.assets);
    }
    if (normalized.direct.length > 0) this.#api.add(normalized.direct);

    try {
      await Promise.all([
        bundleIds.length > 0
          ? this.#api.loadBundle(bundleIds)
          : Promise.resolve(),
        normalized.unloadKeys.length > 0
          ? this.#api.load(normalized.unloadKeys)
          : Promise.resolve(),
      ]);
    } catch (error) {
      await this.#release(bundleIds, normalized.unloadKeys);
      throw error;
    }

    if (generation !== this.#generation) {
      await this.#release(bundleIds, normalized.unloadKeys);
      return;
    }
    this.#bundleIds = bundleIds;
    this.#assetKeys = normalized.unloadKeys;
  }

  public async clear(): Promise<void> {
    this.#generation += 1;
    await this.#releaseCurrent();
  }

  #releaseCurrent(): Promise<void> {
    const bundles = this.#bundleIds;
    const assets = this.#assetKeys;
    this.#bundleIds = [];
    this.#assetKeys = [];
    return this.#release(bundles, assets);
  }

  async #release(bundleIds: string[], assetKeys: string[]): Promise<void> {
    const releases: Promise<void>[] = [];
    if (bundleIds.length > 0) releases.push(this.#api.unloadBundle(bundleIds));
    if (assetKeys.length > 0) releases.push(this.#api.unload(assetKeys));
    await Promise.all(releases);
  }
}

/**
 * Owns only scene URLs/descriptors that this instance actually asks Pixi to
 * load. Registered aliases already present in the public cache remain owned by
 * their registering lifecycle and are never unloaded here.
 */
export class ManagedSceneAssets {
  readonly #api: Pick<PublicAssetsApi, 'load' | 'unload'>;
  readonly #cache: PublicAssetCacheApi;
  #generation = 0;
  readonly #pending = new Map<string, Promise<boolean>>();
  readonly #owned = new Set<string>();
  #active = new Set<string>();

  public constructor(
    api: Pick<PublicAssetsApi, 'load' | 'unload'> = Assets,
    cache: PublicAssetCacheApi = Cache,
  ) {
    this.#api = api;
    this.#cache = cache;
  }

  /**
   * Starts missing URL/descriptor loads without delaying synchronous draw or
   * update. A callback belongs only to the newest scene generation.
   */
  public refresh(input: unknown, onReady: () => void): Promise<void> {
    const generation = ++this.#generation;
    const sources = collectSceneAssetSources(input);
    this.#active = new Set(sources.map(({ key }) => key));
    const notifications: Promise<void>[] = [this.#releaseInactive()];
    for (const source of sources) {
      if (this.#cache.has(source.key)) continue;
      if (!source.descriptor && !isLoadableLocation(source.key)) continue;
      const task = this.#pending.get(source.key) ?? this.#load(source);
      notifications.push(task.then((loaded) => {
        if (loaded && generation === this.#generation) onReady();
      }));
    }
    return Promise.all(notifications).then(() => undefined);
  }

  /** Invalidates late callbacks and releases sources loaded by this manager. */
  public async clear(): Promise<void> {
    this.#generation += 1;
    this.#active.clear();
    await Promise.all(this.#pending.values());
    const keys = [...this.#owned];
    this.#owned.clear();
    if (keys.length > 0) await this.#api.unload(keys);
  }

  #load(source: SceneAssetSource): Promise<boolean> {
    const task = Promise.resolve()
      .then(() => this.#api.load(source.load))
      .then(async () => {
        if (!this.#active.has(source.key)) {
          await this.#api.unload(source.key);
          return false;
        }
        this.#owned.add(source.key);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.#pending.delete(source.key);
      });
    this.#pending.set(source.key, task);
    return task;
  }

  async #releaseInactive(): Promise<void> {
    const stale = [...this.#owned].filter((key) => !this.#active.has(key));
    for (const key of stale) this.#owned.delete(key);
    if (stale.length > 0) await this.#api.unload(stale);
  }
}
