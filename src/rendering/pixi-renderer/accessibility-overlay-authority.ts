import {
  Container,
  Rectangle,
  type Application,
  type FederatedPointerEvent,
} from 'pixi.js';

import type {
  PatchMapAccessibilityActivationInput,
  PatchMapAccessibilityRenderNode,
  PatchMapAccessibilitySurfaceProbe,
} from '../../accessibility';

/**
 * Owns the non-visual Pixi accessibility tree, its one delegated click
 * listener, shadow-DOM focus correlation, and deterministic teardown.
 */
export class PatchMapAccessibilityOverlayAuthority {
  private root: Container | null = null;
  private readonly nodes = new Map<string, Container>();
  private readonly idByNode = new Map<Container, string>();
  private activationListener:
    | ((targetId: string, input: PatchMapAccessibilityActivationInput) => void)
    | null = null;
  private clickListener: ((event: FederatedPointerEvent) => void) | null = null;
  private activationSequence = 0;
  private focusedId: string | null = null;
  private destroyedValue = false;

  public constructor(private readonly application: Application) {}

  public setTree(
    nodes: readonly PatchMapAccessibilityRenderNode[],
  ): PatchMapAccessibilitySurfaceProbe {
    this.assertAlive();
    const ids = validateAccessibilityTree(nodes);
    if (nodes.length === 0) {
      this.destroyOverlay();
      return this.probe();
    }
    const root = this.ensureRoot();
    this.removeStaleNodes(root, ids);
    nodes.forEach((node, index) => this.publishNode(root, node, index));
    if (this.focusedId !== null && !this.nodes.has(this.focusedId)) {
      this.focusedId = null;
    }
    const accessibility = this.application.renderer.accessibility;
    if (!accessibility.isActive) accessibility.setAccessibilityEnabled(true);
    this.application.stage.interactiveChildren = true;
    return this.probe();
  }

  public bindActivation(
    listener: (
      targetId: string,
      input: PatchMapAccessibilityActivationInput,
    ) => void,
  ): () => void {
    this.assertAlive();
    if (typeof listener !== 'function') {
      throw new TypeError('accessibility activation listener must be a function');
    }
    if (this.activationListener !== null) {
      throw new Error('accessibility activation listener is already bound');
    }
    this.activationListener = listener;
    return () => {
      if (this.activationListener === listener) this.activationListener = null;
    };
  }

  public focus(targetId: string): boolean {
    this.assertAlive();
    const node = this.nodes.get(targetId);
    if (node === undefined) return false;
    this.focusedId = targetId;
    const system = this.application.renderer.accessibility;
    if (!system.isActive) system.setAccessibilityEnabled(true);
    const shadow = [...system.div.children].find((child) =>
      child instanceof HTMLElement &&
      child.title === node.accessibleTitle &&
      child.tabIndex === node.tabIndex);
    if (shadow instanceof HTMLElement) shadow.focus({ preventScroll: true });
    return true;
  }

  public probe(): PatchMapAccessibilitySurfaceProbe {
    if (this.destroyedValue) return destroyedProbe();
    const system = this.application.renderer.accessibility;
    const shadowRoot = system.isActive ? system.div : null;
    const activeElement = typeof document === 'undefined' ? null : document.activeElement;
    let shadowDomFocusedId: string | null = null;
    if (
      shadowRoot !== null &&
      typeof HTMLElement !== 'undefined' &&
      activeElement instanceof HTMLElement &&
      shadowRoot.contains(activeElement)
    ) {
      for (const [id, node] of this.nodes) {
        if (
          activeElement.title === node.accessibleTitle &&
          activeElement.tabIndex === node.tabIndex
        ) {
          shadowDomFocusedId = id;
          break;
        }
      }
    }
    return Object.freeze({
      active: this.root !== null,
      shadowDomActive: system.isActive,
      overlayNodeCount: this.nodes.size,
      shadowDomNodeCount: shadowRoot?.children.length ?? 0,
      rootListenerCount: this.clickListener === null ? 0 : 1,
      entityListenerCount: 0,
      focusedId: this.focusedId,
      shadowDomFocusedId,
      destroyed: false,
    });
  }

  public destroy(): boolean {
    if (this.destroyedValue) return false;
    this.destroyOverlay();
    this.activationListener = null;
    this.destroyedValue = true;
    return true;
  }

