export type CoreV2StableRecordStrategy = 'frozen-copy' | 'internal-overlay';

interface OverlayEntry<Value> {
  readonly version: number;
  readonly value: Value;
}

interface OverlayStore<Value> {
  readonly base: Readonly<Record<string, Value>>;
  readonly overrides: Map<string, Value>;
  readonly history: Map<string, OverlayEntry<Value>[]>;
  latestVersion: number;
}

interface OverlaySnapshot<Value> {
  readonly store: OverlayStore<Value>;
  readonly version: number;
}

const OVERLAY_SNAPSHOTS = new WeakMap<object, OverlaySnapshot<unknown>>();

/**
 * Patch a same-membership immutable record.
 *
 * The default path preserves the public parser's deeply frozen plain-record
 * contract. The internal overlay path is reserved for the Engine-owned Pixi
 * surface, where previous parser results never escape. It keeps exact property
 * access, ownership, key order, Object.keys/Object.values, and JSON behavior
 * without copying 5,000-20,000 stable keys on every pointer-up.
 */
export function patchCoreV2StableRecord<Value>(
  current: Readonly<Record<string, Value>> | undefined,
  selected: Readonly<Record<string, Value>>,
  keys: readonly string[],
  strategy: CoreV2StableRecordStrategy,
  knownChanged = false,
): Readonly<Record<string, Value>> | null {
  const source = current ?? Object.freeze({} as Record<string, Value>);
  const changedKeys: string[] = [];
  for (const key of keys) {
    const beforePresent = Object.hasOwn(source, key);
    const afterPresent = Object.hasOwn(selected, key);
    if (beforePresent !== afterPresent) return null;
    if (!beforePresent) continue;
    const before = source[key];
    const after = selected[key]!;
    if (
      knownChanged ||
      (
        before !== after &&
        JSON.stringify(before) !== JSON.stringify(after)
      )
    ) {
      changedKeys.push(key);
    }
  }
  if (changedKeys.length === 0) return source;

  if (strategy === 'frozen-copy') {
    const next = Object.assign(
      Object.create(null) as Record<string, Value>,
      source,
    );
    for (const key of changedKeys) next[key] = selected[key]!;
    return Object.freeze(next);
  }

  const prior = overlaySnapshot<Value>(source);
  const store = prior !== null && prior.version === prior.store.latestVersion
    ? prior.store
    : createOverlayStore(source);
  const version = store.latestVersion + 1;
  for (const key of changedKeys) {
    const entries = store.history.get(key);
    const entry = Object.freeze({ version, value: selected[key]! });
    if (entries === undefined) store.history.set(key, [entry]);
    else entries.push(entry);
  }
  store.latestVersion = version;
  return createOverlaySnapshot(store, version);
}

/**
 * Once the Engine has published a successful reconcile, no prior internal
 * parser snapshot remains observable. Fold the just-published version into a
 * bounded latest-value map so repeated gestures do not retain version history.
 */
export function compactCoreV2StableRecord(
  record: Readonly<Record<string, unknown>> | undefined,
): void {
  const snapshot = overlaySnapshot(record);
  if (
    snapshot === null ||
    snapshot.version !== snapshot.store.latestVersion
  ) {
    return;
  }
  for (const [key, entries] of snapshot.store.history) {
    const entry = entries.at(-1);
    if (entry !== undefined) snapshot.store.overrides.set(key, entry.value);
  }
  snapshot.store.history.clear();
}

/**
 * A refused internal reconcile must leave the prior snapshot exact. Remove the
 * unpublished overlay version before the candidate becomes unreachable.
 */
export function rollbackCoreV2StableRecord(
  candidate: Readonly<Record<string, unknown>> | undefined,
  previous: Readonly<Record<string, unknown>> | undefined,
): void {
  const candidateSnapshot = overlaySnapshot(candidate);
  if (
    candidateSnapshot === null ||
    candidateSnapshot.version !== candidateSnapshot.store.latestVersion
  ) {
    return;
  }
  const previousSnapshot = overlaySnapshot(previous);
  const previousVersion =
    previousSnapshot?.store === candidateSnapshot.store
      ? previousSnapshot.version
      : candidateSnapshot.store.base === previous
        ? 0
        : null;
  if (previousVersion === null || previousVersion >= candidateSnapshot.version) {
    return;
  }
  for (const [key, entries] of candidateSnapshot.store.history) {
    while ((entries.at(-1)?.version ?? -1) > previousVersion) entries.pop();
    if (entries.length === 0) candidateSnapshot.store.history.delete(key);
  }
  candidateSnapshot.store.latestVersion = previousVersion;
}

export function isCoreV2StableRecordOverlay(value: unknown): boolean {
  return overlaySnapshot(value) !== null;
}

function createOverlayStore<Value>(
  base: Readonly<Record<string, Value>>,
): OverlayStore<Value> {
  return {
    base,
    overrides: new Map<string, Value>(),
    history: new Map<string, OverlayEntry<Value>[]>(),
    latestVersion: 0,
  };
}

function createOverlaySnapshot<Value>(
  store: OverlayStore<Value>,
  version: number,
): Readonly<Record<string, Value>> {
  const target = Object.create(null) as Record<string, Value>;
  const snapshot: OverlaySnapshot<Value> = { store, version };
  const proxy = new Proxy(target, {
    defineProperty: () => false,
    deleteProperty: () => false,
    get: (_target, property): unknown => {
      if (typeof property !== 'string') {
        return Reflect.get(store.base, property) as unknown;
      }
      return overlayValue(snapshot, property);
    },
    getOwnPropertyDescriptor: (_target, property) => {
      if (typeof property !== 'string' || !overlayHas(snapshot, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        value: overlayValue(snapshot, property),
        writable: false,
      };
    },
    getPrototypeOf: () => Reflect.getPrototypeOf(store.base),
    has: (_target, property) => (
      typeof property === 'string' && overlayHas(snapshot, property)
    ),
    ownKeys: () => Reflect.ownKeys(store.base),
    preventExtensions: () => false,
    set: () => false,
    setPrototypeOf: () => false,
  });
  OVERLAY_SNAPSHOTS.set(proxy, snapshot as OverlaySnapshot<unknown>);
  return proxy;
}

function overlaySnapshot<Value>(
  value: unknown,
): OverlaySnapshot<Value> | null {
  if (value === null || typeof value !== 'object') return null;
  return (
    OVERLAY_SNAPSHOTS.get(value) as OverlaySnapshot<Value> | undefined
  ) ?? null;
}

function overlayHas<Value>(
  snapshot: OverlaySnapshot<Value>,
  key: string,
): boolean {
  return (
    snapshot.store.history.has(key) ||
    snapshot.store.overrides.has(key) ||
    Object.hasOwn(snapshot.store.base, key)
  );
}

function overlayValue<Value>(
  snapshot: OverlaySnapshot<Value>,
  key: string,
): Value | undefined {
  const entries = snapshot.store.history.get(key);
  if (entries !== undefined) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry !== undefined && entry.version <= snapshot.version) {
        return entry.value;
      }
    }
  }
  if (snapshot.store.overrides.has(key)) {
    return snapshot.store.overrides.get(key);
  }
  return snapshot.store.base[key];
}
