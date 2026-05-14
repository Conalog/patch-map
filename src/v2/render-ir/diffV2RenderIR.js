export const diffV2RenderIR = (previousIR, nextIR) => {
  const previous = indexNodes(previousIR?.nodes ?? []);
  const next = indexNodes(nextIR?.nodes ?? []);
  const added = [];
  const updated = [];
  const removed = [];

  for (const [id, nextNode] of next) {
    const previousNode = previous.get(id);
    if (!previousNode) {
      added.push(nextNode);
      continue;
    }
    if (nodeSignature(previousNode) !== nodeSignature(nextNode)) {
      updated.push(nextNode);
    }
  }

  for (const [id, previousNode] of previous) {
    if (!next.has(id)) {
      removed.push(previousNode);
    }
  }

  return {
    added,
    updated,
    removed,
    changed: added.length + updated.length + removed.length,
  };
};

const indexNodes = (nodes) => {
  const index = new Map();
  for (const node of nodes) {
    index.set(node.id, node);
  }
  return index;
};

const nodeSignature = (node) =>
  JSON.stringify({
    feature: node.feature,
    layer: node.layer,
    ownerId: node.ownerId,
    frame: normalizeFrame(node.frame),
    material: node.material,
  });

const normalizeFrame = (frame) => ({
  x: round(frame.x),
  y: round(frame.y),
  width: round(frame.width),
  height: round(frame.height),
  rotation: round(frame.rotation),
  alpha: round(frame.alpha),
  visible: frame.visible,
});

const round = (value) =>
  typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;
