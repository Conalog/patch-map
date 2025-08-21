import { WildcardEventEmitter } from '../utils/event/WildcardEventEmitter';
import { BundleCommand } from './commands';
import { isInput } from './utils';

/**
 * Manages the command history for undo and redo operations.
 * It records executed commands, allowing for sequential undoing and redoing.
 * This class extends WildcardEventEmitter to notify about state changes.
 *
 * @extends WildcardEventEmitter
 * @fires UndoRedoManager#history:executed
 * @fires UndoRedoManager#history:undone
 * @fires UndoRedoManager#history:redone
 * @fires UndoRedoManager#history:cleared
 * @fires UndoRedoManager#history:destroyed
 */
export class UndoRedoManager extends WildcardEventEmitter {
  /**
   * @private
   * @type {import('./commands/base').Command[]}
   */
  #commands = [];

  /**
   * @private
   * @type {number}
   */
  #index = -1;

  /**
   * @private
   * @type {number}
   */
  #maxCommands;

  /**
   * @private
   * @type {((e: KeyboardEvent) => void) | null}
   */
  #hotkeyListener;

  /**
   * @param {number} [maxCommands=50] - The maximum number of commands to store in history.
   */
  constructor(maxCommands = 50) {
    super();
    this.#maxCommands = maxCommands;
  }

  /**
   * The list of commands in the history stack.
   * @returns {import('./commands/base').Command[]}
   * @readonly
   */
  get commands() {
    return [...this.#commands];
  }

  /**
   * Executes a command, adds it to the history, and clears the redo stack.
   * If a `historyId` is provided, it may bundle the command with the previous one.
   * @param {import('./commands/base').Command} command - The command to execute.
   * @param {object} [options] - Options for execution.
   * @param {string} [options.historyId] - An ID to bundle commands together into a single undo/redo step.
   */
  execute(command, options = {}) {
    command.execute();
    this.#commands = this.#commands.slice(0, this.#index + 1);

    const historyId = options.historyId;
    let commandToPush = command;
    let isBundled = false;

    if (historyId) {
      const lastCommand = this.#commands[this.#commands.length - 1];
      if (lastCommand && lastCommand.id === historyId) {
        if (lastCommand instanceof BundleCommand) {
          lastCommand.addCommand(command);
        } else {
          this.#commands[this.#commands.length - 1] = new BundleCommand(
            historyId,
            [lastCommand, command],
          );
        }
        commandToPush = this.#commands[this.#commands.length - 1];
        isBundled = true;
      } else {
        commandToPush = new BundleCommand(historyId, [command]);
      }
    }

    if (!isBundled) {
      this.#commands.push(commandToPush);
      this.#index++;
      if (this.#commands.length > this.#maxCommands) {
        this.#commands.shift();
        this.#index--;
      }
    }

    this.emit('history:executed', { command: commandToPush, target: this });
  }

  /**
   * Undoes the last executed command.
   */
  undo() {
    if (this.canUndo()) {
      const command = this.#commands[this.#index];
      command.undo();
      this.#index--;

      this.emit('history:undone', { command, target: this });
    }
  }

  /**
   * Redoes the last undone command.
   */
  redo() {
    if (this.canRedo()) {
      this.#index++;
      const command = this.#commands[this.#index];
      command.execute();

      this.emit('history:redone', { command, target: this });
    }
  }

  /**
   * Checks if there are any commands to undo.
   * @returns {boolean} True if an undo operation is possible.
   */
  canUndo() {
    return this.#index >= 0;
  }

  /**
   * Checks if there are any commands to redo.
   * @returns {boolean} True if a redo operation is possible.
   */
  canRedo() {
    return this.#index < this.#commands.length - 1;
  }

  /**
   * Clears the entire command history.
   */
  clear() {
    this.#commands = [];
    this.#index = -1;

    this.emit('history:cleared', { target: this });
  }

  /**
   * Sets up hotkeys for undo/redo functionality (Ctrl+Z, Ctrl+Y/Cmd+Shift+Z).
   * @private
   */
  _setHotkeys() {
    this.#hotkeyListener = (e) => {
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

    document.addEventListener('keydown', this.#hotkeyListener, false);
  }

  /**
   * Removes event listeners and clears all internal states to prevent memory leaks.
   */
  destroy() {
    if (this.#hotkeyListener) {
      document.removeEventListener('keydown', this.#hotkeyListener, false);
      this.#hotkeyListener = null;
    }
    this.clear();

    this.emit('history:destroyed', { target: this });
    this.removeAllListeners();
  }
}
