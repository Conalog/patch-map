import type { ParsePatchMapResult } from './contracts';
import type { SlotRange } from './dense/contracts';
import type { PatchMapPresentationLayerRenderUpdate } from './presentation-layer-contracts';
import type { PatchMapLogicalTargetSnapshot } from './query-selection';
import type { PatchMapScene } from './scene';
import type { PatchMapMutationTarget } from './semantic/transaction';
import { sameStringArray } from './shared/string-array-values';
import {
  semanticTargetsDenseIds,
} from './core/semantic-dense-planning';
import type { PatchMapIndexedComponentTarget } from './core/published-scene-state';
import { contiguousSlotRangesInPlace } from './core/slot-ranges';

export interface PatchMapLogicalPresentationLayerInput {
  readonly key: string;
  readonly scopeToken: object;
  readonly scope: readonly PatchMapLogicalTargetSnapshot[];
  readonly matched: readonly PatchMapLogicalTargetSnapshot[];
  readonly matchedAlphaMultiplier: number;
  readonly unmatchedAlphaMultiplier: number;
}

export interface PatchMapPresentationLayerSnapshot {
  readonly revision: number;
  readonly layerCount: number;
}

export type { PatchMapPresentationLayerRenderUpdate } from './presentation-layer-contracts';

export interface PatchMapPresentationLayerChange extends PatchMapPresentationLayerSnapshot {
  readonly changed: boolean;
  readonly render: PatchMapPresentationLayerRenderUpdate;
}

interface StoredLayer {
  readonly scopeToken: object;
  readonly scopeKeys: readonly string[];
  readonly matchedKeys: readonly string[];
  readonly scopeTargets: readonly PatchMapMutationTarget[];
  readonly matchedTargets: readonly PatchMapMutationTarget[];
  readonly matchedAlphaMultiplier: number;
  readonly unmatchedAlphaMultiplier: number;
  readonly capacity: number;
  readonly scopeBits: Uint32Array;
  readonly matchedBits: Uint32Array;
}

export interface PatchMapPresentationLayerAuthorityCheckpoint {
  readonly revision: number;
  readonly layers: ReadonlyMap<string, StoredLayer>;
  readonly effective: Float32Array<ArrayBufferLike>;
}

const EMPTY_MULTIPLIERS = new Float32Array(0);
const EMPTY_SLOTS: readonly number[] = Object.freeze([]);
const EMPTY_RANGES: readonly SlotRange[] = Object.freeze([]);

/**
 * One keyed alpha-composition authority over aggregate dense slots.
 *
 * It owns no Pixi object, listener, ticker, RAF, or per-entity closure. Logical
 * snapshots remain detached from caller data; packed bitsets and one effective
 * multiplier column are the only dense retained state.
 */
export class PatchMapPresentationLayerAuthority {
  private layers = new Map<string, StoredLayer>();
  private effective: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private revisionValue = 0;

  public snapshot(): PatchMapPresentationLayerSnapshot {
    return Object.freeze({
      revision: this.revisionValue,
      layerCount: this.layers.size,
    });
  }

  public capture(): PatchMapPresentationLayerAuthorityCheckpoint {
    return Object.freeze({
      revision: this.revisionValue,
      layers: new Map(this.layers),
      effective: this.effective.slice(),
    });
  }

  public restore(checkpoint: PatchMapPresentationLayerAuthorityCheckpoint): void {
    this.revisionValue = checkpoint.revision;
    this.layers = new Map(checkpoint.layers);
    this.effective = checkpoint.effective.slice();
  }

