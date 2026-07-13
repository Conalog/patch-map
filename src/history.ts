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
  command: Command;
  historyId: string | null;
}

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
    return this.#done.map(({ command }) => command);
  }

  public execute(command: Command, options: ExecuteCommandOptions = {}): void | Promise<void> {
    if (this.#destroyed) return undefined;

    const result = command.execute();
    const entry = { command, historyId: options.historyId ?? null };
    const prior = this.#done.at(-1);

    if (entry.historyId !== null && prior?.historyId === entry.historyId) {
      this.#done[this.#done.length - 1] = entry;
    } else {
      this.#done.push(entry);
      if (this.#done.length > this.#limit) this.#done.shift();
    }
    this.#undone = [];
    this.#emitHistory('history:executed', { command, historyId: entry.historyId });
    return result;
  }

  public undo(): void | Promise<void> {
    if (this.#destroyed) return undefined;
    const entry = this.#done.pop();
    if (!entry) return undefined;
    const result = entry.command.undo();
    this.#undone.push(entry);
    this.#emitHistory('history:undone', { command: entry.command });
    return result;
  }

  public redo(): void | Promise<void> {
    if (this.#destroyed) return undefined;
    const entry = this.#undone.pop();
    if (!entry) return undefined;
    const result = entry.command.execute();
    this.#done.push(entry);
    this.#emitHistory('history:redone', { command: entry.command });
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
