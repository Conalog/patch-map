import { Graphics } from 'pixi.js';
import { relationsSchema } from '../data-schema/element-schema';
import Element from './Element';

export class Relations extends Element {
  constructor(viewport) {
    super({
      type: 'relations',
      viewport,
      pipelines: ['show', 'strokeStyle', 'links'],
    });
    this.initPath();
  }

  update(changes, options) {
    super.update(changes, relationsSchema, options);
  }

  initPath() {
    const path = new Graphics();
    Object.assign(path, { type: 'path', links: [] });
    this.addChild(path);
  }
}
