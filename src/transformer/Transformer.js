import { Container, Graphics, Point } from 'pixi.js';
import { z } from 'zod';
import { isValidationError } from 'zod-validation-error';
import { calcGroupOrientedBounds, calcOrientedBounds } from '../utils/bounds';
import { getViewport } from '../utils/get';
import { getBoundsFromPoints, getObjectLocalCorners } from '../utils/transform';
import { uid } from '../utils/uuid';
import { validate } from '../utils/validator';
import {
  computeResize,
  getHandlePositions,
  RESIZE_HANDLES,
  resizeElementState,
} from './resize-utils';
import SelectionModel from './SelectionModel';
import { Wireframe } from './Wireframe';

const DEFAULT_WIREFRAME_STYLE = {
  thickness: 1.5,
  color: '#1099FF',
};
const DEFAULT_HANDLE_STYLE = {
  fill: '#FFFFFF',
  stroke: '#1099FF',
  size: 8,
};

const HANDLE_CURSORS = {
  'top-left': 'nwse-resize',
  top: 'ns-resize',
  'top-right': 'nesw-resize',
  right: 'ew-resize',
  'bottom-right': 'nwse-resize',
  bottom: 'ns-resize',
  'bottom-left': 'nesw-resize',
  left: 'ew-resize',
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
 * @property {boolean} [resizeHandles=false] - Enable group resize handles.
 * @property {boolean} [resizeHistory=false] - Store history while resizing.
 */

const TransformerSchema = z
  .object({
    elements: z.array(z.any()),
    wireframeStyle: z.record(z.string(), z.unknown()),
    boundsDisplayMode: z.enum(['all', 'groupOnly', 'elementOnly', 'none']),
    resizeHandles: z.boolean(),
    resizeHistory: z.boolean(),
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
   * Flag to store history while resizing.
   * @private
   * @type {boolean}
   */
  _resizeHistory = false;

  /**
   * The container holding resize handle graphics.
   * @private
   * @type {PIXI.Container}
   */
  _resizeHandleLayer;

  /**
   * Active resize session metadata.
   * @private
   * @type {null | object}
   */
  _activeResize = null;

  /**
   * @private
   * @type {Map<string, PIXI.Graphics>}
   */
  _resizeHandleMap = new Map();

  /**
   * @private
   * @type {{ fill: string | number, stroke: string | number, size: number }}
   */
  _resizeHandleStyle = { ...DEFAULT_HANDLE_STYLE };

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
    this.#wireframe = this.addChild(new Wireframe({ type: 'wireframe' }));
    this._resizeHandleLayer = this.addChild(
      new Container({ label: 'resize-handles' }),
    );
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
    if (this.wireframeStyle?.color) {
      this._resizeHandleStyle.stroke = this.wireframeStyle.color;
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
      this.#clearResizeHandles();
      this.#endResizeSession();
    }
    this.update();
  }

  /**
   * Enables or disables history recording during resize.
   * @type {boolean}
   */
  get resizeHistory() {
    return this._resizeHistory;
  }

  set resizeHistory(value) {
    this._resizeHistory = Boolean(value);
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
    this.#endResizeSession();
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
      this.#clearResizeHandles();
      return;
    }

    if (this.boundsDisplayMode !== 'none' || this._resizeHandles) {
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

    const shouldDrawGroupBounds =
      this.boundsDisplayMode === 'all' ||
      this.boundsDisplayMode === 'groupOnly' ||
      this._resizeHandles;

    if (shouldDrawGroupBounds) {
      groupBounds = calcGroupOrientedBounds(elements);
      this.wireframe.drawBounds(groupBounds);
    }

    if (this._resizeHandles) {
      this.#drawResizeHandles(groupBounds?.innerBounds);
    } else {
      this.#clearResizeHandles();
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

  #ensureResizeHandles() {
    if (this._resizeHandleMap.size > 0) return;
    RESIZE_HANDLES.forEach((handle) => {
      const graphic = new Graphics();
      graphic.eventMode = 'static';
      graphic.cursor = HANDLE_CURSORS[handle] ?? 'default';
      graphic.on('pointerdown', (event) =>
        this.#onResizeHandleDown(handle, event),
      );
      this._resizeHandleMap.set(handle, graphic);
      this._resizeHandleLayer.addChild(graphic);
    });
  }

  #clearResizeHandles() {
    this._resizeHandleMap.forEach((handle) => {
      handle.clear();
      handle.visible = false;
    });
  }

  #drawResizeHandles(bounds) {
    if (!bounds) {
      this.#clearResizeHandles();
      return;
    }
    this.#ensureResizeHandles();

    const viewportScale = this._viewport?.scale?.x ?? 1;
    const size = this._resizeHandleStyle.size / viewportScale;
    const halfSize = size / 2;
    const positions = getHandlePositions(bounds);

    this._resizeHandleMap.forEach((handle, key) => {
      const position = positions[key];
      if (!position) {
        handle.visible = false;
        return;
      }
      const localPosition = this.toLocal(new Point(position.x, position.y));
      handle.clear();
      handle
        .rect(-halfSize, -halfSize, size, size)
        .fill({ color: this._resizeHandleStyle.fill })
        .stroke({
          color: this._resizeHandleStyle.stroke,
          width: this.wireframe.strokeStyle.width,
        });
      handle.position.set(localPosition.x, localPosition.y);
      handle.visible = true;
    });
  }

  #onResizeHandleDown(handle, event) {
    if (!this._resizeHandles || !this._viewport) return;
    event.stopPropagation();
    const elements = this.elements;
    if (!elements || elements.length === 0) return;

    const groupBounds = this.#getGroupBoundsInViewportSpace(elements);
    if (!groupBounds) return;

    const startPoint = this._viewport.toWorld(event.global);
    const elementStates = elements.map((element) => {
      const worldPosition = element.getGlobalPosition();
      const viewportPosition = this._viewport.toLocal(worldPosition);
      const size = this.#getElementSize(element);
      return {
        element,
        x: viewportPosition.x,
        y: viewportPosition.y,
        width: size.width,
        height: size.height,
      };
    });

    this._activeResize = {
      handle,
      startPoint,
      bounds: {
        x: groupBounds.x,
        y: groupBounds.y,
        width: groupBounds.width,
        height: groupBounds.height,
      },
      elementStates,
      historyId: this._resizeHistory ? uid() : null,
    };

    this._viewport.on('pointermove', this.#onResizeHandleMove);
    this._viewport.on('pointerup', this.#onResizeHandleUp);
    this._viewport.on('pointerupoutside', this.#onResizeHandleUp);
  }

  #onResizeHandleMove = (event) => {
    if (!this._activeResize || !this._viewport) return;
    event.stopPropagation();
    const currentPoint = this._viewport.toWorld(event.global);
    const delta = {
      x: currentPoint.x - this._activeResize.startPoint.x,
      y: currentPoint.y - this._activeResize.startPoint.y,
    };

    const resizeInfo = computeResize({
      bounds: this._activeResize.bounds,
      handle: this._activeResize.handle,
      delta,
    });

    this._activeResize.elementStates.forEach((state) => {
      const updated = resizeElementState(state, resizeInfo);
      this.#applyElementResize(state.element, updated);
    });

    this.update();
  };

  #onResizeHandleUp = (event) => {
    if (!this._activeResize) return;
    event.stopPropagation();
    this.#endResizeSession();
  };

  #endResizeSession() {
    if (!this._viewport) {
      this._activeResize = null;
      return;
    }
    this._viewport.off('pointermove', this.#onResizeHandleMove);
    this._viewport.off('pointerup', this.#onResizeHandleUp);
    this._viewport.off('pointerupoutside', this.#onResizeHandleUp);
    this._activeResize = null;
  }

  #getElementSize(element) {
    if (element?.props?.size) {
      return element.props.size;
    }
    return { width: element.width, height: element.height };
  }

  #applyElementResize(element, updatedState) {
    if (!element) return;
    const parent = element.parent;
    const localPosition = parent
      ? parent.toLocal(
          new Point(updatedState.x, updatedState.y),
          this._viewport ?? undefined,
        )
      : new Point(updatedState.x, updatedState.y);

    const changes = {
      attrs: {
        x: localPosition.x,
        y: localPosition.y,
      },
    };

    if (this.#canResizeWithSize(element)) {
      changes.size = {
        width: updatedState.width,
        height: updatedState.height,
      };
    } else {
      changes.attrs.width = updatedState.width;
      changes.attrs.height = updatedState.height;
    }

    const historyId = this._activeResize?.historyId;
    element.apply(changes, historyId ? { historyId } : undefined);
  }

  #canResizeWithSize(element) {
    return ['item', 'image', 'text'].includes(element?.type);
  }

  #getGroupBoundsInViewportSpace(elements) {
    if (!this._viewport || !elements || elements.length === 0) return null;
    const corners = elements.flatMap((element) =>
      getObjectLocalCorners(element, this._viewport),
    );
    return getBoundsFromPoints(corners);
  }
}
