import { describe, expect, it, vi } from 'vitest';

import { Command, UndoRedoManager } from '../src/history';

class ValueCommand extends Command {
  readonly #apply: (value: number) => void;
  readonly #before: number;
  readonly #after: number;
  readonly #trace: string[] | undefined;

  public constructor(
    before: number,
    after: number,
    apply: (value: number) => void,
    trace?: string[],
  ) {
    super(`value:${before}->${after}`);
    this.#before = before;
    this.#after = after;
    this.#apply = apply;
    this.#trace = trace;
  }

  public override execute(): void {
    this.#trace?.push(`execute:${this.#after}`);
    this.#apply(this.#after);
  }

  public override undo(): void {
    this.#trace?.push(`undo:${this.#before}`);
    this.#apply(this.#before);
  }
}

class AsyncValueCommand extends Command {
  readonly #apply: (value: number) => void;
  readonly #before: number;
  readonly #after: number;
  readonly #trace: string[];

  public constructor(
    before: number,
    after: number,
    apply: (value: number) => void,
    trace: string[],
  ) {
    super(`async:${before}->${after}`);
    this.#before = before;
    this.#after = after;
    this.#apply = apply;
    this.#trace = trace;
  }

  public override async execute(): Promise<void> {
    this.#trace.push(`execute:start:${this.#after}`);
    await Promise.resolve();
    this.#apply(this.#after);
    this.#trace.push(`execute:end:${this.#after}`);
  }

  public override async undo(): Promise<void> {
    this.#trace.push(`undo:start:${this.#before}`);
    await Promise.resolve();
    this.#apply(this.#before);
    this.#trace.push(`undo:end:${this.#before}`);
  }
}

describe('Command', () => {
  it('preserves omitted and explicit IDs and provides overridable no-op methods', () => {
    const omitted = new Command();
    const command = new Command('documented-command');
    const objectId = { id: 'documented-object' };

    expect(omitted.id).toBeUndefined();
    expect(command.id).toBe('documented-command');
    expect(new Command(objectId).id).toBe(objectId);
    expect(new Command(null).id).toBeNull();
    expect(command.execute()).toBeUndefined();
    expect(command.undo()).toBeUndefined();
  });
});

