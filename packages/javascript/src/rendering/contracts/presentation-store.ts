import {
  RenderFlags,
  type RenderStoreView,
} from '../../dense/renderer-types';
import type { CoreView, Rgba } from '../../dense/contracts';
import type { PatchMapResolvedPresentationPolicy } from '../../presentation/policy';
import type { PatchMapRendererEntityPresentationOverride } from '../../rendering-port';

export type { PatchMapRendererEntityPresentationOverride } from '../../rendering-port';

/**
 * Mutable columns and retained inputs owned by one presentation store.
 * Captured only at the load publication boundary; dense base columns and
 * immutable policy/override values remain retained references.
 */
export interface PatchMapPresentationStoreCheckpoint {
  readonly base: RenderStoreView;
  readonly policy: PatchMapResolvedPresentationPolicy | null;
  readonly overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>;
  readonly alphaMultipliers: Float32Array<ArrayBufferLike>;
  readonly highlighted: readonly string[];
  readonly hidden: readonly string[];
  readonly fillOverrides: readonly (readonly [string, number])[];
  readonly kind: Uint8Array;
  readonly flags: Uint8Array;
  readonly opacity: Float32Array;
  readonly fill: Uint32Array;
  readonly stroke: Uint32Array;
  readonly strokeWidth: Float32Array;
  readonly radius: Float32Array;
  readonly source: readonly string[];
  readonly tint: Uint32Array;
  readonly trackFill: Uint32Array;
  readonly align: Uint8Array;
}

const EMPTY_ALPHA_MULTIPLIERS = new Float32Array(0);

/**
 * Stable renderer-only view over the dense store.
 *
 * Only presentation-owned columns are materialized. Every other column remains
 * a direct view of the authoritative dense store. Dirty-range synchronization
 * keeps normal updates incremental while a host presentation policy is active.
 */
export class PatchMapPresentationStoreView implements RenderStoreView {
  private base: RenderStoreView;
  private policy: PatchMapResolvedPresentationPolicy | null;
  private overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride>;
  private alphaMultipliers: Float32Array<ArrayBufferLike>;
  private readonly highlighted = new Set<string>();
  private readonly hidden = new Set<string>();
  private readonly fillOverrides = new Map<string, number>();

  public readonly kind: Uint8Array;
  public readonly flags: Uint8Array;
  public readonly opacity: Float32Array;
  public readonly fill: Uint32Array;
  public readonly stroke: Uint32Array;
  public readonly strokeWidth: Float32Array;
  public readonly radius: Float32Array;
  public readonly source: string[];
  public readonly tint: Uint32Array;
  public readonly trackFill: Uint32Array;
  public readonly align: Uint8Array;

  public constructor(
    base: RenderStoreView,
    policy: PatchMapResolvedPresentationPolicy | null,
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride> = new Map(),
    alphaMultipliers: Float32Array<ArrayBufferLike> = EMPTY_ALPHA_MULTIPLIERS,
  ) {
    this.base = base;
    this.policy = policy;
    this.overrides = overrides;
    this.alphaMultipliers = alphaMultipliers;
    this.kind = new Uint8Array(base.capacity);
    this.flags = new Uint8Array(base.capacity);
    this.opacity = new Float32Array(base.capacity);
    this.fill = new Uint32Array(base.capacity);
    this.stroke = new Uint32Array(base.capacity);
    this.strokeWidth = new Float32Array(base.capacity);
    this.radius = new Float32Array(base.capacity);
    this.source = new Array<string>(base.capacity).fill('');
    this.tint = new Uint32Array(base.capacity);
    this.trackFill = new Uint32Array(base.capacity);
    this.align = new Uint8Array(base.capacity);
    this.synchronize(base, policy, undefined, overrides, alphaMultipliers);
  }

  public get capacity(): number {
    return this.base.capacity;
  }

  public get liveCount(): number {
    return this.base.liveCount;
  }

  public get revision(): number {
    return this.base.revision;
  }

  public get alive(): ArrayLike<number> {
    return this.base.alive;
  }

  public get zIndex(): ArrayLike<number> {
    return this.base.zIndex;
  }

  public get x(): ArrayLike<number> {
    return this.base.x;
  }

  public get y(): ArrayLike<number> {
    return this.base.y;
  }

  public get width(): ArrayLike<number> {
    return this.base.width;
  }

  public get height(): ArrayLike<number> {
    return this.base.height;
  }

  public get rotation(): ArrayLike<number> {
    return this.base.rotation;
  }

  public get text(): readonly string[] {
    return this.base.text;
  }

  public get color(): ArrayLike<number> {
    return this.base.color;
  }

  public get fontSize(): ArrayLike<number> {
    return this.base.fontSize;
  }