  public set(
    input: PatchMapLogicalPresentationLayerInput,
    parse: ParsePatchMapResult,
    componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
    scene: PatchMapScene,
  ): PatchMapPresentationLayerChange {
    const previous = this.layers.get(input.key);
    const sameScopeToken = previous?.scopeToken === input.scopeToken;
    const scopeKeys = sameScopeToken && previous !== undefined
      ? previous.scopeKeys
      : logicalKeys(input.scope);
    const matchedKeys = logicalKeys(input.matched);
    if (
      previous !== undefined &&
      previous.matchedAlphaMultiplier === input.matchedAlphaMultiplier &&
      previous.unmatchedAlphaMultiplier === input.unmatchedAlphaMultiplier &&
      (sameScopeToken || sameStringArray(previous.scopeKeys, scopeKeys)) &&
      sameStringSet(previous.matchedKeys, matchedKeys)
    ) {
      return this.unchanged();
    }

    this.ensureCapacity(scene.renderStore.capacity);
    const reuseScope = previous !== undefined &&
      previous.capacity === scene.renderStore.capacity &&
      (
        previous.scopeToken === input.scopeToken ||
        sameStringArray(previous.scopeKeys, scopeKeys)
      );
    const scopeTargets = sameScopeToken && previous !== undefined
      ? previous.scopeTargets
      : detachedTargets(input.scope);
    const matchedTargets = detachedTargets(input.matched);
    const scopeProjection = reuseScope
      ? Object.freeze({ bits: previous.scopeBits, slots: EMPTY_SLOTS })
      : projectMembership(parse, scopeTargets, componentTargets, scene);
    const matchedProjection = projectMembership(
      parse,
      matchedTargets,
      componentTargets,
      scene,
    );
    const next: StoredLayer = Object.freeze({
      scopeToken: input.scopeToken,
      scopeKeys,
      matchedKeys,
      scopeTargets,
      matchedTargets,
      matchedAlphaMultiplier: input.matchedAlphaMultiplier,
      unmatchedAlphaMultiplier: input.unmatchedAlphaMultiplier,
      capacity: scene.renderStore.capacity,
      scopeBits: scopeProjection.bits,
      matchedBits: matchedProjection.bits,
    });

    const dirtySlots = previous === undefined
      ? scopeProjection.slots
      : (reuseScope || sameBits(previous.scopeBits, scopeProjection.bits)) &&
          previous.matchedAlphaMultiplier === next.matchedAlphaMultiplier &&
          previous.unmatchedAlphaMultiplier === next.unmatchedAlphaMultiplier
        ? projectMembership(
            parse,
            symmetricTargetDifference(
              previous.matchedKeys,
              previous.matchedTargets,
              matchedKeys,
              matchedTargets,
            ),
            componentTargets,
            scene,
          ).slots
        : unionBitSlots(
            previous.scopeBits,
            scopeProjection.bits,
            scene.renderStore.capacity,
          );
    this.layers.set(input.key, next);
    this.revisionValue += 1;
    return this.changedFromSlots(dirtySlots, scene, false);
  }

  public clear(key: string, scene: PatchMapScene): PatchMapPresentationLayerChange {
    const previous = this.layers.get(key);
    if (previous === undefined) return this.unchanged();
    this.ensureCapacity(scene.renderStore.capacity);
    this.layers.delete(key);
    this.revisionValue += 1;
    return this.changedFromSlots(
      bitSlots(previous.scopeBits, scene.renderStore.capacity),
      scene,
      false,
    );
  }

  /** Successful dataset replacement owns one aggregate clear revision. */
  public clearAll(): PatchMapPresentationLayerChange {
    if (this.layers.size === 0) return this.unchanged();
    this.layers.clear();
    this.effective = new Float32Array(0);
    this.revisionValue += 1;
    return Object.freeze({
      changed: true,
      revision: this.revisionValue,
      layerCount: 0,
      render: Object.freeze({
        revision: this.revisionValue,
        layerCount: 0,
        full: true,
        alphaMultipliers: this.effective,
        dirtyRanges: undefined,
      }),
    });
  }

  /** Structural commits refresh dense projection without changing logical revision. */
  public reproject(
    parse: ParsePatchMapResult,
    componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
    scene: PatchMapScene,
  ): PatchMapPresentationLayerRenderUpdate {
    if (this.layers.size === 0) {
      this.effective = identityColumn(scene.renderStore.capacity);
      return this.fullRenderUpdate(scene);
    }
    const nextLayers = new Map<string, StoredLayer>();
    for (const [key, layer] of this.layers) {
      const scopeProjection = projectMembership(
        parse,
        layer.scopeTargets,
        componentTargets,
        scene,
      );
      const matchedProjection = projectMembership(
        parse,
        layer.matchedTargets,
        componentTargets,
        scene,
      );
      nextLayers.set(key, Object.freeze({
        ...layer,
        capacity: scene.renderStore.capacity,
        scopeBits: scopeProjection.bits,
        matchedBits: matchedProjection.bits,
      }));
    }
    this.layers = nextLayers;
    this.effective = identityColumn(scene.renderStore.capacity);
    for (let slot = 0; slot < this.effective.length; slot += 1) {
      this.effective[slot] = this.composedMultiplier(slot);
    }
    return this.fullRenderUpdate(scene);
  }

  public destroy(): void {
    this.layers.clear();
    this.effective = new Float32Array(0);
  }

  private unchanged(): PatchMapPresentationLayerChange {
    return Object.freeze({
      changed: false,
      revision: this.revisionValue,
      layerCount: this.layers.size,
      render: Object.freeze({
        revision: this.revisionValue,
        layerCount: this.layers.size,
        full: false,
        alphaMultipliers: EMPTY_MULTIPLIERS,
        dirtyRanges: EMPTY_RANGES,
      }),
    });
  }

  private changedFromSlots(
    changedSlots: readonly number[],
    scene: PatchMapScene,
    full: boolean,
  ): PatchMapPresentationLayerChange {
    const dirtySlots: number[] = [];
    const capacity = scene.renderStore.capacity;
    for (const slot of changedSlots) {
      if (slot < 0 || slot >= capacity) continue;
      const next = this.composedMultiplier(slot);
      const previous = this.effective[slot] ?? 1;
      if (Object.is(previous, next)) continue;
      this.effective[slot] = next;
      const entityId = scene.renderStore.ids[slot] ?? '';
      if (entityId.length === 0) continue;
      dirtySlots.push(slot);
    }
    const ranges = dirtySlots.length === 0
      ? EMPTY_RANGES
      : contiguousSlotRangesInPlace(dirtySlots);
    return Object.freeze({
      changed: true,
      revision: this.revisionValue,
      layerCount: this.layers.size,
      render: Object.freeze({
        revision: this.revisionValue,
        layerCount: this.layers.size,
        full,
        alphaMultipliers: this.effective,
        dirtyRanges: ranges,
      }),
    });
  }

