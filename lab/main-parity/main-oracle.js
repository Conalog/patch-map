// The verifier resolves this alias to the built public ESM package from the
// detached, read-only main worktree. This page never imports Core v2, so Pixi
// extension registries remain isolated.
import { Patchmap, Transformer } from '@patch-map-main-oracle';

const host = document.querySelector('#oracle-host');
if (!(host instanceof HTMLElement)) throw new Error('missing main parity host');

let patchmap = null;
let lifecycle = 'new';
let lastInput = null;
let lastInputDigest = null;
let requestedElements = [];
let diagnostics = [];
let transformer = null;
let width = 800;
let height = 600;
let pixelRatio = 1;

window.__PATCH_MAP_MAIN_PARITY__ = Object.freeze({
  kind: 'main',
  initialize,
  load,
  act,
  observe,
  destroy,
});

document.body.dataset.oracleReady = 'true';

async function initialize(options = {}) {
  if (patchmap !== null) await destroy();
  width = finitePositive(options.width, 800);
  height = finitePositive(options.height, 600);
  pixelRatio = finitePositive(options.pixelRatio, 1);
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.replaceChildren();
  diagnostics = [];
  requestedElements = [];
  lastInput = null;
  lastInputDigest = null;
  lifecycle = 'initializing';
  patchmap = new Patchmap();
  await patchmap.init(host, {
    app: {
      width,
      height,
      resolution: pixelRatio,
      autoDensity: true,
      antialias: true,
      background: '#FAFAFA',
      preference: 'webgl',
    },
    viewport: {
      plugins: {
        clampZoom: { minScale: 0.025, maxScale: 30 },
        drag: {},
        wheel: {},
        decelerate: { disabled: true },
      },
    },
  });
  lifecycle = 'ready-empty';
  await settle();
  return observe();
}

async function load(input) {
  requirePatchmap('load');
  const detached = structuredClone(input);
  requestedElements = collectRequestedElements(detached);
  lastInput = detached;
  lastInputDigest = stableJson(detached);
  patchmap.draw(detached);
  transformer = new Transformer({
    boundsDisplayMode: 'all',
    resizeHandles: true,
    rotateHandles: true,
    transformHistory: true,
  });
  patchmap.transformer = transformer;
  patchmap.stateManager.setState('selection', {
    draggable: true,
    onClick: (target) => {
      if (transformer !== null) transformer.elements = target ? [target] : [];
    },
    onDoubleClick: (target) => {
      if (transformer !== null) transformer.elements = target ? [target] : [];
    },
    onRightClick: (target) => {
      if (transformer !== null) transformer.elements = target ? [target] : [];
    },
    onDragEnd: (targets) => {
      if (transformer !== null) transformer.elements = targets ?? [];
    },
  });
  lifecycle = Array.isArray(detached) && detached.length === 0
    ? 'ready-empty'
    : 'scene-ready';
  await settle(3);
  return observe();
}

