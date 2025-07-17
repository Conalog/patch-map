import { Graphics } from 'pixi.js';
import { calcOrientedBounds } from '../../utils/bounds';
import { relationsSchema } from '../data-schema/element-schema';
import { Relationstyleable } from '../mixins/Relationstyleable';
import { Linksable } from '../mixins/linksable';
import { mixins } from '../mixins/utils';
import Element from './Element';

const ComposedRelations = mixins(Element, Linksable, Relationstyleable);

export class Relations extends ComposedRelations {
  static isSelectable = true;
  static hitScope = 'children';

  _renderDirty = true;

  constructor(context) {
    super({ type: 'relations', context });
    this.path = this.initPath();
  }

  update(changes, options) {
    super.update(changes, relationsSchema, options);
  }

  initPath() {
    const path = new Graphics();
    path.setStrokeStyle({ color: 'black' });
    Object.assign(path, { type: 'path', links: [] });
    this.addChild(path);
    return path;
  }

  _afterRender() {
    super._afterRender();
    this._onUpdate();
  }

  _onUpdate() {
    if (this._renderDirty) {
      try {
        this.renderLink();
      } finally {
        this._renderDirty = false;
      }
    }
  }

  renderLink() {
    const { links } = this.props;
    if (!this.path) return;
    this.path.clear();
    let lastPoint = null;

    for (const link of links) {
      const sourceObject = this.linkedObjects[link.source];
      const targetObject = this.linkedObjects[link.target];

      if (
        !sourceObject ||
        !targetObject ||
        sourceObject?.destroyed ||
        targetObject?.destroyed
      ) {
        continue;
      }

      const sourceBounds = this.context.viewport.toLocal(
        calcOrientedBounds(sourceObject).center,
      );
      const targetBounds = this.context.viewport.toLocal(
        calcOrientedBounds(targetObject).center,
      );

      const sourcePoint = [sourceBounds.x, sourceBounds.y];
      const targetPoint = [targetBounds.x, targetBounds.y];
      if (
        !lastPoint ||
        lastPoint[0] !== sourcePoint[0] ||
        lastPoint[1] !== sourcePoint[1]
      ) {
        this.path.moveTo(...sourcePoint);
      }
      this.path.lineTo(...targetPoint);
      lastPoint = targetPoint;
    }
    this.path.stroke();
  }
}
