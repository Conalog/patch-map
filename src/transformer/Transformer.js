import { Container } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds, calcOrientedBounds } from '../utils/bounds';
import { getViewport } from '../utils/get';
import { validate } from '../utils/validator';
import { Wireframe } from './Wireframe';

const DEFAULT_WIREFRAME_STYLE = {
  thickness: 1.5,
  color: '#1099FF',
};

const TransformerSchema = z
  .object({
    elements: z.array(),
    wireframeStyle: z.record(z.string(), z.unknown()),
    boundsDisplayMode: z.enum(['all', 'groupOnly', 'elementOnly', 'none']),
  })
  .partial();

export class Transformer extends Container {
  #wireframe;
  _boundsDisplayMode = 'all';
  _elements = [];
  _renderDirty = true;
  _wireframeStyle = DEFAULT_WIREFRAME_STYLE;

  constructor(opts) {
    super({ zIndex: 999, isRenderGroup: true });

    const options = validate(opts, TransformerSchema);
    if (isValidationError(options)) throw options;

    this.#wireframe = this.addChild(new Wireframe(this));
    this.onRender = this._refresh.bind(this);
    for (const key in options) {
      if (key === 'wireframeStyle') {
        this[key] = Object.assign(this[key], options[key]);
      } else {
        this[key] = options[key];
      }
    }

    this.on('added', () => {
      const viewport = getViewport(this);
      if (viewport) {
        viewport.on('zoomed', this.update);
      }
    });
  }

  get wireframe() {
    return this.#wireframe;
  }

  get boundsDisplayMode() {
    return this._boundsDisplayMode;
  }

  set boundsDisplayMode(value) {
    this._boundsDisplayMode = value;
  }

  get elements() {
    return this._elements;
  }

  set elements(value) {
    this._elements = Array.isArray(value) ? value : [value];
    this.update();
  }

  get wireframeStyle() {
    return this._wireframeStyle;
  }

  set wireframeStyle(value) {
    this._wireframeStyle = Object.assign(this._wireframeStyle, value);
    this.wireframe.setStrokeStyle(this.wireframeStyle);
  }

  destroy(options) {
    this.onRender = null;
    const viewport = getViewport(this);
    if (viewport) {
      viewport.off('zoomed', this.update);
    }
    super.destroy(options);
  }

  _refresh() {
    if (this.renderable && this.visible && this._renderDirty) {
      this.draw();
    }
  }

  draw() {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    this.wireframe.clear();
    if (this.boundsDisplayMode !== 'none') {
      this.wireframe.strokeStyle.width =
        this.wireframeStyle.thickness / (getViewport(this)?.scale?.x ?? 1);
    }

    if (
      this.boundsDisplayMode === 'all' ||
      this.boundsDisplayMode === 'elementOnly'
    ) {
      elements.forEach((element) => {
        this.wireframe.drawBounds(calcOrientedBounds(element));
      });
    }

    if (
      this.boundsDisplayMode === 'all' ||
      this.boundsDisplayMode === 'groupOnly'
    ) {
      const groupBounds =
        elements.length > 1 ? calcGroupOrientedBounds(elements) : null;
      this.wireframe.drawBounds(groupBounds);
    }

    this._renderDirty = false;
  }

  update = () => {
    this._renderDirty = true;
  };
}
