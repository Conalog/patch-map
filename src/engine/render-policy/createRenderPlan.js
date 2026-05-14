export const createRenderPlan = (_model, renderIR) => {
  const visibleByOwner = groupVisibleNodesByOwner(renderIR.nodes);
  const aggregateBars = [];
  const aggregateBackgrounds = [];
  const pixiNodes = [];
  const relations = [];

  for (const node of renderIR.nodes) {
    if (node.feature === 'relations') {
      relations.push(node);
      continue;
    }

    if (node.feature === 'bar' && canUseAggregateBar(node, visibleByOwner)) {
      aggregateBars.push(node);
      continue;
    }

    if (node.feature === 'background' && canUseAggregateBackground(node)) {
      aggregateBackgrounds.push(node);
      continue;
    }

    pixiNodes.push(node);
  }

  return {
    aggregateBars,
    aggregateBackgrounds,
    pixiNodes,
    relations,
    stats: {
      nodes: renderIR.nodes.length,
      aggregateBars: aggregateBars.length,
      aggregateBackgrounds: aggregateBackgrounds.length,
      pixiNodes: pixiNodes.length,
      relations: relations.length,
      estimatedDisplayObjects:
        pixiNodes.length +
        relations.length +
        countAggregateLayers({
          aggregateBars,
          aggregateBackgrounds,
        }),
    },
  };
};

const canUseAggregateBar = (node, visibleByOwner) => {
  if (!isAggregateRectSource(node.material?.source)) return false;

  const visible = visibleByOwner.get(node.ownerId) ?? [];
  return !visible.some(
    (ownerNode) =>
      ownerNode.id !== node.id &&
      (ownerNode.feature === 'icon' || ownerNode.feature === 'label'),
  );
};

const canUseAggregateBackground = (node) =>
  isAggregateRectSource(node.material?.source);

const groupVisibleNodesByOwner = (nodes) => {
  const byOwner = new Map();
  for (const node of nodes) {
    let group = byOwner.get(node.ownerId);
    if (!group) {
      group = [];
      byOwner.set(node.ownerId, group);
    }
    group.push(node);
  }
  return byOwner;
};

const isAggregateRectSource = (source) => source?.type === 'rect';

const countAggregateLayers = ({ aggregateBars, aggregateBackgrounds }) => {
  let count = 0;
  if (aggregateBars.length > 0) count += 1;
  if (aggregateBackgrounds.length > 0) count += 1;
  return count;
};
