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

export default class Transformer extends Container {
  #wireframe;
  _boundsDisplayMode = 'all';
  _elements = [];
  _renderDirty = true;
  _wireframeStyle = DEFAULT_WIREFRAME_STYLE;
  _viewport = null;

  constructor(opts) {
    super({ zIndex: 999, isRenderGroup: true, id: 'transformer' });

    const options = validate(opts, TransformerSchema);
    if (isValidationError(options)) throw options;

    this.#wireframe = this.addChild(new Wireframe({ label: 'wireframe' }));
    this.onRender = this._refresh.bind(this);
    for (const key in options) {
      if (key === 'wireframeStyle') {
        this[key] = Object.assign(this[key], options[key]);
      } else {
        this[key] = options[key];
      }
    }

    this.on('added', () => {
      this._viewport = getViewport(this);
      if (this._viewport) {
        this._viewport.on('zoomed', this.update);
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
    this.update();
  }

  destroy(options) {
    this.onRender = null;
    if (this._viewport) {
      this._viewport.off('zoomed', this.update);
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
    let groupBounds = null;
    this.wireframe.clear();

    if (!elements || elements.length === 0) {
      this._renderDirty = false;
      return;
    }

    if (this.boundsDisplayMode !== 'none') {
      this.wireframe.strokeStyle.width =
        this.wireframeStyle.thickness / (this._viewport?.scale?.x ?? 1);
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
      groupBounds = calcGroupOrientedBounds(elements);
      this.wireframe.drawBounds(groupBounds);
    }
    this._renderDirty = false;
  }

  update = () => {
    this._renderDirty = true;
  };
}
