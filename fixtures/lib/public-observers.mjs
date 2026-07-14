import { UPDATE_PRIORITY } from 'pixi.js';

const PUBLIC_TYPES = new Set([
  'group',
  'grid',
  'item',
  'relations',
  'image',
  'text',
  'rect',
  'background',
  'bar',
  'icon',
]);
const VOLATILE_GENERATED_ID = /^[A-Za-z0-9_-]{15}$/;

const round = (value) =>
  Number.isFinite(value) ? Number(value.toFixed(4)) : null;

export const createHost = () => {
  const host = document.querySelector('#fixture-host');
  host.replaceChildren();
  for (const snapshot of document.querySelectorAll('[id^="oracle-"][id$="-snapshot"]')) {
    snapshot.remove();
  }
  host.style.width = '640px';
  host.style.height = '480px';
  return host;
};

export const fixedInitOptions = () => ({
  app: {
    width: 640,
    height: 480,
    resolution: 1,
    autoDensity: false,
    background: '#FAFAFA',
  },
  viewport: {
    plugins: { decelerate: { disabled: true } },
  },
});

export const snapshotDom = (host) => {
  const canvases = [...host.querySelectorAll('canvas')];
  return {
    hostChildElementCount: host.childElementCount,
    canvasCount: canvases.length,
    canvases: canvases.map((canvas) => ({
      connected: canvas.isConnected,
      width: canvas.width,
      height: canvas.height,
      cssWidth: canvas.style.width || null,
      cssHeight: canvas.style.height || null,
    })),
  };
};

export const snapshotPatchmap = (patchmap) => ({
  isInit: patchmap.isInit,
  appReady: patchmap.app !== null,
  viewportReady: patchmap.viewport !== null,
  worldReady: patchmap.world !== null,
  transformerReady: patchmap.transformer !== null,
  stateManagerReady: patchmap.stateManager !== null,
  undoRedoManagerReady: patchmap.undoRedoManager !== null,
});

export const normalizeReturn = (value, { patchmap } = {}) => {
  if (value === undefined) return { kind: 'undefined' };
  if (value === null) return { kind: 'null' };
  if (value === patchmap) return { kind: 'patchmap-reference' };
  for (const property of [
    'app',
    'viewport',
    'world',
    'transformer',
    'stateManager',
    'undoRedoManager',
  ]) {
    if (value && value === patchmap?.[property]) {
      return { kind: 'public-reference', property };
    }
  }
  if (typeof Event !== 'undefined' && value instanceof Event) {
    return {
      kind: 'event',
      type: value.type,
      target: normalizeEventTarget(value.target, patchmap),
    };
  }
  if (Array.isArray(value)) {
    if (value.every(isPublicElementReference)) {
      return {
        kind: 'element-references',
        value: value.map(publicElementIdentity),
      };
    }
    if (value.every(isPublicMapDataObject)) {
      return { kind: 'map-data', value: normalizeGeneratedIds(cloneJson(value)) };
    }
    return { kind: 'array', length: value.length };
  }
  if (isPublicElementReference(value)) {
    return { kind: 'element-reference', value: publicElementIdentity(value) };
  }
  const eventLike = normalizePublicEventLike(value, patchmap);
  if (eventLike) return eventLike;
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return { kind: typeof value, value };
  }
  return { kind: typeof value };
};

export const normalizeError = (error) => ({
  name: typeof error?.name === 'string' ? error.name : 'Error',
  message: typeof error?.message === 'string' ? error.message : String(error),
});

export const normalizePublicValue = (value, { patchmap } = {}) => {
  if (value === undefined) return { kind: 'undefined' };
  if (value === null) return { kind: 'null' };
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return { kind: typeof value, value };
  }
  if (Array.isArray(value) || isPlainObject(value)) {
    return {
      kind: 'json',
      value: normalizeGeneratedIds(cloneJson(value)),
    };
  }
  if (
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    !isPublicElementReference(value)
  ) {
    return {
      kind: 'public-point',
      x: round(value.x),
      y: round(value.y),
    };
  }
  return normalizeReturn(value, { patchmap });
};

