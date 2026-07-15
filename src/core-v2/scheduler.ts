export interface FrameDriver {
  readonly now: () => number;
  readonly request: (callback: FrameRequestCallback) => number;
  readonly cancel: (handle: number) => void;
}

export interface FrameSchedulerDebug {
  readonly pending: boolean;
  readonly continuous: boolean;
  readonly frameCount: number;
  readonly lastReason: string;
  readonly destroyed: boolean;
}

export class InvalidationScheduler {
  private readonly driver: FrameDriver;
  private readonly render: (timeMs: number) => boolean;
  private handle: number | null = null;
  private continuous = false;
  private frameCount = 0;
  private lastReason = 'init';
  private destroyed = false;
  private readonly onFrame = (timeMs: number): void => {
    this.handle = null;
    if (this.destroyed) return;
    this.frameCount += 1;
    const continueRendering = this.render(timeMs);
    if (this.continuous || continueRendering) this.schedule();
  };

  public constructor(render: (timeMs: number) => boolean, driver = browserFrameDriver()) {
    this.render = render;
    this.driver = driver;
  }

  public invalidate(reason: string): void {
    if (this.destroyed) return;
    this.lastReason = reason;
    this.schedule();
  }

  public setContinuous(value: boolean, reason: string): void {
    if (this.destroyed || this.continuous === value) return;
    this.continuous = value;
    this.lastReason = reason;
    if (value) this.schedule();
  }

  public flushNow(reason = 'manual'): void {
    if (this.destroyed) return;
    this.lastReason = reason;
    if (this.handle !== null) {
      this.driver.cancel(this.handle);
      this.handle = null;
    }
    this.frameCount += 1;
    const continueRendering = this.render(this.driver.now());
    if (this.continuous || continueRendering) this.schedule();
  }

  public cancelPending(): boolean {
    if (this.handle === null) return false;
    this.driver.cancel(this.handle);
    this.handle = null;
    return true;
  }

  public debugSnapshot(): FrameSchedulerDebug {
    return Object.freeze({
      pending: this.handle !== null,
      continuous: this.continuous,
      frameCount: this.frameCount,
      lastReason: this.lastReason,
      destroyed: this.destroyed,
    });
  }

  public destroy(): boolean {
    if (this.destroyed) return false;
    this.destroyed = true;
    this.continuous = false;
    this.cancelPending();
    return true;
  }

  private schedule(): void {
    if (this.handle !== null || this.destroyed) return;
    this.handle = this.driver.request(this.onFrame);
  }
}

export function browserFrameDriver(): FrameDriver {
  const fallback = fallbackFrameDriver();
  const request = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  if (typeof request !== 'function' || typeof cancel !== 'function') return fallback;
  return {
    now: () => globalThis.performance?.now() ?? Date.now(),
    request: (callback) => request(callback),
    cancel: (handle) => cancel(handle),
  };
}

function fallbackFrameDriver(): FrameDriver {
  let nextHandle = 1;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  return {
    now: () => globalThis.performance?.now() ?? Date.now(),
    request: (callback) => {
      const handle = nextHandle++;
      const timer = setTimeout(() => {
        timers.delete(handle);
        callback(globalThis.performance?.now() ?? Date.now());
      }, 16);
      timers.set(handle, timer);
      return handle;
    },
    cancel: (handle) => {
      const timer = timers.get(handle);
      if (timer) clearTimeout(timer);
      timers.delete(handle);
    },
  };
}