  private fullRenderUpdate(scene: PatchMapScene): PatchMapPresentationLayerRenderUpdate {
    this.ensureCapacity(scene.renderStore.capacity);
    return Object.freeze({
      revision: this.revisionValue,
      layerCount: this.layers.size,
      full: true,
      alphaMultipliers: this.effective,
      dirtyRanges: undefined,
    });
  }

  private ensureCapacity(capacity: number): void {
    if (this.effective.length === capacity) return;
    const next = identityColumn(capacity);
    next.set(this.effective.subarray(0, Math.min(capacity, this.effective.length)));
    this.effective = next;
  }

  private composedMultiplier(slot: number): number {
    let multiplier = 1;
    for (const layer of this.layers.values()) {
      if (!hasBit(layer.scopeBits, slot)) continue;
      multiplier *= hasBit(layer.matchedBits, slot)
        ? layer.matchedAlphaMultiplier
        : layer.unmatchedAlphaMultiplier;
    }
    return Math.fround(multiplier);
  }
}

function logicalKeys(targets: readonly PatchMapLogicalTargetSnapshot[]): readonly string[] {
  return Object.freeze(targets.map(({ key }) => key));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return right.every((value) => values.has(value));
}

function detachedTargets(
  targets: readonly PatchMapLogicalTargetSnapshot[],
): readonly PatchMapMutationTarget[] {
  return Object.freeze(targets.map(({ target }) => target.kind === 'element'
    ? Object.freeze({ kind: 'element' as const, id: target.id })
    : Object.freeze({
        kind: 'component' as const,
        ownerId: target.ownerId,
        id: target.id,
      })));
}

function symmetricTargetDifference(
  previousKeys: readonly string[],
  previousTargets: readonly PatchMapMutationTarget[],
  nextKeys: readonly string[],
  nextTargets: readonly PatchMapMutationTarget[],
): readonly PatchMapMutationTarget[] {
  const previousByKey = new Map(previousKeys.map((key, index) => [key, previousTargets[index]!]));
  const nextByKey = new Map(nextKeys.map((key, index) => [key, nextTargets[index]!]));
  const changed: PatchMapMutationTarget[] = [];
  for (const [key, target] of previousByKey) {
    if (!nextByKey.has(key)) changed.push(target);
  }
  for (const [key, target] of nextByKey) {
    if (!previousByKey.has(key)) changed.push(target);
  }
  return Object.freeze(changed);
}

function identityColumn(capacity: number): Float32Array {
  const result = new Float32Array(capacity);
  result.fill(1);
  return result;
}

function projectMembership(
  parse: ParsePatchMapResult,
  targets: readonly PatchMapMutationTarget[],
  componentTargets: ReadonlyMap<string, PatchMapIndexedComponentTarget | null>,
  scene: PatchMapScene,
): Readonly<{ readonly bits: Uint32Array; readonly slots: readonly number[] }> {
  const bits = new Uint32Array(Math.ceil(scene.renderStore.capacity / 32));
  const slots: number[] = [];
  const entityIds = semanticTargetsDenseIds(parse, targets, componentTargets);
  for (const entityId of entityIds) {
    const ref = scene.ref(entityId);
    if (ref !== null && !hasBit(bits, ref.slot)) {
      setBit(bits, ref.slot);
      slots.push(ref.slot);
    }
  }
  slots.sort((left, right) => left - right);
  return Object.freeze({ bits, slots: Object.freeze(slots) });
}

function setBit(bits: Uint32Array, slot: number): void {
  const word = slot >>> 5;
  bits[word] = (bits[word] ?? 0) | (1 << (slot & 31));
}

function hasBit(bits: Uint32Array, slot: number): boolean {
  return (((bits[slot >>> 5] ?? 0) >>> (slot & 31)) & 1) === 1;
}

function sameBits(left: Uint32Array, right: Uint32Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function bitSlots(bits: Uint32Array, capacity: number): readonly number[] {
  return unionBitSlots(bits, new Uint32Array(0), capacity);
}

function unionBitSlots(
  left: Uint32Array,
  right: Uint32Array,
  capacity: number,
): readonly number[] {
  const slots: number[] = [];
  const wordCount = Math.max(left.length, right.length);
  for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
    let word = (left[wordIndex] ?? 0) | (right[wordIndex] ?? 0);
    while (word !== 0) {
      const bit = 31 - Math.clz32(word & -word);
      const slot = (wordIndex << 5) + bit;
      if (slot < capacity) slots.push(slot);
      word &= word - 1;
    }
  }
  return Object.freeze(slots);
}
