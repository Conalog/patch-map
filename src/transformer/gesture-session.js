export default class GestureSession {
  _getViewport;
  _onMove;
  _onUp;
  _ownsMouseEdgesSession = false;

  constructor({ getViewport, onMove, onUp }) {
    this._getViewport = getViewport;
    this._onMove = onMove;
    this._onUp = onUp;
  }

  start() {
    const viewport = this._getViewport();
    if (!viewport) return;

    this.stop();
    this.#startMouseEdges();
    viewport.on('pointermove', this._onMove);
    viewport.on('pointerup', this._onUp);
    viewport.on('pointerupoutside', this._onUp);
  }

  stop() {
    this.#stopMouseEdges();

    const viewport = this._getViewport();
    if (!viewport) return;

    viewport.off('pointermove', this._onMove);
    viewport.off('pointerup', this._onUp);
    viewport.off('pointerupoutside', this._onUp);
  }

  #startMouseEdges() {
    const viewport = this._getViewport();
    if (!viewport?.plugin?.start || this._ownsMouseEdgesSession) return;

    const mouseEdgesPlugin = viewport?.plugins?.get?.('mouse-edges');
    if (!mouseEdgesPlugin) return;

    const wasPaused = Boolean(mouseEdgesPlugin.paused);
    if (!wasPaused) return;

    viewport.plugin.start('mouse-edges');
    this._ownsMouseEdgesSession = true;
  }

  #stopMouseEdges() {
    if (!this._ownsMouseEdgesSession) return;

    const viewport = this._getViewport();
    viewport?.plugin?.stop?.('mouse-edges');
    this._ownsMouseEdgesSession = false;
  }
}