  private ensureRoot(): Container {
    if (this.root !== null) return this.root;
    const root = new Container({ label: 'PatchMap / accessibility overlay' });
    root.eventMode = 'static';
    root.interactiveChildren = true;
    root.accessible = false;
    root.accessibleChildren = true;
    const click = (event: FederatedPointerEvent): void => {
      const targetId = this.idByNode.get(event.target as Container);
      if (targetId === undefined) return;
      this.focusedId = targetId;
      this.activationSequence = this.activationSequence === Number.MAX_SAFE_INTEGER
        ? 1
        : this.activationSequence + 1;
      this.activationListener?.(
        targetId,
        Object.freeze({
          source: 'pixi-click-alias',
          activationId: `pixi:${targetId}:${this.activationSequence}`,
        }),
      );
    };
    root.on('click', click);
    this.clickListener = click;
    this.root = root;
    this.application.stage.addChild(root);
    return root;
  }

  private removeStaleNodes(root: Container, ids: ReadonlySet<string>): void {
    for (const [id, container] of this.nodes) {
      if (ids.has(id)) continue;
      if (container.parent === root) root.removeChild(container);
      this.nodes.delete(id);
      this.idByNode.delete(container);
      container.destroy();
    }
  }

  private publishNode(
    root: Container,
    node: PatchMapAccessibilityRenderNode,
    index: number,
  ): void {
    let container = this.nodes.get(node.id);
    if (container === undefined) {
      container = new Container({ label: `PatchMap / accessibility / ${node.id}` });
      container.eventMode = 'static';
      container.interactiveChildren = false;
      container.accessible = true;
      container.accessibleChildren = true;
      container.accessiblePointerEvents = 'auto';
      root.addChild(container);
      this.nodes.set(node.id, container);
      this.idByNode.set(container, node.id);
    }
    container.accessibleTitle = node.title;
    container.accessibleHint = node.hint;
    container.accessibleText = node.text;
    container.accessibleType = node.type;
    container.tabIndex = node.tabIndex;
    updateAccessibilityRectangle(container, 'boundsArea', node.screenBounds);
    updateAccessibilityRectangle(container, 'hitArea', node.screenBounds);
    if (root.children[index] !== container) root.setChildIndex(container, index);
  }

  private destroyOverlay(): void {
    const root = this.root;
    if (root !== null) {
      if (this.clickListener !== null) root.off('click', this.clickListener);
      if (root.parent !== null) root.parent.removeChild(root);
      for (const child of root.removeChildren()) child.destroy();
      root.destroy();
    }
    this.clickListener = null;
    this.root = null;
    this.nodes.clear();
    this.idByNode.clear();
    this.focusedId = null;
    this.application.stage.interactiveChildren = false;
    const accessibility = this.application.renderer.accessibility;
    if (accessibility.isActive) accessibility.setAccessibilityEnabled(false);
  }

  private assertAlive(): void {
    if (this.destroyedValue) {
      throw new Error('PatchMap accessibility overlay is destroyed');
    }
  }
}

function validateAccessibilityTree(
  nodes: readonly PatchMapAccessibilityRenderNode[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new TypeError(`duplicate accessibility target ${node.id}`);
    ids.add(node.id);
    validateAccessibilityRenderNode(node);
  }
  return ids;
}

function validateAccessibilityRenderNode(node: PatchMapAccessibilityRenderNode): void {
  if (typeof node.id !== 'string' || node.id.length === 0) {
    throw new TypeError('accessibility node ID must be non-empty');
  }
  if (
    typeof node.title !== 'string' ||
    node.title.length === 0 ||
    typeof node.hint !== 'string' ||
    typeof node.text !== 'string'
  ) {
    throw new TypeError('accessibility node text fields are invalid');
  }
  if (!Number.isSafeInteger(node.tabIndex) || node.tabIndex < 0) {
    throw new RangeError('accessibility tabIndex must be non-negative');
  }
  const [x, y, width, height] = node.screenBounds;
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) {
    throw new RangeError('accessibility bounds must be finite and non-negative');
  }
}

function updateAccessibilityRectangle(
  container: Container,
  field: 'boundsArea' | 'hitArea',
  bounds: readonly [number, number, number, number],
): void {
  const current = field === 'boundsArea' ? container.boundsArea : container.hitArea;
  if (current instanceof Rectangle) {
    [current.x, current.y, current.width, current.height] = bounds;
    return;
  }
  const rectangle = new Rectangle(...bounds);
  if (field === 'boundsArea') container.boundsArea = rectangle;
  else container.hitArea = rectangle;
}

function destroyedProbe(): PatchMapAccessibilitySurfaceProbe {
  return Object.freeze({
    active: false,
    shadowDomActive: false,
    overlayNodeCount: 0,
    shadowDomNodeCount: 0,
    rootListenerCount: 0,
    entityListenerCount: 0,
    focusedId: null,
    shadowDomFocusedId: null,
    destroyed: true,
  });
}
