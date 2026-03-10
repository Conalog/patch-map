export const collectNodesWithinWorld = (displayObject, options = {}) => {
  const world = displayObject?.store?.world;
  let current =
    options.includeSelf === true
      ? displayObject
      : (displayObject?.parent ?? null);
  const nodes = [];

  while (current && current !== world) {
    nodes.push(current);
    current = current.parent ?? null;
  }

  return nodes;
};

export const getAngleWithinWorld = (displayObject, options = {}) => {
  return collectNodesWithinWorld(displayObject, options).reduce(
    (angle, current) => angle + Number(current.angle ?? 0),
    0,
  );
};
