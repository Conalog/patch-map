import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

import {
  Command,
  PROPAGATE_EVENT,
  State,
  Transformer,
  UndoRedoManager,
  uid,
} from '../src';
import { StateManager, type StateStore } from '../src/state';

class CounterCommand extends Command {
  readonly #apply: (delta: number) => void;

  public constructor(apply: (delta: number) => void) {
    super();
    this.#apply = apply;
  }

  public override execute(): void {
    this.#apply(1);
  }

  public override undo(): void {
    this.#apply(-1);
  }
}

describe('uid', () => {
  it('creates unique 15-character identifiers from the safe alphabet', () => {
    const identifiers = Array.from({ length: 1_000 }, () => uid());

    expect(identifiers.every((identifier) => /^[0-9A-Z_a-z-]{15}$/.test(identifier))).toBe(
      true,
    );
    expect(new Set(identifiers)).toHaveLength(identifiers.length);
  });
});

describe('Command and UndoRedoManager', () => {
  it('executes, undoes, redoes, and invalidates redo after a new command', async () => {
    const manager = new UndoRedoManager();
    let value = 0;
    const first = new CounterCommand((delta) => {
      value += delta;
    });
    const second = new CounterCommand((delta) => {
      value += delta * 10;
    });

    await manager.execute(first);
    expect(value).toBe(1);
    expect(manager.commands).toEqual([first]);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);

    await manager.undo();
    expect(value).toBe(0);
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(true);

    await manager.redo();
    expect(value).toBe(1);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);

    await manager.undo();
    await manager.execute(second);
    expect(value).toBe(10);
    expect(manager.canRedo()).toBe(false);
  });

  it('clears both history directions', async () => {
    const manager = new UndoRedoManager();
    const command = new CounterCommand(() => undefined);

    await manager.execute(command);
    await manager.undo();
    manager.clear();

    expect(manager.commands).toHaveLength(0);
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(false);
  });

  it('keeps the documented default capacity of 50 commands', async () => {
    const manager = new UndoRedoManager();

    for (let index = 0; index < 51; index += 1) {
      await manager.execute(new CounterCommand(() => undefined));
    }

    expect(manager.commands).toHaveLength(50);
  });

  it('emits each documented history event and the history wildcard', async () => {
    const manager = new UndoRedoManager();
    const command = new CounterCommand(() => undefined);
    const eventListeners = {
      executed: vi.fn(),
      undone: vi.fn(),
      redone: vi.fn(),
      cleared: vi.fn(),
      destroyed: vi.fn(),
      wildcard: vi.fn(),
    };

    manager.on('history:executed', eventListeners.executed);
    manager.on('history:undone', eventListeners.undone);
    manager.on('history:redone', eventListeners.redone);
    manager.on('history:cleared', eventListeners.cleared);
    manager.on('history:destroyed', eventListeners.destroyed);
    manager.on('history:*', eventListeners.wildcard);

    await manager.execute(command);
    await manager.undo();
    await manager.redo();
    manager.clear();
    manager.destroy();

    expect(eventListeners.executed).toHaveBeenCalledTimes(1);
    expect(eventListeners.undone).toHaveBeenCalledTimes(1);
    expect(eventListeners.redone).toHaveBeenCalledTimes(1);
    expect(eventListeners.cleared).toHaveBeenCalledTimes(2);
    expect(eventListeners.destroyed).toHaveBeenCalledTimes(1);
    expect(eventListeners.wildcard).toHaveBeenCalledTimes(6);
  });
});

describe('State and StateManager', () => {
  it('runs subclass lifecycle hooks and propagates handled events down the stack', () => {
    const trace: string[] = [];
    const handledEvents: unknown[] = [];
    let lowerStore: StateStore | null = null;
    let upperStore: StateStore | null = null;

    class LowerState extends State {
      public static override handledEvents = ['pointer:test'] as const;

      public override enter(store: StateStore): void {
        super.enter(store);
        lowerStore = store;
        trace.push('lower:enter');
      }

      public override exit(): void {
        trace.push('lower:exit');
      }

      public override pause(): void {
        trace.push('lower:pause');
      }

      public override resume(): void {
        trace.push('lower:resume');
      }

      public ['pointer:test'](event: unknown): void {
        handledEvents.push(event);
        trace.push('lower:event');
      }
    }

    class UpperState extends State {
      public static override handledEvents = ['pointer:test'] as const;

      public override enter(store: StateStore): void {
        super.enter(store);
        upperStore = store;
        trace.push('upper:enter');
      }

      public override exit(): void {
        trace.push('upper:exit');
      }

      public ['pointer:test'](event: unknown): typeof PROPAGATE_EVENT {
        handledEvents.push(event);
        trace.push('upper:event');
        return PROPAGATE_EVENT;
      }
    }

    const manager = new StateManager({ context: 'shared' });
    manager.register('lower', LowerState);
    manager.register('upper', UpperState);
    manager.pushState('lower');
    manager.pushState('upper');

    expect(lowerStore).toBe(upperStore);
    expect(lowerStore).toMatchObject({ context: 'shared', stateManager: manager });

    const event = { pointerId: 1 };
    manager.dispatch('pointer:test', event);
    manager.popState();
    manager.popState();

    expect(handledEvents).toEqual([event, event]);
    expect(trace).toEqual([
      'lower:enter',
      'lower:pause',
      'upper:enter',
      'upper:event',
      'lower:event',
      'upper:exit',
      'lower:resume',
      'lower:exit',
    ]);
  });
});

describe('Transformer selection', () => {
  it('reports current, added, and removed elements for add, remove, and set', () => {
    const transformer = new Transformer();
    const first = new Container();
    const second = new Container();
    const third = new Container();
    const events: Array<{
      current: Container[];
      added: Container[];
      removed: Container[];
    }> = [];

    transformer.on('update_elements', (payload: unknown) => {
      events.push(
        payload as {
          current: Container[];
          added: Container[];
          removed: Container[];
        },
      );
    });

    transformer.selection.add(first);
    transformer.selection.add(second);
    transformer.selection.remove(first);
    transformer.selection.set([first, third]);

    expect(events).toEqual([
      { current: [first], added: [first], removed: [] },
      { current: [first, second], added: [second], removed: [] },
      { current: [second], added: [], removed: [first] },
      { current: [first, third], added: [first, third], removed: [second] },
    ]);

    transformer.destroy();
  });
});