describe('UndoRedoManager history groups', () => {
  it('undoes equal-historyId commands as one step back to the pre-group state', async () => {
    const manager = new UndoRedoManager();
    const trace: string[] = [];
    let value = 0;
    const apply = (next: number): void => {
      value = next;
    };
    const first = new ValueCommand(0, 1, apply, trace);
    const second = new ValueCommand(1, 2, apply, trace);
    const final = new ValueCommand(2, 3, apply, trace);

    await manager.execute(first, { historyId: 'drag:1' });
    await manager.execute(second, { historyId: 'drag:1' });
    await manager.execute(final, { historyId: 'drag:1' });

    expect(value).toBe(3);
    expect(manager.commands).toEqual([final]);

    trace.length = 0;
    void manager.undo();

    expect(value).toBe(0);
    expect(trace).toEqual(['undo:2', 'undo:1', 'undo:0']);
    expect(manager.commands).toEqual([final]);
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(true);
  });

  it('redoes a history group in execution order to restore its final state', async () => {
    const manager = new UndoRedoManager();
    const trace: string[] = [];
    let value = 0;
    const apply = (next: number): void => {
      value = next;
    };

    await manager.execute(new ValueCommand(0, 1, apply, trace), { historyId: 'drag:2' });
    await manager.execute(new ValueCommand(1, 2, apply, trace), { historyId: 'drag:2' });
    await manager.execute(new ValueCommand(2, 3, apply, trace), { historyId: 'drag:2' });
    await manager.undo();

    trace.length = 0;
    void manager.redo();

    expect(value).toBe(3);
    expect(trace).toEqual(['execute:1', 'execute:2', 'execute:3']);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);
  });

  it('keeps different and noncontiguous history IDs as separate undo steps', async () => {
    const manager = new UndoRedoManager();
    let value = 0;
    const apply = (next: number): void => {
      value = next;
    };
    const first = new ValueCommand(0, 1, apply);
    const second = new ValueCommand(1, 2, apply);
    const third = new ValueCommand(2, 3, apply);

    await manager.execute(first, { historyId: 'gesture' });
    await manager.execute(second, { historyId: 'other' });
    await manager.execute(third, { historyId: 'gesture' });

    expect(manager.commands).toEqual([first, second, third]);
    void manager.undo();
    expect(value).toBe(2);
    void manager.undo();
    expect(value).toBe(1);
    void manager.undo();
    expect(value).toBe(0);
  });

  it('sequences asynchronous group undo and redo operations', async () => {
    const manager = new UndoRedoManager();
    const trace: string[] = [];
    let value = 0;
    const apply = (next: number): void => {
      value = next;
    };

    await manager.execute(new AsyncValueCommand(0, 1, apply, trace), {
      historyId: 'async-group',
    });
    await manager.execute(new AsyncValueCommand(1, 2, apply, trace), {
      historyId: 'async-group',
    });

    trace.length = 0;
    void manager.undo();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(value).toBe(0);
    expect(trace).toEqual([
      'undo:start:1',
      'undo:end:1',
      'undo:start:0',
      'undo:end:0',
    ]);

    trace.length = 0;
    void manager.redo();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(value).toBe(2);
    expect(trace).toEqual([
      'execute:start:1',
      'execute:end:1',
      'execute:start:2',
      'execute:end:2',
    ]);
  });

  it('counts each group as one capacity slot and emits one undo/redo event per group', async () => {
    const manager = new UndoRedoManager(2);
    const undone = vi.fn();
    const redone = vi.fn();
    let value = 0;
    const apply = (next: number): void => {
      value = next;
    };
    const first = new ValueCommand(0, 1, apply);
    const groupedFinal = new ValueCommand(1, 2, apply);
    const secondStep = new ValueCommand(2, 3, apply);

    manager.on('history:undone', undone);
    manager.on('history:redone', redone);
    await manager.execute(first, { historyId: 'group' });
    await manager.execute(groupedFinal, { historyId: 'group' });
    await manager.execute(secondStep);

    expect(manager.commands).toEqual([groupedFinal, secondStep]);
    void manager.undo();
    void manager.undo();
    expect(value).toBe(0);
    expect(undone).toHaveBeenCalledTimes(2);

    void manager.redo();
    expect(value).toBe(2);
    expect(redone).toHaveBeenCalledTimes(1);
  });

  it('returns undefined while preserving authored async settlement and rejected history', async () => {
    const manager = new UndoRedoManager();
    let settlement: Promise<number> | undefined;

    class AuthoredAsyncCommand extends Command {
      public override execute(): Promise<number> {
        settlement = Promise.resolve(7);
        return settlement;
      }
    }

    const command = new AuthoredAsyncCommand('async-public-return');
    expect(manager.execute(command)).toBeUndefined();
    expect(manager.commands).toEqual([command]);
    expect(await settlement).toBe(7);

    class RejectingCommand extends Command {
      public override execute(): Promise<never> {
        return Promise.reject(new Error('authored rejection'));
      }
    }

    expect(manager.execute(new RejectingCommand('reject'))).toBeUndefined();
    expect(manager.commands.map(({ id }) => id)).toEqual([
      'async-public-return',
      'reject',
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('emits one payload to both specific and wildcard listeners and clears on destroy', () => {
    const manager = new UndoRedoManager();
    const command = new ValueCommand(0, 1, () => undefined);
    const executed = vi.fn();
    const wildcard = vi.fn();
    const cleared = vi.fn();
    const destroyed = vi.fn();
    manager.on('history:executed', executed);
    manager.on('history:*', wildcard);
    manager.on('history:cleared', cleared);
    manager.on('history:destroyed', destroyed);

    expect(manager.execute(command)).toBeUndefined();
    expect(executed).toHaveBeenCalledTimes(1);
    expect(wildcard).toHaveBeenLastCalledWith(executed.mock.calls[0]?.[0]);

    expect(manager.destroy()).toBeUndefined();
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(destroyed).toHaveBeenCalledTimes(1);
    expect(wildcard).toHaveBeenCalledTimes(3);
    expect(manager.commands).toEqual([]);
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(false);
  });
});
