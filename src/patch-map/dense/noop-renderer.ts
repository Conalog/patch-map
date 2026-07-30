import type { CoreView } from './contracts';
import type { CoreRenderer, RendererFlushResult, RenderStoreView } from './renderer-types';

const NO_RENDER = Object.freeze({ rendered: false, commandCount: 0 });

/** Headless backend that preserves explicit renderer lifecycle boundaries. */
export class NoopRenderer implements CoreRenderer {
  public width = 0;
  public height = 0;
  public pixelRatio = 1;
  public destroyed = false;
  private viewX = 0;
  private viewY = 0;
  private viewScale = 1;
  private viewRotation = 0;

  public resize(width: number, height: number, pixelRatio = 1): boolean {
    this.#assertAlive();
    assertViewport(width, height, pixelRatio);
    if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) {
      return false;
    }
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    return true;
  }

  public setView(view: CoreView): boolean {
    this.#assertAlive();
    assertView(view);
    const rotation = view.rotation ?? 0;
    if (
      view.x === this.viewX &&
      view.y === this.viewY &&
      view.scale === this.viewScale &&
      rotation === this.viewRotation
    ) {
      return false;
    }
    this.viewX = view.x;
    this.viewY = view.y;
    this.viewScale = view.scale;
    this.viewRotation = rotation;
    return true;
  }

  public flush(store: RenderStoreView): RendererFlushResult {
    this.#assertAlive();
    this.setView(store.view);
    return NO_RENDER;
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.width = 0;
    this.height = 0;
    this.pixelRatio = 1;
    this.viewX = 0;
    this.viewY = 0;
    this.viewScale = 1;
    this.viewRotation = 0;
    return true;
  }

  #assertAlive(): void {
    if (this.destroyed) throw new Error('Renderer is destroyed');
  }
}

export function assertViewport(width: number, height: number, pixelRatio: number): void {
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError('Renderer width must be a finite non-negative number');
  }
  if (!Number.isFinite(height) || height < 0) {
    throw new RangeError('Renderer height must be a finite non-negative number');
  }
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new RangeError('Renderer pixelRatio must be a finite positive number');
  }
}

export function assertView(view: CoreView): void {
  if (
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y) ||
    !Number.isFinite(view.scale) ||
    view.scale <= 0 ||
    !Number.isFinite(view.rotation ?? 0)
  ) {
    throw new RangeError('Renderer view must contain finite x/y/rotation and positive scale');
  }
}