async function act(action) {
  const runtime = requirePatchmap('act');
  switch (action.type) {
    case 'fit':
      runtime.fit(action.ids, { padding: action.padding ?? 24 });
      break;
    case 'focus':
      runtime.focus(action.ids);
      break;
    case 'set-view': {
      const center = action.centerWorld ?? [width / 2, height / 2];
      const scale = finitePositive(action.scale, 1);
      runtime.viewport.setZoom(scale, true);
      runtime.viewport.moveCenter(center[0], center[1]);
      break;
    }
    case 'world-transform': {
      const world = action.world ?? {
        rotationDegrees: 0,
        flipX: false,
        flipY: false,
      };
      runtime.rotation.value = world.rotationDegrees;
      runtime.flip.set({ x: world.flipX, y: world.flipY });
      break;
    }
    case 'select': {
      const selected = (action.ids ?? []).flatMap((id) => selectById(runtime, id));
      if (transformer !== null) transformer.elements = selected;
      break;
    }
    case 'transform': {
      const selected = (action.ids ?? []).flatMap((id) => selectById(runtime, id));
      if (transformer !== null) transformer.elements = selected;
      runtime.update({
        elements: selected,
        changes: action.mainChanges ?? {},
        history: true,
        relativeTransform: false,
        ...(action.transformKind === 'rotate' ? { rotateOrigin: 'center' } : {}),
      });
      break;
    }
    case 'update-component': {
      if (typeof action.componentId !== 'string') {
        throw new TypeError('update-component requires componentId');
      }
      const components = selectById(runtime, action.componentId);
      runtime.update({
        elements: components,
        changes: action.changes ?? {},
        history: action.history ?? false,
        relativeTransform: false,
      });
      break;
    }
    case 'update-element': {
      if (typeof action.id !== 'string') throw new TypeError('update-element requires id');
      const elements = selectById(runtime, action.id);
      runtime.update({
        elements,
        changes: action.changes ?? {},
        history: action.history ?? false,
        relativeTransform: action.relativeTransform ?? false,
        ...(action.rotateOrigin === undefined ? {} : { rotateOrigin: action.rotateOrigin }),
      });
      break;
    }
    case 'undo':
      runtime.undoRedoManager.undo();
      break;
    case 'redo':
      runtime.undoRedoManager.redo();
      break;
    case 'wait':
      await delay(action.durationMs ?? 0);
      break;
    case 'resize': {
      width = finitePositive(action.width, width);
      height = finitePositive(action.height, height);
      pixelRatio = finitePositive(action.pixelRatio, pixelRatio);
      host.style.width = `${width}px`;
      host.style.height = `${height}px`;
      globalThis.dispatchEvent(new Event('resize'));
      break;
    }
    case 'publish':
      break;
    case 'browser-click':
    case 'browser-drag':
    case 'browser-wheel':
      // Browser-owned actions are driven by Playwright in the parent verifier.
      break;
    default:
      throw new TypeError(`unsupported main parity action: ${String(action.type)}`);
  }
  await settle(action.type === 'resize' ? 4 : 2);
  return observe();
}

