import { Graphics } from 'pixi.js';
import { calcOrientedBounds } from '../../utils/bounds';
import { selector } from '../../utils/selector/selector';
import { relationsSchema } from '../data-schema/element-schema';
import { Relationstyleable } from '../mixins/Relationstyleable';
import { Linksable } from '../mixins/linksable';
import { mixins } from '../mixins/utils';
import RenderElement from './RenderElement';

const ComposedRelations = mixins(RenderElement, Linksable, Relationstyleable);

export class Relations extends ComposedRelations {
  allowChildren = true;

  constructor(context) {
    super({ type: 'relations', context });
    this.initPath();
    this._renderDirty = true;
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

  render(renderer) {
    if (this._renderDirty) {
      this.renderLink();
      this._renderDirty = false;
    }
    super.render(renderer);
  }

  renderLink() {
    const { links } = this.props;
    const path = selector(this, '$.children[?(@.type==="path")]')[0];
    if (!path) return;
    path.clear();
    let lastPoint = null;

    for (const link of links) {
      const sourceBounds = this.toLocal(
        calcOrientedBounds(this.linkedObjects[link.source]).center,
      );
      const targetBounds = this.toLocal(
        calcOrientedBounds(this.linkedObjects[link.target]).center,
      );

      const sourcePoint = [sourceBounds.x, sourceBounds.y];
      const targetPoint = [targetBounds.x, targetBounds.y];
      if (
        !lastPoint ||
        JSON.stringify(lastPoint) === JSON.stringify(sourcePoint)
      ) {
        path.moveTo(...sourcePoint);
      }
      path.lineTo(...targetPoint);
      lastPoint = targetPoint;
    }
    path.stroke();
  }
}
