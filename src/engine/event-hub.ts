type PatchMapEventMap = Readonly<Record<string, unknown>>;

/** Owns listener identity, safe snapshot delivery, and deterministic teardown. */
export class PatchMapEventHub<Events extends PatchMapEventMap> {
  private readonly listeners = new Map<keyof Events, Set<(event: unknown) => void>>();

  public on<K extends keyof Events>(
    event: K,
    listener: (value: Events[K]) => void,
  ): () => void {
    const listeners = this.listeners.get(event) ?? new Set<(value: unknown) => void>();
    listeners.add(listener as (value: unknown) => void);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener as (value: unknown) => void);
  }

  public deliver<K extends keyof Events>(
    event: K,
    value: Events[K],
    onFailure: (error: unknown) => void,
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners === undefined) return;
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try {
        listener(value);
      } catch (error) {
        onFailure(error);
      }
    }
  }

  public get listenerCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) count += listeners.size;
    return count;
  }

  public clear(): void {
    this.listeners.clear();
  }
}
