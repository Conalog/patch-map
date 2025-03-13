import { isSame } from '../../utils/diff/isSame';

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

  get config() {
    throw new Error('config getter must be implemented.');
  }

  get prevConfig() {
    throw new Error('prevConfig getter must be implemented.');
  }

  isStateChanged() {
    return !isSame(this.config, this.prevConfig);
  }
}
