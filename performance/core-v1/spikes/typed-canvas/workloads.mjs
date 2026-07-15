const COLORS = [0x3976d2, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0xe76f51, 0x7857d9, 0x4d908e, 0xf94144];

export function generatedEntities(count) {
  const columns = Math.ceil(Math.sqrt(count * 1.8));
  const entities = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    entities[index] = {
      id: `entity-${index}`,
      x: 8 + column * 22,
      y: 8 + row * 18,
      width: 18,
      height: 6 + ((index * 13) % 10),
      color: COLORS[index & 7],
      flags: 1,
    };
  }
  return entities;
}

export function productionEntities(records) {
  const entities = new Array(records.length);
  const columns = 30;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const explicitX = record?.attrs?.x;
    const explicitY = record?.attrs?.y;
    const size = record?.item?.size ?? record?.size;
    const width = Number.isFinite(size?.width) ? Math.max(2, Math.min(80, size.width)) : (record?.type === 'relations' ? 8 : 20);
    const height = Number.isFinite(size?.height) ? Math.max(2, Math.min(80, size.height)) : (record?.type === 'relations' ? 8 : 14);
    entities[index] = {
      id: String(record?.id ?? `production-${index}`),
      x: Number.isFinite(explicitX) ? 360 + explicitX * 0.45 : 8 + (index % columns) * 22,
      y: Number.isFinite(explicitY) ? 180 + explicitY * 0.45 : 300 + Math.floor(index / columns) * 18,
      width,
      height,
      color: COLORS[(record?.type === 'grid' ? 1 : record?.type === 'item' ? 3 : 0)],
      flags: record?.show === false ? 0 : 1,
    };
  }
  return entities;
}

export function updateColumns(entities, sample) {
  const count = Math.max(1, Math.ceil(entities.length * 0.25));
  const ids = new Array(count);
  const height = new Float32Array(count);
  const x = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const slot = (index * 17 + sample * 7) % entities.length;
    ids[index] = entities[slot].id;
    height[index] = 5 + ((slot * 11 + sample * 3) % 24);
    x[index] = entities[slot].x + ((sample + index) % 3) - 1;
  }
  return { ids, height, x };
}
