import { Commands } from '.';

export class UndoRedoManager {
  constructor() {
    this._commands = [];
    this._index = -1;
  }

  get commands() {
    return this._commands;
  }

  execute(command, options = {}) {
    command.execute();
    this._commands = this._commands.slice(0, this._index + 1);

    const mergeId = options.merge;
    let shouldPush = false;
    let commandToPush = command;

    if (mergeId) {
      const lastCommand = this._commands[this._commands.length - 1];
      if (lastCommand && lastCommand.id === mergeId) {
        if (lastCommand instanceof Commands.BundleCommand) {
          lastCommand.addCommand(command);
        } else {
          this._commands[this._commands.length - 1] =
            new Commands.BundleCommand(mergeId, [lastCommand, command]);
        }
      } else {
        shouldPush = true;
        commandToPush = new Commands.BundleCommand(mergeId, [command]);
      }
    } else {
      shouldPush = true;
    }

    if (shouldPush) {
      this._commands.push(commandToPush);
      this._index++;
    }
  }

  undo() {
    if (this.canUndo()) {
      const command = this._commands[this._index];
      command.undo();
      this._index--;
    }
  }

  redo() {
    if (this.canRedo()) {
      this._index++;
      const command = this._commands[this._index];
      command.execute();
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
  }
}
