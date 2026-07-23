import {
  RenderFlags,
  type RenderStoreView,
} from '../../core-v1/renderer/types';
import type { CoreView, Rgba } from '../../core-v1/contracts';
import type { CoreV2ResolvedPresentationPolicy } from '../presentation-policy';

/**
 * Stable renderer-only view over the dense store.
 *
 * Only `flags` and `opacity` are materialized. Every other column remains a
 * direct view of the authoritative dense store. Dirty-range synchronization
 * keeps normal updates incremental while a host presentation policy is active.
 */
export class CoreV2PresentationStoreView implements RenderStoreView {
  private base: RenderStoreView;
  private policy: CoreV2ResolvedPresentationPolicy;
  private readonly highlighted = new Set<string>();
  private readonly hidden = new Set<string>();

  public readonly flags: Uint8Array;
  public readonly opacity: Float32Array;

  public constructor(
    base: RenderStoreView,
    policy: CoreV2ResolvedPresentationPolicy,
  ) {
    this.base = base;
    this.policy = policy;
    this.flags = new Uint8Array(base.capacity);
    this.opacity = new Float32Array(base.capacity);
    this.synchronize(base, policy);
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

  public get kind(): ArrayLike<number> {
    return this.base.kind;
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

  public get fill(): ArrayLike<number> {
    return this.base.fill;
  }

  public get stroke(): ArrayLike<number> {
    return this.base.stroke;
  }

  public get strokeWidth(): ArrayLike<number> {
    return this.base.strokeWidth;
  }

  public get radius(): ArrayLike<number> {
    return this.base.radius;
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

  public get align(): ArrayLike<number> {
    return this.base.align;
  }

  public get maxLines(): ArrayLike<number> {
    return this.base.maxLines;
  }

  public get source(): readonly string[] {
    return this.base.source;
  }

  public get tint(): ArrayLike<number> {
    return this.base.tint;
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

  public get trackFill(): ArrayLike<number> {
    return this.base.trackFill;
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

  public synchronize(
    base: RenderStoreView,
    policy: CoreV2ResolvedPresentationPolicy,
    ranges?: readonly Readonly<{ readonly start: number; readonly end: number }>[],
  ): void {
    if (base.capacity !== this.flags.length) {
      throw new RangeError('presentation store capacity changed');
    }
    this.base = base;
    this.policy = policy;
    replaceSet(this.highlighted, policy.highlightedEntityIds ?? []);
    replaceSet(this.hidden, policy.hiddenEntityIds);
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
  }> | null {
    const slot = this.base.ids.indexOf(entityId);
    if (slot < 0 || (this.base.alive[slot] ?? 0) === 0) return null;
    const visible = ((this.flags[slot] ?? 0) & RenderFlags.Visible) !== 0 &&
      (this.opacity[slot] ?? 0) > 0;
    return Object.freeze({
      emphasis: this.emphasis(entityId),
      visible,
      renderObjectCount: visible ? 1 : 0,
    });
  }

  private synchronizeRange(startValue: number, endValue: number): void {
    const start = Math.max(0, Math.min(this.base.capacity, Math.trunc(startValue)));
    const end = Math.max(start, Math.min(this.base.capacity, Math.trunc(endValue)));
    for (let slot = start; slot < end; slot += 1) {
      const id = this.base.ids[slot] ?? '';
      const hidden = this.hidden.has(id);
      const flags = this.base.flags[slot] ?? 0;
      this.flags[slot] = hidden ? flags & ~RenderFlags.Visible : flags;
      this.opacity[slot] = (this.base.opacity[slot] ?? 0) * this.emphasis(id);
    }
  }

  private emphasis(entityId: string): number {
    return this.policy.highlightedEntityIds === null || this.highlighted.has(entityId)
      ? 1
      : this.policy.deEmphasisAlpha;
  }
}

function replaceSet(target: Set<string>, values: readonly string[]): void {
  target.clear();
  for (const value of values) target.add(value);
}
