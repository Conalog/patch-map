import { Graphics } from 'pixi.js';
import { relationsSchema } from '../data-schema/element-schema';
import { Relationstyleable } from '../mixins/Relationstyleable';
import { Linksable } from '../mixins/linksable';
import Element from './Element';

const ComposedRelations = Relationstyleable(Linksable(Element));

export class Relations extends ComposedRelations {
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