  public get fontFamily(): readonly string[] {
    return this.base.fontFamily;
  }

  public get fontWeight(): ArrayLike<number> {
    return this.base.fontWeight;
  }

  public get maxLines(): ArrayLike<number> {
    return this.base.maxLines;
  }

  public get fit(): ArrayLike<number> {
    return this.base.fit;
  }

  public get value(): ArrayLike<number> {
    return this.base.value;
  }

  public get min(): ArrayLike<number> {
    return this.base.min;
  }

  public get max(): ArrayLike<number> {
    return this.base.max;
  }

  public get relationFrom(): ArrayLike<number> {
    return this.base.relationFrom;
  }

  public get relationTo(): ArrayLike<number> {
    return this.base.relationTo;
  }

  public get lineWidth(): ArrayLike<number> {
    return this.base.lineWidth;
  }

  public get ids(): readonly string[] {
    return this.base.ids;
  }

  public get view(): CoreView {
    return this.base.view;
  }

  public get background(): Rgba {
    return this.base.background;
  }

  public renderOrder(): ArrayLike<number> {
    return this.base.renderOrder();
  }

  public presentationFillOverride(entityId: string): number | null {
    return this.fillOverrides.get(entityId) ?? null;
  }

  /** Capture only state this view can mutate in place during staged load. */
  public captureCheckpoint(): PatchMapPresentationStoreCheckpoint {
    return Object.freeze({
      base: this.base,
      policy: this.policy,
      overrides: this.overrides,
      alphaMultipliers: this.alphaMultipliers,
      highlighted: Object.freeze([...this.highlighted]),
      hidden: Object.freeze([...this.hidden]),
      fillOverrides: Object.freeze([...this.fillOverrides]),
      kind: this.kind.slice(),
      flags: this.flags.slice(),
      opacity: this.opacity.slice(),
      fill: this.fill.slice(),
      stroke: this.stroke.slice(),
      strokeWidth: this.strokeWidth.slice(),
      radius: this.radius.slice(),
      source: Object.freeze(this.source.slice()),
      tint: this.tint.slice(),
      trackFill: this.trackFill.slice(),
      align: this.align.slice(),
    });
  }

  /** Restore retained inputs and mutable columns without recomputing policy. */
  public restoreCheckpoint(checkpoint: PatchMapPresentationStoreCheckpoint): void {
    this.base = checkpoint.base;
    this.policy = checkpoint.policy;
    this.overrides = checkpoint.overrides;
    this.alphaMultipliers = checkpoint.alphaMultipliers;
    replaceSet(this.highlighted, checkpoint.highlighted);
    replaceSet(this.hidden, checkpoint.hidden);
    this.fillOverrides.clear();
    for (const [id, packedColor] of checkpoint.fillOverrides) {
      this.fillOverrides.set(id, packedColor);
    }
    this.kind.set(checkpoint.kind);
    this.flags.set(checkpoint.flags);
    this.opacity.set(checkpoint.opacity);
    this.fill.set(checkpoint.fill);
    this.stroke.set(checkpoint.stroke);
    this.strokeWidth.set(checkpoint.strokeWidth);
    this.radius.set(checkpoint.radius);
    for (let slot = 0; slot < checkpoint.source.length; slot += 1) {
      this.source[slot] = checkpoint.source[slot] ?? '';
    }
    this.tint.set(checkpoint.tint);
    this.trackFill.set(checkpoint.trackFill);
    this.align.set(checkpoint.align);
  }

  public synchronize(
    base: RenderStoreView,
    policy: PatchMapResolvedPresentationPolicy | null,
    ranges?: readonly Readonly<{ readonly start: number; readonly end: number }>[],
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride> = this.overrides,
    alphaMultipliers: Float32Array<ArrayBufferLike> = this.alphaMultipliers,
  ): void {
    if (base.capacity !== this.flags.length) {
      throw new RangeError('presentation store capacity changed');
    }
    assertAlphaMultiplierCapacity(alphaMultipliers, base.capacity);
    this.base = base;
    this.policy = policy;
    this.overrides = overrides;
    this.alphaMultipliers = alphaMultipliers;
    replaceSet(this.highlighted, policy?.highlightedEntityIds ?? []);
    replaceSet(this.hidden, policy?.hiddenEntityIds ?? []);
    replaceFillOverrides(this.fillOverrides, policy?.fillOverrides ?? []);
    if (ranges === undefined) {
      this.synchronizeRange(0, base.capacity);
      return;
    }
    for (const range of ranges) {
      this.synchronizeRange(range.start, range.end);
    }
  }

