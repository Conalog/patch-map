import EventEmitter from 'eventemitter3';

export class Command {
  public readonly id: unknown;

  public constructor(id?: unknown) {
    this.id = id;
  }

  public execute(): unknown {
    return undefined;
  }

  public undo(): unknown {
    return undefined;
  }
}

export interface ExecuteCommandOptions {
  historyId?: string;
}

interface HistoryEntry {
  commands: Command[];
  historyId: string | null;
}

type CommandMethod = 'execute' | 'undo';

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'then') === 'function';

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

const observeAsyncResult = (value: unknown): void => {
  if (isPromiseLike(value)) {
    void Promise.resolve(value).catch(() => undefined);
  }
};

export class UndoRedoManager extends EventEmitter {
  readonly #limit: number;
  #entries: HistoryEntry[] = [];
  #cursor = 0;
  #destroyed = false;

  public constructor(limit = 50) {
    super();
    this.#limit = Math.max(1, Math.trunc(limit));
  }

  public get commands(): readonly Command[] {
    return this.#entries.map(({ commands }) => commands[commands.length - 1] as Command);
  }

  public execute(
    command: Command,
    options: ExecuteCommandOptions = {},
  ): void | Promise<void> {
    if (this.#destroyed) return;

    const result = command.execute();
    observeAsyncResult(result);
    if (this.#cursor < this.#entries.length) {
      this.#entries.splice(this.#cursor);
    }

    const historyId = options.historyId ?? null;
    const prior = this.#entries.at(-1);

    if (historyId !== null && prior?.historyId === historyId) {
      prior.commands.push(command);
    } else {
      this.#entries.push({ commands: [command], historyId });
      if (this.#entries.length > this.#limit) this.#entries.shift();
    }
    this.#cursor = this.#entries.length;
    this.#emitHistory('history:executed', { command, historyId });
  }

  public undo(): void | Promise<void> {
    if (this.#destroyed || this.#cursor === 0) return;
    const entry = this.#entries[this.#cursor - 1];
    if (!entry) return;
    const result = runCommands([...entry.commands].reverse(), 'undo');
    observeAsyncResult(result);
    this.#cursor -= 1;
    this.#emitHistory('history:undone', { command: entry.commands.at(-1) });
  }

  public redo(): void | Promise<void> {
    if (this.#destroyed || this.#cursor >= this.#entries.length) return;
    const entry = this.#entries[this.#cursor];
    if (!entry) return;
    const result = runCommands(entry.commands, 'execute');
    observeAsyncResult(result);
    this.#cursor += 1;
    this.#emitHistory('history:redone', { command: entry.commands.at(-1) });
  }

  public canUndo(): boolean {
    return !this.#destroyed && this.#cursor > 0;
  }

  public canRedo(): boolean {
    return !this.#destroyed && this.#cursor < this.#entries.length;
  }

  public clear(): void {
    if (this.#destroyed) return;
    this.#entries = [];
    this.#cursor = 0;
    this.#emitHistory('history:cleared', { target: this });
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.clear();
    this.#destroyed = true;
    this.#emitHistory('history:destroyed', { target: this });
    this.removeAllListeners();
  }

  #emitHistory(event: string, payload: unknown): void {
    this.emit(event, payload);
    this.emit('history:*', payload);
  }
}
