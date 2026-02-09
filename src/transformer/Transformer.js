import { Container, Graphics, Point, Rectangle } from 'pixi.js';
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

const CORNER_RESIZE_HANDLES = [
  'top-left',
  'top-right',
  'bottom-right',
  'bottom-left',
];
const EDGE_RESIZE_HANDLES = ['top', 'right', 'bottom', 'left'];
const EDGE_HIT_WIDTH = 12;
const CORNER_HIT_SIZE = 12;
const EDGE_TARGET_Z_INDEX = 1;
const CORNER_HANDLE_Z_INDEX = 2;

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
   * @type {Map<string, PIXI.Graphics>}
   */
  _resizeEdgeMap = new Map();

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
      new Container({ label: 'resize-handles', sortableChildren: true }),
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
    const resizeElements = this.#getResizableElements(elements);
    this.wireframe.clear();

    if (this.#isEmptySelection(elements)) return this.#finishEmptyDraw();

    this.#syncWireframeStrokeWidth();
    this.#drawElementBounds(elements);
    this.#drawGroupBounds(elements);
    this.#drawResizeHandlesFor(elements, resizeElements);
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

  #finishEmptyDraw() {
    this._renderDirty = false;
    this.#clearResizeHandles();
  }

  #syncWireframeStrokeWidth() {
    if (this.boundsDisplayMode === 'none' && !this._resizeHandles) return;
    this.wireframe.strokeStyle.width =
      this.wireframeStyle.thickness / (this._viewport?.scale?.x ?? 1);
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
    const shouldShowResizeHandles = this.#shouldShowResizeHandles();
    if (
      this.boundsDisplayMode !== 'all' &&
      this.boundsDisplayMode !== 'groupOnly' &&
      !shouldShowResizeHandles
    ) {
      return;
    }
    const groupBounds = calcGroupOrientedBounds(elements);
    if (groupBounds) {
      this.wireframe.drawBounds(groupBounds);
    }
  }

  #drawResizeHandlesFor(elements, resizeElements) {
    if (!this.#shouldShowResizeHandles()) {
      this.#clearResizeHandles();
      return;
    }
    if (!resizeElements || resizeElements.length === 0) {
      this.#clearResizeHandles();
      return;
    }
    const resizeBounds = this.#getGroupBoundsInViewportSpace(elements);
    this.#drawResizeHandles(resizeBounds);
  }

  #ensureResizeHandles() {
    if (this._resizeHandleMap.size > 0) return;
    CORNER_RESIZE_HANDLES.forEach((handle) => {
      const graphic = new Graphics();
      graphic.eventMode = 'static';
      graphic.zIndex = CORNER_HANDLE_Z_INDEX;
      graphic.label = `resize-handle:${handle}`;
      graphic.cursor = HANDLE_CURSORS[handle] ?? 'default';
      graphic.on('pointerdown', (event) =>
        this.#onResizeHandleDown(handle, event),
      );
      this._resizeHandleMap.set(handle, graphic);
      this._resizeHandleLayer.addChild(graphic);
    });
  }

  #ensureResizeEdges() {
    if (this._resizeEdgeMap.size > 0) return;
    EDGE_RESIZE_HANDLES.forEach((handle) => {
      const graphic = new Graphics();
      graphic.eventMode = 'static';
      graphic.zIndex = EDGE_TARGET_Z_INDEX;
      graphic.label = `resize-edge:${handle}`;
      graphic.cursor = HANDLE_CURSORS[handle] ?? 'default';
      graphic.on('pointerdown', (event) =>
        this.#onResizeHandleDown(handle, event),
      );
      this._resizeEdgeMap.set(handle, graphic);
      this._resizeHandleLayer.addChild(graphic);
    });
  }

  #clearResizeHandles() {
    this._resizeHandleMap.forEach((handle) => {
      handle.clear();
      handle.visible = false;
      handle.hitArea = null;
    });
    this._resizeEdgeMap.forEach((edge) => {
      edge.clear();
      edge.visible = false;
    });
  }

  #drawResizeHandles(bounds) {
    if (!bounds) {
      this.#clearResizeHandles();
      return;
    }
    this.#ensureResizeHandles();
    this.#ensureResizeEdges();

    const viewportScale = this._viewport?.scale?.x ?? 1;
    const size = this._resizeHandleStyle.size / viewportScale;
    const halfSize = size / 2;
    const hitSize = Math.max(size, CORNER_HIT_SIZE / viewportScale);
    const halfHitSize = hitSize / 2;
    const positions = getHandlePositions(bounds);

    this._resizeHandleMap.forEach((handle, key) => {
      const position = positions[key];
      if (!position) {
        handle.visible = false;
        return;
      }
      const localPosition = this.toLocal(
        new Point(position.x, position.y),
        this._viewport ?? undefined,
      );
      handle.hitArea = new Rectangle(
        -halfHitSize,
        -halfHitSize,
        hitSize,
        hitSize,
      );
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

    this.#drawResizeEdgeTargets(bounds, positions, viewportScale);
  }

  #drawResizeEdgeTargets(bounds, positions, viewportScale) {
    const edgeHitWidth = EDGE_HIT_WIDTH / viewportScale;
    const minEdgeSize = 1 / viewportScale;
    const topLeft = this.toLocal(
      new Point(bounds.x, bounds.y),
      this._viewport ?? undefined,
    );
    const topRight = this.toLocal(
      new Point(bounds.x + bounds.width, bounds.y),
      this._viewport ?? undefined,
    );
    const bottomRight = this.toLocal(
      new Point(bounds.x + bounds.width, bounds.y + bounds.height),
      this._viewport ?? undefined,
    );
    const bottomLeft = this.toLocal(
      new Point(bounds.x, bounds.y + bounds.height),
      this._viewport ?? undefined,
    );
    const leftX = Math.min(topLeft.x, bottomLeft.x);
    const rightX = Math.max(topRight.x, bottomRight.x);
    const topY = Math.min(topLeft.y, topRight.y);
    const bottomY = Math.max(bottomLeft.y, bottomRight.y);
    const edgeAreas = {
      top: {
        x: leftX,
        y: topY - edgeHitWidth / 2,
        width: Math.max(minEdgeSize, rightX - leftX),
        height: edgeHitWidth,
      },
      right: {
        x: rightX - edgeHitWidth / 2,
        y: topY,
        width: edgeHitWidth,
        height: Math.max(minEdgeSize, bottomY - topY),
      },
      bottom: {
        x: leftX,
        y: bottomY - edgeHitWidth / 2,
        width: Math.max(minEdgeSize, rightX - leftX),
        height: edgeHitWidth,
      },
      left: {
        x: leftX - edgeHitWidth / 2,
        y: topY,
        width: edgeHitWidth,
        height: Math.max(minEdgeSize, bottomY - topY),
      },
    };

    this._resizeEdgeMap.forEach((edge, key) => {
      const area = edgeAreas[key];
      if (!area) {
        edge.visible = false;
        return;
      }
      edge.clear();
      edge
        .rect(area.x, area.y, area.width, area.height)
        .fill({ color: this._resizeHandleStyle.fill, alpha: 0.001 });
      edge.visible = Boolean(positions[key]);
    });
  }

  #onResizeHandleDown(handle, event) {
    if (!this.#shouldShowResizeHandles() || !this._viewport) return;
    event.stopPropagation();
    const selectedElements = this.elements;
    if (!selectedElements || selectedElements.length === 0) return;
    const resizeElements = this.#getResizableElements(selectedElements);
    if (!resizeElements || resizeElements.length === 0) return;

    this.#endResizeSession();
    const groupBounds = this.#getGroupBoundsInViewportSpace(selectedElements);
    if (!groupBounds) return;

    const startPoint = this._viewport.toWorld(event.global);
    const elementStates = resizeElements.map((element) => {
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
        x: groupBounds.x ?? 0,
        y: groupBounds.y ?? 0,
        width: groupBounds.width ?? 0,
        height: groupBounds.height ?? 0,
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
      keepRatio: Boolean(event.shiftKey),
    });

    this._activeResize.elementStates.forEach((state) => {
      const updated = resizeElementState(state, resizeInfo);
      this.#applyElementResize(state.element, updated);
    });

    this.#emitUpdateElements();
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
    if (!element || !this.#isResizableElement(element)) return;
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
      size: {
        width: updatedState.width,
        height: updatedState.height,
      },
    };

    const historyId = this._activeResize?.historyId;
    element.apply(changes, historyId ? { historyId } : undefined);
  }

  #isResizableElement(element) {
    return Boolean(element?.constructor?.isResizable);
  }

  #shouldShowResizeHandles() {
    return this._resizeHandles && this.boundsDisplayMode !== 'none';
  }

  #emitUpdateElements({
    current = this.elements,
    added = [],
    removed = [],
  } = {}) {
    this.emit('update_elements', { target: this, current, added, removed });
  }

  #getResizableElements(elements) {
    if (!Array.isArray(elements) || elements.length === 0) return [];
    return elements.filter((element) => this.#isResizableElement(element));
  }

  #getGroupBoundsInViewportSpace(elements) {
    if (!this._viewport || !elements || elements.length === 0) return null;
    const corners = elements.flatMap((element) =>
      getObjectLocalCorners(element, this._viewport),
    );
    return getBoundsFromPoints(corners);
  }
}
