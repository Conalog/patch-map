import type { MergeStrategy } from '../contracts';

/** Public update data is JSON-like, but remains open to future named fields. */
export type UpdateRecord = Readonly<Record<string, unknown>>;

export type ComponentMatchKind =
  | 'id'
  | 'label'
  | 'unique-type'
  | 'type-order'
  | 'new';

export interface ComponentMatch<
  TExisting extends UpdateRecord = UpdateRecord,
  TPatch extends UpdateRecord = UpdateRecord,
> {
  incomingIndex: number;
  existingIndex: number | null;
  kind: ComponentMatchKind;
  existing: TExisting | undefined;
  patch: TPatch;
}

export interface ReconciledComponentEntry<
  TExisting extends UpdateRecord = UpdateRecord,
  TPatch extends UpdateRecord = UpdateRecord,
> {
  /** Index of the retained live handle, or null when a new handle is needed. */
  existingIndex: number | null;
  /** Index in the caller's changes.components array, or null when retained. */
  incomingIndex: number | null;
  kind: ComponentMatchKind | 'retained';
  existing: TExisting | undefined;
  patch: TPatch | undefined;
  /**
   * Immutable state for a retained live handle before schema materialization.
   * Replace changes only replace fields explicitly named by the patch.
   */
  merged: UpdateRecord;
}

export interface ReconciledComponentArray<
  TExisting extends UpdateRecord = UpdateRecord,
  TPatch extends UpdateRecord = UpdateRecord,
> {
  entries: ReconciledComponentEntry<TExisting, TPatch>[];
  matches: ComponentMatch<TExisting, TPatch>[];
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Clone update values without retaining mutable caller-owned arrays/objects. */
export const cloneUpdateValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    const clone = (value as readonly unknown[]).map((entry) =>
      cloneUpdateValue(entry),
    );
    return clone as T;
  }
  if (isPlainRecord(value)) {
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneUpdateValue(entry);
    }
    return clone as T;
  }
  return value;
};

/**
 * Recursively merge plain objects. Arrays and non-plain values are replaced,
 * matching the separate, contract-specific handling for component/link arrays.
 */
export const deepMerge = <T>(base: T, patch: unknown): T => {
  if (!isPlainRecord(base) || !isPlainRecord(patch)) {
    return cloneUpdateValue(patch) as T;
  }

  const output = cloneUpdateValue(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    output[key] =
      isPlainRecord(output[key]) && isPlainRecord(value)
        ? deepMerge(output[key], value)
        : cloneUpdateValue(value);
  }
  return output as T;
};

/**
 * Replace each top-level property named by the patch while leaving unnamed
 * properties intact. Nested defaults are applied later by schema materialization.
 */
export const replaceNamedProperties = <T>(base: T, patch: unknown): T => {
  if (!isPlainRecord(base) || !isPlainRecord(patch)) {
    return cloneUpdateValue(patch) as T;
  }

  const output = cloneUpdateValue(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    output[key] = cloneUpdateValue(value);
  }
  return output as T;
};

export const applyMergeStrategy = <T>(
  base: T,
  patch: unknown,
  strategy: MergeStrategy,
): T =>
  strategy === 'replace'
    ? replaceNamedProperties(base, patch)
    : deepMerge(base, patch);

const readString = (record: UpdateRecord, key: 'id' | 'label' | 'type') => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Match component patches without mutating either array.
 *
 * Matching is deliberately multi-pass so a type-only patch cannot consume a
 * handle reserved by a later, higher-priority explicit ID or label patch.
 */
export const matchComponentUpdates = <
  TExisting extends UpdateRecord,
  TPatch extends UpdateRecord,
