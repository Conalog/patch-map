import { Graphics } from 'pixi.js';
import { relationsSchema } from '../data-schema/element-schema';
import Element from './Element';

export class Relations extends Element {
  constructor(context) {
    super({ type: 'relations', context });
    this.initPath();
  }

  update(changes) {
    super.update(changes, relationsSchema);
  }

  initPath() {
    const path = new Graphics();
    Object.assign(path, { type: 'path', links: [] });
    this.addChild(path);
  }
}
