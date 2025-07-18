/**
 * Base Command class.
 * Represents an abstract command with execute, undo, and state change checking methods.
 */
export class Command {
  /**
   * Creates an instance of Command.
   * @param {String} id - The identifier for the command.
   */
  constructor(id) {
    this.id = id;
  }

  /**
   * Executes the command.
   * This method should be overridden by subclasses.
   * @throws {Error} If not implemented in the subclass.
   */
  execute() {
    throw new Error('The execute() method must be implemented.');
  }

  /**
   * Undoes the command.
   * This method should be overridden by subclasses.
   * @throws {Error} If not implemented in the subclass.
   */
  undo() {
    throw new Error('The undo() method must be implemented.');
  }
}
