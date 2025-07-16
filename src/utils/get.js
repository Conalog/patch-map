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
  let candidates = [];
  for (const child of parent.children) {
    if (filterFn(child)) {
      candidates.push(child);
    }
    candidates = candidates.concat(collectCandidates(child, filterFn));
  }
  return candidates;
};
