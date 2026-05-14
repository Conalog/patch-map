export const createRenderIR = (model, layout) => {
  const nodes = [];

  for (const record of model.records.values()) {
    if (record.kind === 'root') continue;
    const frame = layout.getFrame(record.id);
    if (!frame?.visible) continue;

    const node = createRenderNode(record, frame);
    if (node) nodes.push(node);
  }

  return {
    nodes,
    byFeature: groupNodesByFeature(nodes),
  };
};

export const createRenderNode = (record, frame) => {
  if (record.kind === 'component') {
    return createComponentNode(record, frame);
  }
  return createElementNode(record, frame);
};

const createElementNode = (record, frame) => {
  if (record.type === 'rect') {
    return {
      id: record.id,
      ownerId: record.id,
      feature: 'rect',
      layer: 'shape',
      frame,
      material: {
        fill: record.props.fill,
        stroke: record.props.stroke,
        radius: record.props.radius ?? 0,
      },
    };
  }
  if (record.type === 'text') {
    return {
      id: record.id,
      ownerId: record.id,
      feature: 'text',
      layer: 'text',
      frame,
      material: {
        text: record.props.text ?? '',
        style: record.props.style,
      },
    };
  }
  if (record.type === 'image') {
    return {
      id: record.id,
      ownerId: record.id,
      feature: 'image',
      layer: 'image',
      frame,
      material: {
        source: record.props.source,
      },
    };
  }
  if (record.type === 'relations') {
    return {
      id: record.id,
      ownerId: record.id,
      feature: 'relations',
      layer: 'relations',
      frame,
      material: {
        links: record.props.links ?? [],
        style: record.props.style,
      },
    };
  }
  return null;
};

const createComponentNode = (record, frame) => {
  if (record.type === 'background') {
    return {
      id: record.id,
      ownerId: record.parentId,
      feature: 'background',
      layer: 'background',
      frame,
      material: {
        source: record.props.source,
        tint: record.props.tint,
      },
    };
  }
  if (record.type === 'bar') {
    return {
      id: record.id,
      ownerId: record.parentId,
      feature: 'bar',
      layer: 'bar',
      frame,
      material: {
        source: record.props.source,
        tint: record.props.tint,
        animation: record.props.animation !== false,
        animationDuration: record.props.animationDuration ?? 200,
      },
    };
  }
  if (record.type === 'icon') {
    return {
      id: record.id,
      ownerId: record.parentId,
      feature: 'icon',
      layer: 'icon',
      frame,
      material: {
        source: record.props.source,
        tint: record.props.tint,
      },
    };
  }
  if (record.type === 'text') {
    return {
      id: record.id,
      ownerId: record.parentId,
      feature: 'label',
      layer: 'text',
      frame,
      material: {
        text: record.props.text ?? '',
        style: record.props.style,
        tint: record.props.tint,
        split: record.props.split ?? 0,
      },
    };
  }
  return null;
};

export const groupNodesByFeature = (nodes) => {
  const groups = new Map();
  for (const node of nodes) {
    let group = groups.get(node.feature);
    if (!group) {
      group = [];
      groups.set(node.feature, group);
    }
    group.push(node);
  }
  return groups;
};
