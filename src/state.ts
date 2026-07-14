import EventEmitter from 'eventemitter3';

export const PROPAGATE_EVENT = Symbol('PATCH_MAP_PROPAGATE_EVENT');

export interface StateStore {
  stateManager: StateManager;
  [key: string]: unknown;
}

export class State {
  public static handledEvents: readonly string[] = [];
  public store: StateStore | null = null;

  public enter(store: StateStore, ..._options: unknown[]): void {
    this.store = store;
  }

  public exit(): void {}

  public pause(): void {}

  public resume(): void {}

  public destroy(): void {
    this.store = null;
  }
}

export type StateConstructor<T extends State = State> = new () => T;

interface StateEntry {
  name: string;
  instance: State;
}

export class StateManager extends EventEmitter {
  readonly #registry = new Map<string, StateConstructor>();
  readonly #stack: StateEntry[] = [];
  readonly #store: StateStore;
  readonly #modifiers = new Set<string>();
  #destroyed = false;

  public constructor(store: Omit<StateStore, 'stateManager'> = {}) {
    super();
    this.#store = { ...store, stateManager: this };
  }

  public register(name: string, StateClass: StateConstructor): void {
    if (this.#destroyed) return;
    this.#registry.set(name, StateClass);
  }

  public unregister(name: string): boolean {
    return this.#registry.delete(name);
  }

  public pushState(name: string, ...options: unknown[]): State | null {
    if (this.#destroyed) return null;
    const StateClass = this.#registry.get(name);
    if (!StateClass) return null;
    this.#stack.at(-1)?.instance.pause();
    const instance = new StateClass();
    instance.enter(this.#store, ...options);
    this.#stack.push({ name, instance });
    this.#emitState('state:pushed', instance);
    return instance;
  }

  public popState(): State | null {
    const entry = this.#stack.pop();
    if (!entry) return null;
    entry.instance.exit();
    entry.instance.destroy();
    this.#stack.at(-1)?.instance.resume();
    this.#emitState('state:popped', entry.instance);
    return entry.instance;
  }

  public setState(name?: string, ...options: unknown[]): void {
    if (this.#destroyed) return;
    this.#reset(true);
    if (name === undefined) return;
    const state = this.pushState(name, ...options);
    if (state) this.#emitState('state:set', state);
  }

  public resetState(): void {
    this.#reset(true);
  }

  public activateModifier(name: string, event?: unknown): void {
    if (
      this.#destroyed ||
      this.#modifiers.has(name) ||
      !this.#isKnownModifier(name)
    ) return;
    this.#modifiers.add(name);
    this.#emitModifier('modifier:activated', event ?? this);
  }

  public deactivateModifier(name: string, event?: unknown): void {
    if (this.#destroyed || !this.#modifiers.delete(name)) return;
    this.#emitModifier('modifier:deactivated', event ?? this);
  }

  public isModifierActive(name: string): boolean {
    return this.#modifiers.has(name);
  }

  public get current(): State | null {
    return this.#stack.at(-1)?.instance ?? null;
  }

  public dispatch(eventName: string, event: unknown): unknown {
    for (let index = this.#stack.length - 1; index >= 0; index -= 1) {
      const entry = this.#stack[index];
      if (!entry) continue;
      const StateClass = entry.instance.constructor as typeof State;
      if (!StateClass.handledEvents.includes(eventName)) continue;
      const handler = (entry.instance as unknown as Record<string, unknown>)[eventName];
      if (typeof handler !== 'function') continue;
      const result: unknown = Reflect.apply(handler, entry.instance, [event]);
      if (result !== PROPAGATE_EVENT) return result;
    }
    return PROPAGATE_EVENT;
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#reset(true);
    this.#modifiers.clear();
    this.#registry.clear();
    this.#destroyed = true;
    this.#emitState('state:destroyed', this);
    this.removeAllListeners();
  }

  #reset(emit: boolean): void {
    while (this.#stack.length) {
      const entry = this.#stack.pop();
      entry?.instance.exit();
      entry?.instance.destroy();
    }
    if (emit) this.#emitState('state:reset', { target: this });
  }

  #emitState(event: string, target: unknown): void {
    const payload = { target };
    this.emit(event, payload);
    this.emit('state:*', event, payload);
  }

  #emitModifier(event: string, target: unknown): void {
    const payload = { target };
    this.emit(event, payload);
    this.emit('modifier:*', event, payload);
  }

  #isKnownModifier(name: string): boolean {
    return (
      this.#registry.has(name) ||
      name === 'shift' ||
      name === 'control' ||
      name === 'meta' ||
      name === 'alt'
    );
  }
}
