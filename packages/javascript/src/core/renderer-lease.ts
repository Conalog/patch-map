import type { CoreView } from '../dense/contracts';
import type {
  CoreRenderer,
  RendererFlushResult,
  RenderStoreView,
} from '../dense/renderer-types';

/**
 * CoreScene owns the lifecycle of the renderer it receives. PatchMap instead
 * owns one Pixi renderer across private candidate scenes, so each scene gets a
 * revocable forwarding lease whose destroy never tears down the shared GPU
 * Application.
 */
export class PatchMapRendererLease implements CoreRenderer {
  private destroyedValue = false;

  public constructor(private readonly renderer: CoreRenderer) {}

  public get width(): number {
    return this.destroyedValue ? 0 : this.renderer.width;
  }

  public get height(): number {
    return this.destroyedValue ? 0 : this.renderer.height;
  }

  public get pixelRatio(): number {
    return this.destroyedValue ? 1 : this.renderer.pixelRatio;
  }

  public get destroyed(): boolean {
    return this.destroyedValue;
  }

  public resize(width: number, height: number, pixelRatio?: number): boolean {
    this.assertAlive();
    return this.renderer.resize(width, height, pixelRatio);
  }

  public setView(view: CoreView): boolean {
    this.assertAlive();
    return this.renderer.setView(view);
  }

  public flush(store: RenderStoreView): RendererFlushResult {
    this.assertAlive();
    return this.renderer.flush(store);
  }

  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyedValue = true;
    return true;
  }

  private assertAlive(): void {
    if (this.destroyedValue) throw new Error('PatchMapRuntime renderer lease is destroyed');
  }
}
