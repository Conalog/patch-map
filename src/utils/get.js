import { Viewport } from 'pixi-viewport';

export const getNestedValue = (object, path) => {
  if (typeof path !== 'string' || !path) {
    return null;
  }

  return path
    .split('.')
    .reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), object);
};

export const getColor = (theme, color) => {
  if (typeof color !== 'string') {
    return color;
  }
  const themeColor = getNestedValue(theme, color);
  return themeColor ?? color;
};

export const getViewport = (displayObject) => {
  if (!displayObject) return null;

  if (displayObject?.store?.viewport) {
    return displayObject.store.viewport;
  }
  if (displayObject instanceof Viewport) {
    return displayObject;
  }
  return getViewport(displayObject.parent);
};

export const isLocked = (displayObject) =>
  Boolean(displayObject?.props?.locked);

export const hasLockedAncestor = (displayObject, stopAt = null) => {
  let current = displayObject?.parent ?? null;

  while (current && current !== stopAt) {
    if (isLocked(current)) {
      return true;
    }
    current = current.parent ?? null;
  }

  return false;
};

export const isInteractionLocked = (displayObject, stopAt = null) =>
  isLocked(displayObject) || hasLockedAncestor(displayObject, stopAt);

export const collectCandidates = (parent, filterFn = () => true) => {
  const candidates = [];
  const stack = [...parent.children];

  while (stack.length > 0) {
    const child = stack.pop();

    if (filterFn(child)) {
      candidates.push(child);
    }

    if (child.children?.length) {
      // A loop is safer than spread syntax for large arrays to avoid stack overflow.
      for (let i = child.children.length - 1; i >= 0; i--) {
        stack.push(child.children[i]);
      }
    }
  }

  return candidates;
};
