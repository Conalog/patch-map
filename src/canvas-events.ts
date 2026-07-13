import type { Container } from 'pixi.js';

import type { CanvasEventAddOptions } from './contracts';
import { uid } from './utils';

export interface CanvasEventRegistration<TEvent = unknown>
  extends CanvasEventAddOptions<TEvent> {
  id: string;
  enabled: boolean;
}

interface StoredCanvasEvent<TEvent = unknown> {
  public: CanvasEventRegistration<TEvent>;
  actions: string[];
  targets: Container[];
}

interface TargetState {
  bindings: number;
  eventMode: Container['eventMode'];
}

const words = (value: string): string[] => [
  ...new Set(value.split(/\s+/u).map((word) => word.trim()).filter(Boolean)),
];

export class CanvasEventManager {
  readonly #resolveTargets: (path: string) => Container[];
  readonly #events = new Map<string, StoredCanvasEvent>();
  readonly #targetStates = new Map<Container, TargetState>();

  public constructor(resolveTargets: (path: string) => Container[]) {
    this.#resolveTargets = resolveTargets;
  }

  public add<TEvent = unknown>(
    options: CanvasEventAddOptions<TEvent>,
  ): string {
    if (typeof options.path !== 'string' || options.path.length === 0) {
      throw new TypeError('Canvas event path must be a non-empty string.');
    }
    if (typeof options.fn !== 'function') {
      throw new TypeError('Canvas event fn must be a function.');
    }
    const actions = words(options.action);
    if (actions.length === 0) {
      throw new TypeError('Canvas event action must name at least one event.');
    }

    const id = options.id ?? uid();
    this.remove(id);
    const targets = [...new Set(this.#resolveTargets(options.path))];
    const registration: CanvasEventRegistration<TEvent> = {
      ...options,
      id,
      enabled: true,
    };
    const stored: StoredCanvasEvent<TEvent> = {
      public: registration,
      actions,
      targets,
    };
    this.#events.set(id, stored as StoredCanvasEvent);
    this.#attach(stored as StoredCanvasEvent);
    return id;
  }

  public remove(ids: string): boolean {
    let removed = false;
    for (const id of words(ids)) {
      const stored = this.#events.get(id);
      if (!stored) continue;
      if (stored.public.enabled) this.#detach(stored);
      this.#events.delete(id);
      removed = true;
    }
    return removed;
  }

  public removeAll(): void {
    for (const stored of this.#events.values()) {
      if (stored.public.enabled) this.#detach(stored);
    }
    this.#events.clear();
  }

  public on(ids: string): void {
    for (const id of words(ids)) {
      const stored = this.#events.get(id);
      if (!stored || stored.public.enabled) continue;
      stored.public.enabled = true;
      this.#attach(stored);
    }
  }

  public off(ids: string): void {
    for (const id of words(ids)) {
      const stored = this.#events.get(id);
      if (!stored?.public.enabled) continue;
      this.#detach(stored);
      stored.public.enabled = false;
    }
  }

  public get(id: string): CanvasEventRegistration | undefined {
    return this.#events.get(id)?.public;
  }

  public getAll(): CanvasEventRegistration[] {
    return [...this.#events.values()].map((stored) => stored.public);
  }

  /** Re-resolve live paths after an in-place structural scene update. */
  public refresh(): void {
    for (const stored of this.#events.values()) {
      const enabled = stored.public.enabled;
      if (enabled) this.#detach(stored);
      stored.targets = [...new Set(this.#resolveTargets(stored.public.path))];
      if (enabled) this.#attach(stored);
    }
  }

  public destroy(): void {
    this.removeAll();
    this.#targetStates.clear();
  }

  #attach(stored: StoredCanvasEvent): void {
    for (const target of stored.targets) {
      for (const action of stored.actions) {
        const state = this.#targetStates.get(target) ?? {
          bindings: 0,
          eventMode: target.eventMode,
        };
        if (state.bindings === 0) target.eventMode = 'static';
        target.on(action, stored.public.fn);
        state.bindings += 1;
        this.#targetStates.set(target, state);
      }
    }
  }

  #detach(stored: StoredCanvasEvent): void {
    for (const target of stored.targets) {
      for (const action of stored.actions) {
        if (!target.destroyed) target.off(action, stored.public.fn);
        const state = this.#targetStates.get(target);
        if (!state) continue;
        state.bindings -= 1;
        if (state.bindings <= 0) {
          if (!target.destroyed) {
            if (state.eventMode === undefined) {
              Reflect.set(target, 'eventMode', undefined);
            } else {
              target.eventMode = state.eventMode;
            }
          }
          this.#targetStates.delete(target);
        }
      }
    }
  }
}
