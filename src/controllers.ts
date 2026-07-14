import type { Container } from 'pixi.js';

export const APPLY_VIEW_TRANSFORM = Symbol('PATCH_MAP_APPLY_VIEW_TRANSFORM');

export interface ControllerHost {
  world: Container | null;
  emit(event: string, payload: unknown): boolean;
  [APPLY_VIEW_TRANSFORM](): void;
}

export class RotationController {
  #value = 0;
  readonly #host: ControllerHost;

  public constructor(host: ControllerHost) {
    this.#host = host;
  }

  public get value(): number {
    return this.#value;
  }

  public set value(value: number) {
    if (!Number.isFinite(value)) return;
    this.#value = value;
    if (this.#host.world) this.#host.world.angle = value;
    this.#host[APPLY_VIEW_TRANSFORM]();
    this.#host.emit('patchmap:rotated', { target: this.#host, value });
  }

  public rotateBy(value: number): number {
    this.value = this.#value + value;
    return this.#value;
  }

  public reset(): number {
    this.value = 0;
    return this.#value;
  }

  /** Restore the pre-initialized controller state without publishing an event. */
  public restoreInitialState(): void {
    this.#value = 0;
  }

  public apply(): void {
    if (this.#host.world) this.#host.world.angle = this.#value;
    this.#host[APPLY_VIEW_TRANSFORM]();
  }
}

export class FlipController {
  #x = false;
  #y = false;
  readonly #host: ControllerHost;

  public constructor(host: ControllerHost) {
    this.#host = host;
  }

  public get x(): boolean {
    return this.#x;
  }

  public set x(value: boolean) {
    this.#x = Boolean(value);
    this.#applyAndEmit();
  }

  public get y(): boolean {
    return this.#y;
  }

  public set y(value: boolean) {
    this.#y = Boolean(value);
    this.#applyAndEmit();
  }

  public set(value: { x?: boolean; y?: boolean }): { x: boolean; y: boolean } {
    if (value.x !== undefined) this.#x = Boolean(value.x);
    if (value.y !== undefined) this.#y = Boolean(value.y);
    this.#applyAndEmit();
    return { x: this.#x, y: this.#y };
  }

  public toggleX(): { x: boolean; y: boolean } {
    this.x = !this.#x;
    return { x: this.#x, y: this.#y };
  }

  public toggleY(): { x: boolean; y: boolean } {
    this.y = !this.#y;
    return { x: this.#x, y: this.#y };
  }

  public reset(): { x: boolean; y: boolean } {
    this.#x = false;
    this.#y = false;
    this.#applyAndEmit();
    return { x: false, y: false };
  }

  /** Restore the pre-initialized controller state without publishing an event. */
  public restoreInitialState(): void {
    this.#x = false;
    this.#y = false;
  }

  public apply(): void {
    this.#apply(false);
  }

  #applyAndEmit(): void {
    this.#apply(true);
  }

  #apply(emit: boolean): void {
    const world = this.#host.world;
    if (world) {
      world.scale.set(this.#x ? -1 : 1, this.#y ? -1 : 1);
    }
    this.#host[APPLY_VIEW_TRANSFORM]();
    if (emit) {
      this.#host.emit('patchmap:flipped', {
        target: this.#host,
        x: this.#x,
        y: this.#y,
      });
    }
  }
}