export const capturePublicCall = (
  input,
  invoke,
  { patchmap, normalize = normalizePublicValue } = {},
) => {
  const inputBefore = cloneJson(input);
  try {
    const returned = invoke();
    const inputAfter = cloneJson(input);
    return {
      outcome: { returned: normalize(returned, { patchmap }) },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  } catch (error) {
    const inputAfter = cloneJson(input);
    return {
      outcome: { threw: normalizeError(error) },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  }
};

export const capturePublicAsyncCall = async (
  input,
  invoke,
  options = {},
) => {
  const inputBefore = cloneJson(input);
  try {
    const returned = await invoke();
    const inputAfter = cloneJson(input);
    return {
      outcome: {
        returned: (options.normalize ?? normalizePublicValue)(returned, {
          patchmap: options.patchmap,
        }),
      },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  } catch (error) {
    const inputAfter = cloneJson(input);
    return {
      outcome: { threw: normalizeError(error) },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  }
};

export const normalizeEventArgs = (args, patchmap) =>
  args.map((value) => normalizeReturn(value, { patchmap }));

export const waitForAsyncEvents = async (patchmap) => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (patchmap?.app?.ticker?.started) {
    await new Promise((resolve) => patchmap.app.ticker.addOnce(resolve));
  }
};

export const waitForRenderedFrame = async (patchmap) => {
  await document.fonts.ready;
  if (!patchmap?.app?.ticker?.started) {
    patchmap?.app?.render();
    return;
  }
  await new Promise((resolve) =>
    patchmap.app.ticker.addOnce(
      resolve,
      undefined,
      UPDATE_PRIORITY.LOW - 1,
    ),
  );
};

export const captureDraw = (patchmap, input) => {
  const inputBefore = cloneJson(input);
  try {
    const value = patchmap.draw(input);
    const inputAfter = cloneJson(input);
    return {
      outcome: { returned: normalizeReturn(value, { patchmap }) },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  } catch (error) {
    const inputAfter = cloneJson(input);
    return {
      outcome: { threw: normalizeError(error) },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  }
};

export const captureUpdate = (patchmap, options) => {
  const inputBefore = snapshotUpdateOptions(options);
  try {
    const value = patchmap.update(options);
    const inputAfter = snapshotUpdateOptions(options);
    return {
      outcome: { returned: normalizeReturn(value, { patchmap }) },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  } catch (error) {
    const inputAfter = snapshotUpdateOptions(options);
    return {
      outcome: { threw: normalizeError(error) },
      inputBefore,
      inputAfter,
      inputUnchanged: JSON.stringify(inputBefore) === JSON.stringify(inputAfter),
    };
  }
};

export const snapshotManagedScene = (root) => {
  const output = [];
  visitChildren(root?.children ?? [], output, null);
  return normalizeGeneratedIds(output);
};

export const snapshotElement = (element) => {
  const bounds = readBounds(element);
  return {
    id: element?.id ?? null,
    type: element?.type ?? null,
    label: element?.props?.label ?? null,
    parent: hasPublicType(element?.parent)
      ? {
          id: element.parent.id ?? null,
          type: element.parent.type ?? null,
          label: element.parent.props?.label ?? null,
        }
      : element?.parent
        ? { kind: 'world-root' }
        : null,
    props: clonePublicJson(element?.props ?? null),
    transform: {
      x: round(element?.x),
      y: round(element?.y),
      angle: round(element?.angle),
      rotation: round(element?.rotation),
      scaleX: round(element?.scale?.x),
      scaleY: round(element?.scale?.y),
    },
    dimensions: {
      width: round(element?.width),
      height: round(element?.height),
    },
    visibility: {
      visible: element?.visible ?? null,
      renderable: element?.renderable ?? null,
    },
    destroyed: element?.destroyed ?? null,
    bounds,
    managedChildren: (element?.children ?? []).filter(hasPublicType).length,
  };
};

export const flattenSelectorResult = (value) => {
  if (!Array.isArray(value)) return value ? [value] : [];
  return value.flatMap((item) =>
    Array.isArray(item) ? flattenSelectorResult(item) : item ? [item] : [],
  );
};

export const findById = (patchmap, id) =>
  flattenSelectorResult(
    patchmap.selector(`$..children[?(@.id===${JSON.stringify(id)})]`),
  ).find((element) => element?.id === id) ?? null;

export const canvasPixelDigest = async (canvas) => {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext('2d', { willReadFrequently: true });
  context.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff';
  context.fillRect(0, 0, copy.width, copy.height);
  context.drawImage(canvas, 0, 0);
  const bytes = context.getImageData(0, 0, copy.width, copy.height).data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

export const preserveCanvasSnapshot = (
  canvas,
  id = 'oracle-before-snapshot',
) => {
  const copy = document.createElement('canvas');
  copy.id = id;
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.style.width = `${canvas.clientWidth}px`;
  copy.style.height = `${canvas.clientHeight}px`;
  const context = copy.getContext('2d');
  context.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff';
  context.fillRect(0, 0, copy.width, copy.height);
  context.drawImage(canvas, 0, 0);
  copy.hidden = true;
  document.body.appendChild(copy);
  return copy;
};

export const roundNumber = round;

const publicElementIdentity = (element) => ({
  id: element.id ?? null,
  type: element.type ?? null,
  label: element.label ?? null,
});

const isPublicElementReference = (value) =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.type === 'string' &&
      ('props' in value || 'parent' in value),
  );

const isPublicMapDataObject = (value) =>
  Boolean(
    value &&
      Object.getPrototypeOf(value) === Object.prototype &&
      typeof value.type === 'string',
  );

const isPlainObject = (value) =>
  Boolean(value && Object.getPrototypeOf(value) === Object.prototype);

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const clonePublicJson = (value) => {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
};

const hasPublicType = (value) =>
  Boolean(value && PUBLIC_TYPES.has(value.type));

const visitChildren = (children, output, nearestManagedParentId) => {
  for (const child of children) {
    const isManaged = hasPublicType(child);
    if (isManaged) {
      const snapshot = snapshotElement(child);
      snapshot.nearestManagedParentId = nearestManagedParentId;
      output.push(snapshot);
    }
    visitChildren(
      child?.children ?? [],
      output,
      isManaged ? child.id ?? null : nearestManagedParentId,
    );
  }
};

const readBounds = (element) => {
  if (!element || typeof element.getBounds !== 'function') return null;
  try {
    const bounds = element.getBounds();
    return {
      x: round(bounds.x),
      y: round(bounds.y),
      width: round(bounds.width),
      height: round(bounds.height),
      centerX: round(bounds.x + bounds.width / 2),
      centerY: round(bounds.y + bounds.height / 2),
    };
  } catch {
    return null;
  }
};

const normalizeEventTarget = (target, patchmap) => {
  if (target === patchmap) return 'patchmap';
  if (target === patchmap?.app?.canvas) return 'canvas';
  return target === null ? null : 'other-public-object';
};

const normalizePublicEventLike = (value, patchmap) => {
  if (!value || typeof value !== 'object') return null;
  const output = { kind: 'public-event-payload' };
  let observed = false;
  if (typeof value.type === 'string') {
    output.type = value.type;
    observed = true;
  }
  if ('target' in value) {
    output.target = normalizeEventTarget(value.target, patchmap);
    observed = true;
  }
  if (Array.isArray(value.elements)) {
    output.elements = normalizeReturn(value.elements, { patchmap });
    observed = true;
  }
  if (Array.isArray(value.data) && value.data.every(isPublicMapDataObject)) {
    output.data = normalizeReturn(value.data, { patchmap });
    observed = true;
  }
  if (value.detail !== undefined) {
    output.detail = normalizeReturn(value.detail, { patchmap });
    observed = true;
  }
  return observed ? output : null;
};

export const normalizeGeneratedIds = (value) => {
  const ids = new Map();
  let nextId = 1;
  const visit = (item, key) => {
    if (Array.isArray(item)) return item.map((entry) => visit(entry, null));
    if (!item || typeof item !== 'object') {
      if (key === 'id' && typeof item === 'string' && VOLATILE_GENERATED_ID.test(item)) {
        if (!ids.has(item)) ids.set(item, `<generated-id:${nextId++}>`);
        return ids.get(item);
      }
      return item;
    }
    return Object.fromEntries(
      Object.entries(item).map(([entryKey, entryValue]) => [
        entryKey,
        visit(entryValue, entryKey),
      ]),
    );
  };
  return visit(value, null);
};

const snapshotUpdateOptions = (options) => {
  const output = {};
  for (const key of [
    'path',
    'changes',
    'mergeStrategy',
    'refresh',
    'relativeTransform',
    'rotateOrigin',
    'history',
    'validateSchema',
    'normalize',
    'emit',
  ]) {
    if (key in options) output[key] = clonePublicJson(options[key]);
  }
  if ('elements' in options) {
    const elements = Array.isArray(options.elements)
      ? options.elements
      : [options.elements];
    output.elements = elements.filter(Boolean).map(publicElementIdentity);
  }
  return output;
};
