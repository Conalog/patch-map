import {
  RenderFlags,
  type RenderStoreView,
} from '../dense/renderer-types';
import type { CoreView, Rgba } from '../dense/contracts';
import type { PatchMapResolvedPresentationPolicy } from '../presentation-policy';

/** Renderer-only sparse values projected into stable columnar arrays. */
export interface PatchMapRendererEntityPresentationOverride {
  readonly kind?: number;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly fill?: number;
  readonly stroke?: number;
  readonly strokeWidth?: number;
  readonly radius?: number;
  readonly source?: string;
  readonly tint?: number;
  readonly trackFill?: number;
  readonly align?: number;
}

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
  private alphaMultipliers: ReadonlyMap<string, number>;
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
    alphaMultipliers: ReadonlyMap<string, number> = new Map(),
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

  public synchronize(
    base: RenderStoreView,
    policy: PatchMapResolvedPresentationPolicy | null,
    ranges?: readonly Readonly<{ readonly start: number; readonly end: number }>[],
    overrides: ReadonlyMap<string, PatchMapRendererEntityPresentationOverride> = this.overrides,
    alphaMultipliers: ReadonlyMap<string, number> = this.alphaMultipliers,
  ): void {
    if (base.capacity !== this.flags.length) {
      throw new RangeError('presentation store capacity changed');
    }
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
      emphasis: this.emphasis(entityId),
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
      this.opacity[slot] = (override?.opacity ?? this.base.opacity[slot] ?? 0) * this.emphasis(id);
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

  private emphasis(entityId: string): number {
    const policyMultiplier = this.policy === null ||
      this.policy.highlightedEntityIds === null ||
      this.highlighted.has(entityId)
      ? 1
      : this.policy.deEmphasisAlpha;
    return policyMultiplier * (this.alphaMultipliers.get(entityId) ?? 1);
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
