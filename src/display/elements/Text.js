import { BitmapText } from 'pixi.js';
import { textSchema } from '../data-schema/element-schema';
import { UPDATE_STAGES } from '../mixins/constants';
import { ElementTextLayoutable } from '../mixins/ElementTextLayoutable';
import { Textable } from '../mixins/Textable';
import { Textstyleable } from '../mixins/Textstyleable';
import { mixins } from '../mixins/utils';
import { WorldTransformable } from '../mixins/WorldTransformable';
import {
  resetReadableVisual,
  resolveReadableVisualCenterDelta,
  resolveReadableVisualTransform,
} from '../utils/readable-visual';
import Element from './Element';

const HANDLER_KEYS = ['text', 'style', 'attrs', 'size'];

const ComposedText = mixins(
  Element,
  Textable,
  Textstyleable,
  ElementTextLayoutable,
  WorldTransformable,
);

/**
 * Text element that renders BitmapText.
 * It's an independent element in the element tree.
 */
export class Text extends ComposedText {
  static isSelectable = true;
  static isRotatable = true;
  static hitScope = 'children';

  constructor(store) {
    super({ type: 'text', store });

    // Initialize internal BitmapText
    this.bitmapText = new BitmapText({ text: '', style: {} });
    this.addChild(this.bitmapText);
    this._applyWorldTransform();
  }

  apply(changes, options) {
    super.apply(changes, textSchema, options);
  }

  _applyWorldTransform() {
    if (!this.store?.view || !this.bitmapText) return;
    const visual = this.bitmapText;

    resetReadableVisual(visual);
    const baseBounds = visual.getLocalBounds?.();
    const outerGlobal = this.getGlobalTransform();
    const transform = resolveReadableVisualTransform(outerGlobal);
    visual.position.set(transform.position.x, transform.position.y);
    visual.rotation = transform.rotation;
    visual.scale.set(transform.scale.x, transform.scale.y);
    visual.skew?.set?.(transform.skew.x, transform.skew.y);

    const transformedBounds = visual.getBounds?.();
    if (baseBounds && transformedBounds) {
      const deltaLocal = resolveReadableVisualCenterDelta(
        baseBounds,
        transformedBounds,
        outerGlobal,
      );

      visual.position.set(
        visual.position.x + deltaLocal.x,
        visual.position.y + deltaLocal.y,
      );
    }
  }
}

Text.registerHandler(
  HANDLER_KEYS,
  Text.prototype._applyWorldTransform,
  UPDATE_STAGES.WORLD_TRANSFORM,
);
