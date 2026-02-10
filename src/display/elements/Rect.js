import { Graphics } from 'pixi.js';
import { getColor } from '../../utils/get';
import { rectSchema } from '../data-schema/element-schema';
import { EachRadius } from '../data-schema/primitive-schema';
import { Base } from '../mixins/Base';
import { UPDATE_STAGES } from '../mixins/constants';
import { Showable } from '../mixins/Showable';
import { mixins } from '../mixins/utils';

const KEYS = ['size', 'fill', 'stroke', 'radius'];
const ComposedRect = mixins(Graphics, Base, Showable);

export class Rect extends ComposedRect {
  static isSelectable = true;
  static isResizable = true;
  static hitScope = 'self';

  constructor(store) {
    super({ type: 'rect', store });
    this.eventMode = 'static';
  }

  apply(changes, options) {
    super.apply(changes, rectSchema, options);
  }

  _applyRect() {
    const { size, fill, stroke, radius } = this.props;
    this.clear();

    if (!size) return;
    const width = size.width ?? 0;
    const height = size.height ?? 0;
    if (width <= 0 || height <= 0) return;

    this._drawPath(width, height, radius);

    const theme = this.store?.theme;
    if (fill !== undefined && fill !== null) {
      this.fill(getColor(theme, fill));
    }

    if (stroke?.width > 0) {
      const strokeStyle = { ...stroke };
      if (strokeStyle.color !== undefined) {
        strokeStyle.color = getColor(theme, strokeStyle.color);
      }
      this.stroke(strokeStyle);
    }

    this.store?.viewport?.emit('object_transformed', this);
  }

  _drawPath(width, height, radius) {
    const parsedRadius = EachRadius.safeParse(radius);
    if (typeof radius === 'number' && radius > 0) {
      this.roundRect(0, 0, width, height, radius);
    } else if (parsedRadius.success) {
      const r = parsedRadius.data;
      this.roundShape(
        [
          { x: 0, y: 0, radius: r.topLeft },
          { x: width, y: 0, radius: r.topRight },
          { x: width, y: height, radius: r.bottomRight },
          { x: 0, y: height, radius: r.bottomLeft },
        ],
        0,
      );
    } else {
      this.rect(0, 0, width, height);
    }
  }
}

Rect.registerHandler(KEYS, Rect.prototype._applyRect, UPDATE_STAGES.VISUAL);