>(
  existing: readonly TExisting[],
  incoming: readonly TPatch[],
): ComponentMatch<TExisting, TPatch>[] => {
  const existingUsed = new Set<number>();
  const matches: ComponentMatch<TExisting, TPatch>[] = incoming.map(
    (patch, incomingIndex) => ({
      incomingIndex,
      existingIndex: null,
      kind: 'new',
      existing: undefined,
      patch,
    }),
  );

  const claim = (
    incomingIndex: number,
    existingIndex: number,
    kind: Exclude<ComponentMatchKind, 'new'>,
  ) => {
    existingUsed.add(existingIndex);
    matches[incomingIndex] = {
      incomingIndex,
      existingIndex,
      kind,
      existing: existing[existingIndex]!,
      patch: incoming[incomingIndex]!,
    };
  };

  // Explicit IDs reserve their existing handles before weaker matches.
  incoming.forEach((patch, incomingIndex) => {
    const id = readString(patch, 'id');
    if (id === undefined) return;
    const existingIndex = existing.findIndex(
      (candidate, index) =>
        !existingUsed.has(index) && readString(candidate, 'id') === id,
    );
    if (existingIndex >= 0) claim(incomingIndex, existingIndex, 'id');
  });

  // A supplied but unknown ID is a new component; it never falls back.
  incoming.forEach((patch, incomingIndex) => {
    if (matches[incomingIndex]!.existingIndex !== null) return;
    if (readString(patch, 'id') !== undefined) return;
    const label = readString(patch, 'label');
    if (label === undefined) return;
    const existingIndex = existing.findIndex(
      (candidate, index) =>
        !existingUsed.has(index) && readString(candidate, 'label') === label,
    );
    if (existingIndex >= 0) claim(incomingIndex, existingIndex, 'label');
  });

  // A supplied but unknown label is also a new component. Remaining patches
  // match same-type handles in stable incoming/existing order.
  const types = new Set(
    incoming
      .filter(
        (patch, index) =>
          matches[index]!.existingIndex === null &&
          readString(patch, 'id') === undefined &&
          readString(patch, 'label') === undefined,
      )
      .map((patch) => readString(patch, 'type'))
      .filter((type): type is string => type !== undefined),
  );

  for (const type of types) {
    const incomingIndices = incoming
      .map((patch, index) => ({ patch, index }))
      .filter(
        ({ patch, index }) =>
          matches[index]!.existingIndex === null &&
          readString(patch, 'id') === undefined &&
          readString(patch, 'label') === undefined &&
          readString(patch, 'type') === type,
      )
      .map(({ index }) => index);
    const existingIndices = existing
      .map((candidate, index) => ({ candidate, index }))
      .filter(
        ({ candidate, index }) =>
          !existingUsed.has(index) && readString(candidate, 'type') === type,
      )
      .map(({ index }) => index);
    const kind: Exclude<ComponentMatchKind, 'id' | 'label' | 'new'> =
      incomingIndices.length === 1 && existingIndices.length === 1
        ? 'unique-type'
        : 'type-order';
    const count = Math.min(incomingIndices.length, existingIndices.length);
    for (let index = 0; index < count; index += 1) {
      claim(incomingIndices[index]!, existingIndices[index]!, kind);
    }
  }

  return matches;
};

/**
 * Build a deterministic component reconciliation plan.
 *
 * Merge preserves existing order and unmatched handles. Replace follows
 * incoming order and omits unmatched existing handles. Callers should
 * independently materialize the incoming replace entries for parent
 * `props.components`; `merged` is the retained live-handle state.
 */
export const reconcileComponentArray = <
  TExisting extends UpdateRecord,
  TPatch extends UpdateRecord,
>(
  existing: readonly TExisting[],
  incoming: readonly TPatch[],
  strategy: MergeStrategy,
): ReconciledComponentArray<TExisting, TPatch> => {
  const matches = matchComponentUpdates(existing, incoming);

  if (strategy === 'replace') {
    return {
      matches,
      entries: matches.map((match) => ({
        existingIndex: match.existingIndex,
        incomingIndex: match.incomingIndex,
        kind: match.kind,
        existing: match.existing,
        patch: match.patch,
        merged:
          match.existing === undefined
            ? cloneUpdateValue(match.patch)
            : replaceNamedProperties(match.existing, match.patch),
      })),
    };
  }

  const incomingByExisting = new Map(
    matches
      .filter(
        (match): match is ComponentMatch<TExisting, TPatch> & {
          existingIndex: number;
          existing: TExisting;
        } => match.existingIndex !== null && match.existing !== undefined,
      )
      .map((match) => [match.existingIndex, match]),
  );
  const entries: ReconciledComponentEntry<TExisting, TPatch>[] = existing.map(
    (component, existingIndex) => {
      const match = incomingByExisting.get(existingIndex);
      if (match === undefined) {
        return {
          existingIndex,
          incomingIndex: null,
          kind: 'retained',
          existing: component,
          patch: undefined,
          merged: cloneUpdateValue(component),
        };
      }
      return {
        existingIndex,
        incomingIndex: match.incomingIndex,
        kind: match.kind,
        existing: component,
        patch: match.patch,
        merged: deepMerge(component, match.patch),
      };
    },
  );

  for (const match of matches) {
    if (match.existingIndex !== null) continue;
    entries.push({
      existingIndex: null,
      incomingIndex: match.incomingIndex,
      kind: 'new',
      existing: undefined,
      patch: match.patch,
      merged: cloneUpdateValue(match.patch),
    });
  }

  return { entries, matches };
};

const dataEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => dataEqual(entry, right[index]))
    );
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && dataEqual(left[key], right[key]),
      )
    );
  }
  return false;
};

/** Append only structurally new relation links during a merge update. */
export const mergeRelationLinks = <T>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] => {
  const output = existing.map((link) => cloneUpdateValue(link));
  for (const link of incoming) {
    if (!output.some((candidate) => dataEqual(candidate, link))) {
      output.push(cloneUpdateValue(link));
    }
  }
  return output;
};
