class UndoRedoManager {
  constructor() {
    this._commands = [];
    this._index = -1;
  }

  execute(command) {
    this._commands = this._commands.slice(0, this._index + 1);
    command.execute();
    this._commands.push(command);
    this._index++;
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

export const undoRedoManager = new UndoRedoManager();
