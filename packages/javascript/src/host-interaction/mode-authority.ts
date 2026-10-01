import type {
  PatchMapInteractionMode,
  PatchMapInteractionModeOperation,
  PatchMapInteractionModeProbe,
  PatchMapInteractionModeResult,
} from './contracts';

export class PatchMapInteractionModeAuthority {
  private readonly normal: PatchMapInteractionMode;
  private readonly supported: ReadonlySet<PatchMapInteractionMode>;
  private readonly stack: PatchMapInteractionMode[] = [];
  private readonly lifecycle: string[] = [];
  private temporary: Readonly<{
    readonly state: PatchMapInteractionMode;
    readonly previous: PatchMapInteractionMode;
    readonly modifier: string;
  }> | null = null;
  private paused = false;
  private destroyed = false;

  public constructor(options: Readonly<{
    readonly normal: PatchMapInteractionMode;
    readonly modes: readonly PatchMapInteractionMode[];
  }>) {
    const supported = new Set(options.modes);
    if (!supported.has(options.normal)) {
      throw new Error('normal interaction mode must be supported');
    }
    this.normal = options.normal;
    this.supported = supported;
  }

  public apply(operation: PatchMapInteractionModeOperation): PatchMapInteractionModeResult {
    if (this.destroyed) throw new Error('PatchMap interaction mode authority is destroyed');
    const lifecycleStart = this.lifecycle.length;
    let status: PatchMapInteractionModeResult['status'] = 'unchanged';
    let code: PatchMapInteractionModeResult['code'] = null;
    if (operation.op === 'replace' || operation.op === 'push') {
      const state = this.asSupported(operation.state);
      if (state === null) {
        status = 'rejected';
        code = 'MISSING_TARGET';
      } else if (operation.op === 'replace') {
        status = this.replace(state);
      } else {
        status = this.push(state);
      }
    } else if (operation.op === 'pop') {
      status = this.pop();
    } else if (operation.op === 'pause') {
      if (!this.paused) {
        this.paused = true;
        this.lifecycle.push(`pause:${this.activeState()}`);
        status = 'changed';
      }
    } else if (operation.op === 'resume') {
      if (this.paused) {
        this.paused = false;
        this.lifecycle.push(`resume:${this.activeState()}`);
        status = 'changed';
      }
    } else if (operation.op === 'temporary') {
      const state = this.asSupported(operation.state);
      if (state === null) {
        status = 'rejected';
        code = 'MISSING_TARGET';
      } else {
        status = this.startTemporary(state, operation.modifier);
      }
    } else if (operation.op === 'release-temporary') {
      status = this.releaseTemporary(operation.modifier);
    } else {
      status = this.blur();
    }
    return Object.freeze({
      status,
      code,
      activeState: this.activeState(),
      lifecycleDelta: Object.freeze(this.lifecycle.slice(lifecycleStart)),
    });
  }

  public inputOwner(stateValue: string, input: string): string | null {
    const state = this.asSupported(stateValue);
    if (state === null || typeof input !== 'string' || input.length === 0) return null;
    if (state === 'select' && input !== 'pointer-click') return null;
    if (
      (state === 'pan' || state === 'transform' || state === 'relation-paint') &&
      input !== 'pointer-drag'
    ) {
      return null;
    }
    return state;
  }

  public probe(): PatchMapInteractionModeProbe {
    return Object.freeze({
      activeState: this.activeState(),
      stack: Object.freeze([...this.stack]),
      lifecycle: Object.freeze([...this.lifecycle]),
      temporaryModeCount: this.temporary === null ? 0 : 1,
      temporaryModifiers: Object.freeze(
        this.temporary === null ? [] : [this.temporary.modifier],
      ),
      captureCount: 0,
      activeOwnerCount: this.destroyed ? 0 : 1,
      paused: this.paused,
      destroyed: this.destroyed,
    });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.stack.splice(0);
    this.temporary = null;
    this.paused = false;
    this.destroyed = true;
  }

  private replace(state: PatchMapInteractionMode): 'changed' | 'unchanged' {
    if (this.stack.length === 1 && this.stack[0] === state) return 'unchanged';
    if (this.stack.length > 0) this.lifecycle.push(`exit:${this.activeState()}`);
    this.stack.splice(0, this.stack.length, state);
    this.lifecycle.push(`enter:${state}`);
    this.temporary = null;
    this.paused = false;
    return 'changed';
  }

  private push(state: PatchMapInteractionMode): 'changed' | 'unchanged' {
    if (this.activeState() === state) return 'unchanged';
    if (this.stack.length > 0) this.lifecycle.push(`exit:${this.activeState()}`);
    this.stack.push(state);
    this.lifecycle.push(`enter:${state}`);
    this.temporary = null;
    this.paused = false;
    return 'changed';
  }

  private pop(): 'changed' | 'unchanged' {
    if (this.stack.length <= 1) return 'unchanged';
    this.lifecycle.push(`exit:${this.activeState()}`);
    this.stack.pop();
    this.lifecycle.push(`enter:${this.activeState()}`);
    this.temporary = null;
    this.paused = false;
    return 'changed';
  }

  private startTemporary(
    state: PatchMapInteractionMode,
    modifier: string,
  ): 'changed' | 'unchanged' {
    if (typeof modifier !== 'string' || modifier.length === 0) {
      throw new TypeError('temporary mode modifier must be a non-empty string');
    }
    if (this.temporary !== null) return 'unchanged';
    const previous = this.activeState();
    this.temporary = Object.freeze({ state, previous, modifier });
    if (state === previous) return 'changed';
    this.lifecycle.push(`exit:${previous}`, `enter:${state}`);
    return 'changed';
  }

  private releaseTemporary(modifier: string): 'changed' | 'unchanged' {
    const temporary = this.temporary;
    if (temporary === null || temporary.modifier !== modifier) return 'unchanged';
    this.temporary = null;
    if (temporary.state !== temporary.previous) {
      this.lifecycle.push(`exit:${temporary.state}`, `enter:${temporary.previous}`);
    }
    return 'changed';
  }

  private blur(): 'changed' | 'unchanged' {
    const before = this.activeState();
    const hadTemporary = this.temporary !== null;
    const wasPaused = this.paused;
    this.temporary = null;
    this.paused = false;
    if (before !== this.normal) {
      this.lifecycle.push(`exit:${before}`, `enter:${this.normal}`);
      this.stack.splice(0, this.stack.length, this.normal);
      return 'changed';
    }
    if (this.stack.length === 0) this.stack.push(this.normal);
    else this.stack.splice(0, this.stack.length, this.normal);
    return hadTemporary || wasPaused ? 'changed' : 'unchanged';
  }

  private activeState(): PatchMapInteractionMode {
    return this.temporary?.state ?? this.stack.at(-1) ?? this.normal;
  }

  private asSupported(value: string): PatchMapInteractionMode | null {
    return this.supported.has(value as PatchMapInteractionMode)
      ? value as PatchMapInteractionMode
      : null;
  }
}
