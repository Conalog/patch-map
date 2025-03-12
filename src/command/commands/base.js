export class Command {
  constructor(id) {
    this.id = id;
  }

  execute() {
    throw new Error('The execute() method must be implemented.');
  }
  undo() {
    throw new Error('The undo() method must be implemented.');
  }
}
