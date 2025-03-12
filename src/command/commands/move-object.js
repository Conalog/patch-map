import { Command } from './base';

export class MoveObjectCommand extends Command {
  constructor(object, x, y) {
    super('move_object');
    this.object = object;
    this.prevX = object.x;
    this.prevY = object.y;
    this.x = x;
    this.y = y;
  }

  execute() {
    this.object.position.set(this.x, this.y);
  }

  undo() {
    this.object.position.set(this.prevX, this.prevY);
  }
}