async function observe() {
  const runtime = patchmap;
  const canvas = host.querySelector('canvas');
  const entities = runtime === null
    ? requestedElements.map(missingEntity)
    : requestedElements.map((requested) => observeEntity(runtime, requested));
  const viewport = runtime?.viewport ?? null;
  return Object.freeze({
    runtime: 'main',
    lifecycle,
    canvasCount: host.querySelectorAll('canvas').length,
    canvasCssSize: canvas instanceof HTMLCanvasElement
      ? Object.freeze([canvas.clientWidth, canvas.clientHeight])
      : null,
    canvasBackingSize: canvas instanceof HTMLCanvasElement
      ? Object.freeze([canvas.width, canvas.height])
      : null,
    inputUnchanged: lastInput === null ? null : stableJson(lastInput) === lastInputDigest,
    entityCount: entities.filter(({ present }) => present).length,
    entities: Object.freeze(entities),
    selectionIds: Object.freeze(
      (transformer?.elements ?? []).flatMap((element) => {
        const id = publicId(element);
        return id === null ? [] : [id];
      }),
    ),
    history: Object.freeze({
      canUndo: runtime?.undoRedoManager?.canUndo?.() ?? false,
      canRedo: runtime?.undoRedoManager?.canRedo?.() ?? false,
      undoDepth: null,
      redoDepth: null,
    }),
    viewport: Object.freeze({
      centerWorld: viewport && Number.isFinite(viewport.center?.x) && Number.isFinite(viewport.center?.y)
        ? Object.freeze([viewport.center.x, viewport.center.y])
        : null,
      scale: viewport && Number.isFinite(viewport.scale?.x) ? viewport.scale.x : null,
      wheelProbeWorld: viewportWorldAt(runtime, 300, 220),
    }),
    world: Object.freeze({
      rotationDegrees: runtime && Number.isFinite(runtime.rotation?.value)
        ? runtime.rotation.value
        : 0,
      flipX: runtime?.flip?.x === true,
      flipY: runtime?.flip?.y === true,
    }),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function viewportWorldAt(runtime, x, y) {
  const viewport = runtime?.viewport;
  try {
    const point = viewport?.toWorld?.(x, y);
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      return Object.freeze([point.x, point.y]);
    }
  } catch (error) {
    diagnostics.push(`viewport-to-world:${safeError(error)}`);
  }
  if (
    viewport &&
    Number.isFinite(viewport.center?.x) &&
    Number.isFinite(viewport.center?.y) &&
    Number.isFinite(viewport.scale?.x) &&
    viewport.scale.x > 0
  ) {
    return Object.freeze([
      viewport.center.x + (x - width / 2) / viewport.scale.x,
      viewport.center.y + (y - height / 2) / viewport.scale.x,
    ]);
  }
  return null;
}

async function destroy() {
  if (patchmap !== null) {
    lifecycle = 'destroying';
    try {
      await patchmap.destroy();
    } catch (error) {
      diagnostics.push(safeError(error));
    }
  }
  patchmap = null;
  transformer = null;
  lifecycle = 'destroyed';
  await settle();
  return observe();
}

function observeEntity(runtime, requested) {
  const matches = selectById(runtime, requested.id);
  const element = matches[0];
  if (element === undefined) return missingEntity(requested);
  const publicText = requested.type === 'text'
    ? publicTextNode(element)
    : null;
  let bounds = null;
  try {
    const value = element.getBounds?.();
    if (
      value
      && [value.x, value.y, value.width, value.height].every(Number.isFinite)
    ) {
      bounds = Object.freeze([value.x, value.y, value.width, value.height]);
    }
  } catch (error) {
    diagnostics.push(`getBounds:${requested.id}:${safeError(error)}`);
  }
  return Object.freeze({
    id: requested.id,
    scope: requested.scope,
    ownerId: requested.ownerId,
    requestedType: requested.type,
    present: true,
    visible: typeof element.visible === 'boolean' ? element.visible : null,
    renderable: typeof element.renderable === 'boolean' ? element.renderable : null,
    bounds,
    center: bounds === null
      ? null
      : Object.freeze([bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2]),
    rotationDegrees: Number.isFinite(element.angle)
      ? element.angle
      : Number.isFinite(element.rotation)
        ? element.rotation * 180 / Math.PI
        : null,
    alpha: Number.isFinite(element.alpha) ? element.alpha : null,
    textContent: typeof publicText?.text === 'string' ? publicText.text : null,
    textPublication: publicText === null
      ? null
      : publicText.visible === false || publicText.renderable === false
        ? 'absent'
        : 'current',
  });
}

function missingEntity(requested) {
  return Object.freeze({
    id: requested.id,
    scope: requested.scope,
    ownerId: requested.ownerId,
    requestedType: requested.type,
    present: false,
    visible: null,
    renderable: null,
    bounds: null,
    center: null,
    rotationDegrees: null,
    alpha: null,
    textContent: null,
    textPublication: null,
  });
}

function publicTextNode(element) {
  if (typeof element?.text === 'string') return element;
  const children = Array.isArray(element?.children) ? element.children : [];
  for (const child of children) {
    if (typeof child?.text === 'string') return child;
  }
  return null;
}

function selectById(runtime, id) {
  try {
    return runtime.selector(`$..[?(@.id==${JSON.stringify(id)})]`) ?? [];
  } catch (error) {
    diagnostics.push(`selector:${id}:${safeError(error)}`);
    return [];
  }
}

function collectRequestedElements(input) {
  const output = [];
  const visit = (value, ownerId = null, scope = 'element') => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, ownerId, scope));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    if (
      typeof value.id === 'string'
      && typeof value.type === 'string'
      && value.type !== 'relations'
      && !output.some((entry) => (
        entry.id === value.id
        && entry.scope === scope
        && entry.ownerId === ownerId
      ))
    ) {
      output.push(Object.freeze({
        id: value.id,
        type: value.type,
        scope,
        ownerId,
      }));
    }
    if (Array.isArray(value.children)) {
      value.children.forEach((entry) => visit(entry, null, 'element'));
    }
    if (typeof value.id === 'string' && Array.isArray(value.components)) {
      value.components.forEach((entry) => visit(entry, value.id, 'component'));
    }
    if (
      typeof value.id === 'string'
      && value.item
      && typeof value.item === 'object'
      && Array.isArray(value.item.components)
    ) {
      value.item.components.forEach((entry) => visit(entry, value.id, 'component'));
    }
  };
  visit(input, null, 'element');
  return Object.freeze(output);
}

function publicId(element) {
  if (typeof element?.id === 'string') return element.id;
  if (typeof element?.label === 'string') return element.label;
  return null;
}

async function settle(frames = 2) {
  await document.fonts.ready;
  for (let index = 0; index < frames; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function requirePatchmap(operation) {
  if (patchmap === null) throw new Error(`${operation} requires initialized main Patchmap`);
  return patchmap;
}

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeError(error) {
  return error instanceof Error ? `${error.name}:${error.message}` : String(error);
}

function stableJson(value) {
  return JSON.stringify(value);
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, durationMs)));
}
