import EventEmitter from 'eventemitter3';

import { uid } from './utils';

export class Command {
  public readonly id: string;

  public constructor(id = uid()) {
    this.id = id;
  }

  public execute(): void | Promise<void> {}

  public undo(): void | Promise<void> {}
}

export interface ExecuteCommandOptions {
  historyId?: string;
}

interface HistoryEntry {
  commands: Command[];
  historyId: string | null;
}

type CommandMethod = 'execute' | 'undo';

const isPromiseLike = (value: void | Promise<void>): value is Promise<void> =>
  value !== undefined && typeof value.then === 'function';

const runCommands = (
  commands: readonly Command[],
  method: CommandMethod,
): void | Promise<void> => {
  let pending: Promise<void> | undefined;

  for (const command of commands) {
    if (pending) {
      pending = pending.then(() => command[method]()).then(() => undefined);
      continue;
    }

    const result = command[method]();
    if (isPromiseLike(result)) {
      pending = Promise.resolve(result).then(() => undefined);
    }
  }

  return pending;
};

export class UndoRedoManager extends EventEmitter {
  readonly #limit: number;
  #done: HistoryEntry[] = [];
  #undone: HistoryEntry[] = [];
  #destroyed = false;

  public constructor(limit = 50) {
    super();
    this.#limit = Math.max(1, Math.trunc(limit));
  }

  public get commands(): readonly Command[] {
    return this.#done.map(({ commands }) => commands[commands.length - 1] as Command);
  }

  public execute(command: Command, options: ExecuteCommandOptions = {}): void | Promise<void> {
    if (this.#destroyed) return undefined;

    const result = command.execute();
    const historyId = options.historyId ?? null;
    const prior = this.#done.at(-1);

    if (historyId !== null && prior?.historyId === historyId) {
      prior.commands.push(command);
    } else {
      this.#done.push({ commands: [command], historyId });
      if (this.#done.length > this.#limit) this.#done.shift();
    }
    this.#undone = [];
    this.#emitHistory('history:executed', { command, historyId });
    return result;
  }

  public undo(): void | Promise<void> {
    if (this.#destroyed) return undefined;
    const entry = this.#done.pop();
    if (!entry) return undefined;
    const result = runCommands([...entry.commands].reverse(), 'undo');
    this.#undone.push(entry);
    this.#emitHistory('history:undone', { command: entry.commands.at(-1) });
    return result;
  }

  public redo(): void | Promise<void> {
    if (this.#destroyed) return undefined;
    const entry = this.#undone.pop();
    if (!entry) return undefined;
    const result = runCommands(entry.commands, 'execute');
    this.#done.push(entry);
    this.#emitHistory('history:redone', { command: entry.commands.at(-1) });
    return result;
  }

  public canUndo(): boolean {
    return !this.#destroyed && this.#done.length > 0;
  }

  public canRedo(): boolean {
    return !this.#destroyed && this.#undone.length > 0;
  }

  public clear(): void {
    if (this.#destroyed) return;
    this.#done = [];
    this.#undone = [];
    this.#emitHistory('history:cleared', { target: this });
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#done = [];
    this.#undone = [];
    this.#destroyed = true;
    this.#emitHistory('history:destroyed', { target: this });
    this.removeAllListeners();
  }

  #emitHistory(event: string, payload: unknown): void {
    this.emit(event, payload);
    this.emit('history:*', event, payload);
  }
}
