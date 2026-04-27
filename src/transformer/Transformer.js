import { Container } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds, calcOrientedBounds } from '../utils/bounds';
import { getViewport } from '../utils/get';
import { validate } from '../utils/validator';
import { getSafeViewportScale } from '../utils/viewport';
import ResizeGestureController from './ResizeGestureController';
import RotateGestureController from './RotateGestureController';
import { buildResizeContext } from './resize-context';
import { buildRotateContext } from './rotate-context';
import SelectionModel from './SelectionModel';
import TransformHandleLayer from './TransformHandleLayer';
import { Wireframe } from './Wireframe';

const DEFAULT_WIREFRAME_STYLE = { thickness: 1.5, color: '#1099FF' };
const DEFAULT_HANDLE_STYLE = { fill: '#FFFFFF', stroke: '#1099FF', size: 8 };

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
 * @property {boolean} [resizeHandles=false] - Enable group resize handles.
 * @property {boolean} [rotateHandles=false] - Enable outside-corner rotate hit targets.
 * @property {boolean} [transformHistory=false] - Record transform changes to undo/redo history.
 */

const TransformerSchema = z
  .object({
    elements: z.array(z.any()),
    wireframeStyle: z.record(z.string(), z.unknown()),
    boundsDisplayMode: z.enum(['all', 'groupOnly', 'elementOnly', 'none']),
    resizeHandles: z.boolean(),
    rotateHandles: z.boolean(),
    transformHistory: z.boolean(),
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
   * Flag to enable resize handles for group bounds.
   * @private
   * @type {boolean}
   */
  _resizeHandles = false;

  /**
   * Flag to enable rotate handles for group bounds.
   * @private
   * @type {boolean}
   */
  _rotateHandles = false;

  /**
   * Flag to record transform changes to undo/redo history.
   * @private
   * @type {boolean}
   */
  _transformHistory = false;

  /**
   * The container holding transform handle graphics.
   * @private
   * @type {PIXI.Container}
   */
  _transformHandleLayer;

  /**
   * @private
   * @type {{ fill: string | number, stroke: string | number, size: number }}
   */
  _transformHandleStyle = { ...DEFAULT_HANDLE_STYLE };

  /**
   * Manages the state of the currently selected elements.
   * @private
   * @type {SelectionModel}
   */
  _selection;

  /**
   * Handles drawing and hit-target rendering for transform handles.
   * @private
   * @type {TransformHandleLayer}
   */
  _transformHandleRenderer;

  /**
   * Handles pointer gesture lifecycle for resizing.
   * @private
   * @type {ResizeGestureController}
   */
  _resizeGesture;

  /**
   * Handles pointer gesture lifecycle for rotating.
   * @private
   * @type {RotateGestureController}
   */
  _rotateGesture;

  /**
   * @param {TransformerOptions} [opts] - The options for the transformer.
   */
  constructor(opts = {}) {
    super({ zIndex: 999, isRenderGroup: true, id: 'transformer' });

    const options = validate(opts, TransformerSchema);
    if (isValidationError(options)) throw options;

    this._selection = new SelectionModel();
    this.#wireframe = this.addChild(new Wireframe({ type: 'wireframe' }));
    this._transformHandleLayer = this.addChild(
      new Container({ label: 'transform-handles', sortableChildren: true }),
    );

    this._transformHandleRenderer = new TransformHandleLayer({
      transformer: this,
      layer: this._transformHandleLayer,
      getViewport: () => this._viewport,
      getHandleStyle: () => this._transformHandleStyle,
      getStrokeWidth: () => this.wireframe.strokeStyle.width,
      onResizePointerDown: (handle, event) => {
        this._resizeGesture.begin(handle, event);
      },
      onRotatePointerDown: (handle, event) => {
        this._rotateGesture.begin(handle, event);
      },
    });

    this._resizeGesture = new ResizeGestureController({
      getViewport: () => this._viewport,
      canStart: () => this.#shouldShowResizeHandles(),
      getResizeContext: () => this.#buildResizeContext(),
      getTransformHistory: () => this._transformHistory,
      emitUpdateElements: () => this.#emitUpdateElements(),
      requestRender: this.update,
    });

    this._rotateGesture = new RotateGestureController({
      getViewport: () => this._viewport,
      canStart: () => this.#shouldShowRotateHandles(),
      getRotateContext: () => this.#buildRotateContext(),
      getTransformHistory: () => this._transformHistory,
      emitUpdateElements: () => this.#emitUpdateElements(),
      requestRender: this.update,
    });

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
      this.#emitUpdateElements({ current, added, removed });
    });

    this.on('added', () => {
      this._viewport = getViewport(this);
      if (this._viewport) {
        this._viewport.on('zoomed', this.update);
        this._viewport.on('zoomed-end', this.update);
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

  /**
   * @param {BoundsDisplayMode} value
   */
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
    if (this.wireframeStyle?.color != null) {
      this._transformHandleStyle.stroke = this.wireframeStyle.color;
    }
    this.update();
  }

  /**
   * Enables or disables resize handles for group bounds.
   * @type {boolean}
   */
  get resizeHandles() {
    return this._resizeHandles;
  }

  set resizeHandles(value) {
    this._resizeHandles = Boolean(value);
    if (!this._resizeHandles) {
      this._resizeGesture.end();
      if (!this._rotateHandles) this._transformHandleRenderer.clear();
    }
    this.update();
  }

  /**
   * Enables or disables rotate hit targets for group bounds.
   * @type {boolean}
   */
  get rotateHandles() {
    return this._rotateHandles;
  }

  set rotateHandles(value) {
    this._rotateHandles = Boolean(value);
    if (!this._rotateHandles) {
      this._rotateGesture.end();
      if (!this._resizeHandles) this._transformHandleRenderer.clear();
    }
    this.update();
  }

  /**
   * Enables or disables recording transform changes to undo/redo history.
   * @type {boolean}
   */
  get transformHistory() {
    return this._transformHistory;
  }

  set transformHistory(value) {
    this._transformHistory = Boolean(value);
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
      this._viewport.off('zoomed-end', this.update);
    }

    this._resizeGesture.destroy();
    this._rotateGesture.destroy();
    this._transformHandleRenderer.clear();
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
    const resizeContext = this.#buildResizeContext(elements);
    const rotateContext = this.#buildRotateContext(elements);

    this.wireframe.clear();

    if (this.#isEmptySelection(elements)) {
      this._renderDirty = false;
      this._transformHandleRenderer.clear();
      return;
    }

    this.#syncWireframeStrokeWidth();
    this.#drawElementBounds(elements);
    this.#drawGroupBounds(elements);
    this.#drawTransformHandlesFor({ resizeContext, rotateContext });
    this._renderDirty = false;
  }

  /**
   * Marks the transformer as dirty, scheduling a redraw on the next frame.
   * This method is an arrow function to preserve `this` store when used as an event listener.
   */
  update = () => {
    this._renderDirty = true;
  };

  #isEmptySelection(elements) {
    return !elements || elements.length === 0;
  }

  #syncWireframeStrokeWidth() {
    if (this.boundsDisplayMode === 'none' && !this.#shouldShowAnyHandles()) {
      return;
    }

    const viewportScale = getSafeViewportScale(this._viewport);

    this.wireframe.strokeStyle.width =
      this.wireframeStyle.thickness / viewportScale;
  }

  #drawElementBounds(elements) {
    if (
      this.boundsDisplayMode !== 'all' &&
      this.boundsDisplayMode !== 'elementOnly'
    ) {
      return;
    }

    elements.forEach((element) => {
      this.wireframe.drawBounds(calcOrientedBounds(element));
    });
  }

  #drawGroupBounds(elements) {
    const shouldShowHandles = this.#shouldShowAnyHandles();
    if (
      this.boundsDisplayMode !== 'all' &&
      this.boundsDisplayMode !== 'groupOnly' &&
      !shouldShowHandles
    ) {
      return;
    }

    const groupBounds = this.#getGroupBounds(elements);
    if (groupBounds) {
      this.wireframe.drawBounds(groupBounds);
    }
  }

  #getGroupBounds(elements) {
    if (elements.length === 1) {
      return calcOrientedBounds(elements[0]);
    }

    return calcGroupOrientedBounds(elements);
  }

  #drawTransformHandlesFor({ resizeContext, rotateContext }) {
    const resizeBounds = this.#shouldShowResizeHandles()
      ? resizeContext?.bounds
      : null;
    const rotateFrame = this.#shouldShowRotateHandles()
      ? rotateContext?.frame
      : null;

    if (!resizeBounds && !rotateFrame) {
      this._transformHandleRenderer.clear();
      return;
    }

    this._transformHandleRenderer.draw({ resizeBounds, rotateFrame });
  }

  #shouldShowResizeHandles() {
    return this._resizeHandles && this.boundsDisplayMode !== 'none';
  }

  #shouldShowRotateHandles() {
    return this._rotateHandles && this.boundsDisplayMode !== 'none';
  }

  #shouldShowAnyHandles() {
    return this.#shouldShowResizeHandles() || this.#shouldShowRotateHandles();
  }

  #emitUpdateElements({
    current = this.elements,
    added = [],
    removed = [],
  } = {}) {
    this.emit('update_elements', { target: this, current, added, removed });
  }

  #buildResizeContext(elements = this.elements) {
    return buildResizeContext({
      elements,
      viewport: this._viewport,
    });
  }

  #buildRotateContext(elements = this.elements) {
    return buildRotateContext({
      elements,
      viewport: this._viewport,
    });
  }
}
