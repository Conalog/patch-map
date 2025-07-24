import { Container } from 'pixi.js';
import { calcGroupOrientedBounds, calcOrientedBounds } from '../utils/bounds';
import { Wireframe } from './wireframe';

const DEFAULT_WIREFRAME_STYLE = {
  thickness: 1.5,
  color: '#1099FF',
};

export class Transformer extends Container {
  _renderDirty = true;

  constructor(options = {}) {
    super({ zIndex: 999, isRenderGroup: true });
    this.wireframe = this.addChild(new Wireframe(this));
    this.onRender = this._refresh.bind(this);

    this._elements = options.elements || [];
    this.lazyMode = options.lazyMode || false;
    this._wireframeStyle = Object.assign(
      DEFAULT_WIREFRAME_STYLE,
      options.wireframeStyle || {},
    );
    this.boundsDisplayMode = options.boundsDisplayMode || 'all'; // 'all | 'groupOnly' | 'elementOnly' | 'none'
  }

  get elements() {
    return this._elements;
  }

  set elements(value) {
    this._elements = Array.isArray(value) ? value : [value];
    if (this.lazyMode) {
      this.update();
    }
  }

  get wireframeStyle() {
    return this._wireframeStyle;
  }

  set wireframeStyle(value) {
    this._wireframeStyle = Object.assign(this._wireframeStyle, value);
  }

  destroy(options) {
    this.onRender = null;
    super.destroy(options);
  }

  _refresh() {
    if (
      this.renderable &&
      this.visible &&
      (!this.lazyMode || this._renderDirty)
    ) {
      this.draw();
    }
  }

  draw() {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const { color, thickness } = this._wireframeStyle;
    this.wireframe.clear();
    if (this.boundsDisplayMode !== 'none') {
      this.wireframe.setStrokeStyle({
        width: thickness / this.parent.scale.x,
        color,
      });
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

  update() {
    this._renderDirty = true;
  }
}
