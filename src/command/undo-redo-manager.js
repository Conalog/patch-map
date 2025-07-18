import { BundleCommand } from './commands';
import { isInput } from './utils';

export class UndoRedoManager {
  constructor(maxCommands = 50) {
    this._commands = [];
    this._index = -1;
    this._listeners = new Set();
    this._maxCommands = maxCommands;
    this._hotkeyListener = null;
  }

  /**
   * Returns the list of commands in the history.
   * @returns {Array<Command>}
   */
  get commands() {
    return this._commands;
  }

  execute(command, options = {}) {
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

  /**
   * Undoes the last executed command.
   */
  undo() {
    if (this.canUndo()) {
      const command = this._commands[this._index];
      command.undo();
      this._index--;
      this._emitChange();
    }
  }

  /**
   * Redoes the last undone command.
   */
  redo() {
    if (this.canRedo()) {
      this._index++;
      const command = this._commands[this._index];
      command.execute();
      this._emitChange();
    }
  }

  /**
   * Checks if there are any commands to undo.
   * @returns {boolean}
   */
  canUndo() {
    return this._index >= 0;
  }

  /**
   * Checks if there are any commands to redo.
   * @returns {boolean}
   */
  canRedo() {
    return this._index < this._commands.length - 1;
  }

  /**
   * Clears the command history.
   */
  clear() {
    this._commands = [];
    this._index = -1;
    this._emitChange();
  }

  /**
   * Subscribes a listener to be called when the command history changes.
   * @param {Function} listener - The listener function to call.
   * @returns {Function} - A function to unsubscribe the listener.
   */
  subscribe(listener) {
    this._listeners.add(listener);
    listener(this);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Emits a change event to all listeners.
   * @private
   */
  _emitChange() {
    this._listeners.forEach((listener) => listener(this));
  }

  /**
   * Sets up hotkeys for undo/redo functionality (Ctrl+Z, Ctrl+Y).
   * @private
   */
  _setHotkeys() {
    this._hotkeyListener = (e) => {
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
    };

    document.addEventListener('keydown', this._hotkeyListener, false);
  }

  /**
   * Removes event listeners and clears all internal states to prevent memory leaks.
   */
  destroy() {
    if (this._hotkeyListener) {
      document.removeEventListener('keydown', this._hotkeyListener, false);
      this._hotkeyListener = null;
    }
    this.clear();
    this._listeners.clear();
  }
}
