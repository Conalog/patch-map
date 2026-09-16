import type { PatchMapBrushApi, PatchMapBrushChange, PatchMapBrushState } from '../public/contracts';

/** Mode state is independent of the gesture that temporarily uses it. */
export class BrushModeAuthority implements PatchMapBrushApi {
  private destroyed = false;
  private current: PatchMapBrushState = Object.freeze({ enabled: false, drawing: false });
  private readonly listeners = new Set<(event: PatchMapBrushChange) => void>();
  public constructor(
    private readonly assertLive: () => void,
    private readonly cancel: () => void,
    private readonly failed: () => void,
  ) {}
  public get state(): PatchMapBrushState { return this.current; }
  public enable(): PatchMapBrushState { return this.set(true); }
  public disable(): PatchMapBrushState { return this.set(false); }
  public toggle(): PatchMapBrushState { return this.set(!this.current.enabled); }
  private set(enabled: boolean): PatchMapBrushState {
    this.assertLive();
    this.cancel();
    this.assertLive();
    this.publish(enabled, false, 'api');
    return this.current;
  }
  public publish(enabled: boolean, drawing: boolean, source: PatchMapBrushChange['source']): void {
    if (this.destroyed) return;
    if (enabled === this.current.enabled && drawing === this.current.drawing) return;
    this.current = Object.freeze({ enabled, drawing });
    const event = Object.freeze({ state: this.current, source });
    for (const listener of [...this.listeners]) {
      if (this.current !== event.state) break;
      if (!this.listeners.has(listener)) continue;
      try { listener(event); } catch { this.failed(); }
    }
  }
  public onChange(listener: (event: PatchMapBrushChange) => void): () => void {
    this.assertLive();
    if (typeof listener !== 'function') throw new TypeError('brush listener must be a function');
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  public destroy(): void {
    this.destroyed = true;
    this.listeners.clear();
    this.current = Object.freeze({ enabled: false, drawing: false });
  }
}