  /** Keyed alpha layers change only the derived opacity column. */
  public synchronizeAlphaMultipliers(
    alphaMultipliers: Float32Array<ArrayBufferLike>,
    ranges?: readonly Readonly<{ readonly start: number; readonly end: number }>[],
  ): void {
    assertAlphaMultiplierCapacity(alphaMultipliers, this.base.capacity);
    this.alphaMultipliers = alphaMultipliers;
    if (ranges === undefined) {
      this.synchronizeOpacityRange(0, this.base.capacity);
      return;
    }
    for (const range of ranges) {
      this.synchronizeOpacityRange(range.start, range.end);
    }
  }

  public entityProbe(entityId: string): Readonly<{
    readonly emphasis: number;
    readonly visible: boolean;
    readonly renderObjectCount: number;
    readonly packedFill: number;
  }> | null {
    const slot = this.base.ids.indexOf(entityId);
    if (slot < 0 || (this.base.alive[slot] ?? 0) === 0) return null;
    const visible = ((this.flags[slot] ?? 0) & RenderFlags.Visible) !== 0 &&
      (this.opacity[slot] ?? 0) > 0;
    return Object.freeze({
      emphasis: this.emphasis(entityId, slot),
      visible,
      renderObjectCount: visible ? 1 : 0,
      packedFill: this.fill[slot] ?? 0,
    });
  }

  private synchronizeRange(startValue: number, endValue: number): void {
    const start = Math.max(0, Math.min(this.base.capacity, Math.trunc(startValue)));
    const end = Math.max(start, Math.min(this.base.capacity, Math.trunc(endValue)));
    for (let slot = start; slot < end; slot += 1) {
      const id = this.base.ids[slot] ?? '';
      const override = this.overrides.get(id);
      const hidden = this.hidden.has(id);
      const flags = this.base.flags[slot] ?? 0;
      this.kind[slot] = override?.kind ?? this.base.kind[slot] ?? 0;
      const presentationFlags = override?.visible === undefined
        ? flags
        : override.visible
          ? flags | RenderFlags.Visible
          : flags & ~RenderFlags.Visible;
      this.flags[slot] = hidden
        ? presentationFlags & ~RenderFlags.Visible
        : presentationFlags;
      this.opacity[slot] = (override?.opacity ?? this.base.opacity[slot] ?? 0) *
        this.emphasis(id, slot);
      this.fill[slot] = this.fillOverrides.get(id) ?? override?.fill ?? this.base.fill[slot] ?? 0;
      this.stroke[slot] = override?.stroke ?? this.base.stroke[slot] ?? 0;
      this.strokeWidth[slot] = override?.strokeWidth ?? this.base.strokeWidth[slot] ?? 0;
      this.radius[slot] = override?.radius ?? this.base.radius[slot] ?? 0;
      this.source[slot] = override?.source ?? this.base.source[slot] ?? '';
      this.tint[slot] = override?.tint ?? this.base.tint[slot] ?? 0xffffffff;
      this.trackFill[slot] = override?.trackFill ?? this.base.trackFill[slot] ?? 0;
      this.align[slot] = override?.align ?? this.base.align[slot] ?? 0;
    }
  }

  private synchronizeOpacityRange(startValue: number, endValue: number): void {
    const start = Math.max(0, Math.min(this.base.capacity, Math.trunc(startValue)));
    const end = Math.max(start, Math.min(this.base.capacity, Math.trunc(endValue)));
    for (let slot = start; slot < end; slot += 1) {
      const id = this.base.ids[slot] ?? '';
      const opacity = this.overrides.get(id)?.opacity ?? this.base.opacity[slot] ?? 0;
      this.opacity[slot] = opacity * this.emphasis(id, slot);
    }
  }

  private emphasis(entityId: string, slot: number): number {
    const policyMultiplier = this.policy === null ||
      this.policy.highlightedEntityIds === null ||
      this.highlighted.has(entityId)
      ? 1
      : this.policy.deEmphasisAlpha;
    return policyMultiplier * (this.alphaMultipliers[slot] ?? 1);
  }
}

function assertAlphaMultiplierCapacity(
  alphaMultipliers: Float32Array<ArrayBufferLike>,
  capacity: number,
): void {
  if (alphaMultipliers.length !== 0 && alphaMultipliers.length !== capacity) {
    throw new RangeError('presentation alpha multiplier capacity changed');
  }
}

function replaceSet(target: Set<string>, values: readonly string[]): void {
  target.clear();
  for (const value of values) target.add(value);
}

function replaceFillOverrides(
  target: Map<string, number>,
  values: PatchMapResolvedPresentationPolicy['fillOverrides'],
): void {
  target.clear();
  for (const { id, packedColor } of values) target.set(id, packedColor >>> 0);
}
