import { BundleCommand } from './commands';
import { isInput } from './utils';

export class UndoRedoManager {
  constructor(maxCommands = 50) {
    this._commands = [];
    this._index = -1;
    this._listeners = new Set();
    this._maxCommands = maxCommands;
  }

  get commands() {
    return this._commands;
  }

  execute(command, options = {}) {
    if (!command.isStateChanged()) {
      return;
    }
    command.execute();
    this._commands = this._commands.slice(0, this._index + 1);

    const historyId = options.historyId;
    let shouldPush = false;
    let commandToPush = command;

    if (historyId) {
      const lastCommand = this._commands[this._commands.length - 1];
      if (lastCommand && lastCommand.id === historyId) {
        if (lastCommand instanceof BundleCommand) {
          lastCommand.addCommand(command);
        } else {
          this._commands[this._commands.length - 1] = new BundleCommand(
            historyId,
            [lastCommand, command],
          );
        }
      } else {
        shouldPush = true;
        commandToPush = new BundleCommand(historyId, [command]);
      }
    } else {
      shouldPush = true;
    }

    if (shouldPush) {
      this._commands.push(commandToPush);
      this._index++;
      if (this._commands.length > this._maxCommands) {
        this._commands.shift();
        this._index--;
      }
    }
    this._emitChange();
  }

  undo() {
    if (this.canUndo()) {
      const command = this._commands[this._index];
      command.undo();
      this._index--;
      this._emitChange();
    }
  }

  redo() {
    if (this.canRedo()) {
      this._index++;
      const command = this._commands[this._index];
      command.execute();
      this._emitChange();
    }
  }

  canUndo() {
    return this._index >= 0;
  }

  canRedo() {
    return this._index < this._commands.length - 1;
  }

  clear() {
    this._commands = [];
    this._index = -1;
    this._emitChange();
  }

  subscribe(listener) {
    this._listeners.add(listener);
    listener(this);
    return () => {
      this._listeners.delete(listener);
    };
  }

  _emitChange() {
    this._listeners.forEach((listener) => listener(this));
  }

  _setHotkeys() {
    document.addEventListener(
      'keydown',
      (e) => {
        const key = (e.key || '').toLowerCase();
        if (isInput(e.target)) return;

        if (key === 'z' && (e.ctrlKey || e.metaKey)) {
          if (e.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
          e.preventDefault();
        }
        if (key === 'y' && (e.ctrlKey || e.metaKey)) {
          this.redo();
          e.preventDefault();
        }
      },
      false,
    );
  }
}
