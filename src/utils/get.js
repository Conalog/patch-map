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
  return displayObject?.context?.viewport ?? getViewport(displayObject.parent);
};

export const collectCandidates = (parent, filterFn = () => true) => {
  const candidates = [];
  const stack = [...parent.children];

  while (stack.length > 0) {
    const child = stack.pop();

    if (filterFn(child)) {
      candidates.push(child);
    }

    if (child.children && child.children.length > 0) {
      stack.push(...child.children);
    }
  }

  return candidates;
};
