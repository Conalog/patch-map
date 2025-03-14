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

  isStateChanged() {
    return this.config && this.prevConfig
      ? !isSame(this.config, this.prevConfig)
      : true;
  }
}
