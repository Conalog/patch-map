import { Container } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds, calcOrientedBounds } from '../utils/bounds';
import { getViewport } from '../utils/get';
import { validate } from '../utils/validator';
import SelectionModel from './SelectionModel';
import { Wireframe } from './Wireframe';

const DEFAULT_WIREFRAME_STYLE = {
  thickness: 1.5,
  color: '#1099FF',
};

/**
 * @typedef {'all' | 'groupOnly' | 'elementOnly' | 'none'} BoundsDisplayMode
 * The mode for displaying wireframe bounds.
 * - 'all': Show bounds for both the group and individual elements.
 * - 'groupOnly': Show only the encompassing bounds of all elements.
 * - 'elementOnly': Show bounds for each individual element.
 * - 'none': Do not show any bounds.
 */

/**
 * @typedef {object} WireframeStyle
 * @property {number} [thickness=1.5] - The thickness of the wireframe lines.
 * @property {string | number} [color='#1099FF'] - The color of the wireframe lines.
 */

/**
 * @typedef {object} TransformerOptions
 * @property {PIXI.DisplayObject[]} [elements] - The initial elements to be transformed.
 * @property {WireframeStyle} [wireframeStyle] - The style of the wireframe.
 * @property {BoundsDisplayMode} [boundsDisplayMode='all'] - The mode for displaying bounds.
 */

const TransformerSchema = z
  .object({
    elements: z.array(z.any()),
    wireframeStyle: z.record(z.string(), z.unknown()),
    boundsDisplayMode: z.enum(['all', 'groupOnly', 'elementOnly', 'none']),
  })
  .partial();

/**
 * A visual tool to display and manipulate the bounds of selected elements.
 * It draws a wireframe around the elements and can be configured to show bounds
 * for individual elements, the entire group, or both.
 * @extends PIXI.Container
 * @fires Transformer#update_elements
 */
export default class Transformer extends Container {
  /** @private */
  #wireframe;

  /**
   * The mode for displaying the wireframe bounds.
   * @private
   * @type {BoundsDisplayMode}
   */
  _boundsDisplayMode = 'all';

  /**
   * A flag to indicate that the wireframe needs to be redrawn.
   * @private
   * @type {boolean}
   */
  _renderDirty = true;

  /**
   * The style configuration for the wireframe.
   * @private
   * @type {WireframeStyle}
   */
  _wireframeStyle = {};

  /**
   * A reference to the viewport, obtained when this container is added to the stage.
   * @private
   * @type {import('pixi-viewport').Viewport | null}
   */
  _viewport = null;

  /**
   * Manages the state of the currently selected elements.
   * @private
   * @type {SelectionModel}
   */
  _selection;

  /**
   * @param {TransformerOptions} [opts] - The options for the transformer.
   */
  constructor(opts = {}) {
    super({ zIndex: 999, isRenderGroup: true, id: 'transformer' });

    const options = validate(opts, TransformerSchema);
    if (isValidationError(options)) throw options;

    this._selection = new SelectionModel();
    this.#wireframe = this.addChild(new Wireframe({ label: 'wireframe' }));
    this.wireframeStyle = DEFAULT_WIREFRAME_STYLE;
    this.onRender = this.#refresh.bind(this);
    for (const key in options) {
      if (key === 'wireframeStyle') {
        this[key] = Object.assign(this[key], options[key]);
      } else {
        this[key] = options[key];
      }
    }

    /**
     * @event Transformer#update_elements
     * @type {object}
     * @property {PIXI.DisplayObject[]} current - The current array of selected elements.
     * @property {PIXI.DisplayObject[]} added - The elements that were added in this update.
     * @property {PIXI.DisplayObject[]} removed - The elements that were removed in this update.
     */
    this._selection.on('update', ({ current, added, removed }) => {
      this.update();
      this.emit('update_elements', { target: this, current, added, removed });
    });

    this.on('added', () => {
      this._viewport = getViewport(this);
      if (this._viewport) {
        this._viewport.on('zoomed', this.update);
      }
    });
  }

  /**
   * The wireframe graphics instance used for drawing bounds.
   * @type {Wireframe}
   * @readonly
   */
  get wireframe() {
    return this.#wireframe;
  }

  /**
   * The current bounds display mode.
   * @type {BoundsDisplayMode}
   */
  get boundsDisplayMode() {
    return this._boundsDisplayMode;
  }

  set boundsDisplayMode(value) {
    this._boundsDisplayMode = value;
    this.update();
  }

  /**
   * The selection model instance that manages the selected elements.
   * Use this to programmatically add, remove, or set the selection.
   * @type {SelectionModel}
   * @readonly
   * @example
   * transformer.selection.add(newElement);
   * transformer.selection.remove(oldElement);
   * transformer.selection.set([element1, element2]);
   */
  get selection() {
    return this._selection;
  }

  /**
   * The array of elements currently being transformed.
   * This is a convenient getter for `selection.elements`.
   * @type {PIXI.DisplayObject[]}
   */
  get elements() {
    return this._selection.elements;
  }

  /**
   * Sets the elements to be transformed, replacing any existing selection.
   * This is a convenient setter for `selection.set()`.
   * @param {PIXI.DisplayObject | PIXI.DisplayObject[]} value
   */
  set elements(value) {
    this._selection.set(value);
  }

  /**
   * The style of the wireframe.
   * @type {WireframeStyle}
   */
  get wireframeStyle() {
    return this._wireframeStyle;
  }

  set wireframeStyle(value) {
    this._wireframeStyle = Object.assign(this._wireframeStyle, value);
    this.wireframe.setStrokeStyle(this.wireframeStyle);
    this.update();
  }

  /**
   * Destroys the transformer, removing listeners and cleaning up resources.
   * @override
   * @param {import('pixi.js').DestroyOptions} [options]
   */
  destroy(options) {
    this.onRender = null;
    if (this._viewport) {
      this._viewport.off('zoomed', this.update);
    }
    this.selection.destroy();
    super.destroy(options);
  }

  /**
   * Called on every render frame. Redraws the wireframe if it's dirty.
   * @private
   */
  #refresh() {
    if (this.renderable && this.visible && this._renderDirty) {
      this.draw();
    }
  }

  /**
   * Clears and redraws the wireframe based on the current elements and display mode.
   * Adjusts line thickness based on the viewport scale to maintain a consistent appearance.
   */
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

  /**
   * Marks the transformer as dirty, scheduling a redraw on the next frame.
   * This method is an arrow function to preserve `this` context when used as an event listener.
   */
  update = () => {
    this._renderDirty = true;
  };
}
