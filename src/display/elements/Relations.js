import { Graphics } from 'pixi.js';
import { calcOrientedBounds } from '../../utils/bounds';
import { selector } from '../../utils/selector/selector';
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
  _renderOnNextTick = false;

  constructor(context) {
    super({ type: 'relations', context });
    this.initPath();

    this._updateTransform = this._updateTransform.bind(this);
    this.context.viewport.app.ticker.add(this._updateTransform);
  }

  update(changes, options) {
    super.update(changes, relationsSchema, options);
  }

  initPath() {
    const path = new Graphics();
    path.setStrokeStyle({ color: 'black' });
    Object.assign(path, { type: 'path', links: [] });
    this.addChild(path);
  }

  _updateTransform() {
    if (this._renderOnNextTick) {
      this.renderLink();
      this._renderOnNextTick = false;
    }

    if (this._renderDirty) {
      this._renderOnNextTick = true;
      this._renderDirty = false;
    }
  }

  destroy(options) {
    this.context.viewport.app.ticker.remove(this._updateTransform);
    super.destroy(options);
  }

  renderLink() {
    const { links } = this.props;
    const path = selector(this, '$.children[?(@.type==="path")]')[0];
    if (!path) return;
    path.clear();
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
        path.moveTo(...sourcePoint);
      }
      path.lineTo(...targetPoint);
      lastPoint = targetPoint;
    }
    path.stroke();
  }
}
