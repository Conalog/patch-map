import type {
  BarEntityInput,
  EntityInput,
  ImageEntityInput,
  RectEntityInput,
  RelationEntityInput,
  Rgba,
  SceneDocument,
  TextEntityInput,
} from '../../../src/core-v1/contracts';

export const PRODUCTION_FIXTURE_IDENTITY = Object.freeze({
  bytes: 1_317_998,
  sha256: '9afd9e179c613b3833acd99cbe0a747fe2068475dc14ab9dada5d512fdbd1a86',
  topLevelElements: 458,
});

export interface ProductionConversionStats {
  readonly source: {
    readonly topLevelElements: number;
    readonly grids: number;
    readonly items: number;
    readonly relationGroups: number;
  };
  readonly expanded: {
    readonly gridCells: number;
    readonly directItems: number;
    readonly components: number;
    readonly relationLinks: number;
  };
  readonly output: {
    readonly entities: number;
    readonly rects: number;
    readonly bars: number;
    readonly images: number;
    readonly texts: number;
    readonly relations: number;
  };
}

export interface ProductionWorkload {
  readonly document: SceneDocument;
  readonly stats: ProductionConversionStats;
}

export interface FixtureByteIdentity {
  readonly bytes: number;
  readonly sha256: string;
}

type JsonRecord = Record<string, unknown>;

interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const TRANSPARENT = 0x00000000;
const WHITE = 0xffffffff;
const NEUTRAL_SURFACE = 0xe8edf2ff;
const NEUTRAL_STROKE = 0x718096ff;
const PRIMARY = 0x2563ebff;
const PRIMARY_DARK = 0x1e3a8aff;

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path}: expected an object`);
  }
  return value as JsonRecord;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path}: expected an array`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${path}: expected a non-empty string`);
  }
  return value;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: unknown, fallback = 0): number {
  return Math.max(0, finite(value, fallback));
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function optionalRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function componentSize(value: unknown, available: number): number {
  const dimension = optionalRecord(value);
  const raw = nonNegative(dimension.value, available);
  return dimension.unit === '%' ? (available * raw) / 100 : raw;
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgba(red: number, green: number, blue: number, alpha = 255): Rgba {
  return (
    ((byte(red) << 24) | (byte(green) << 16) | (byte(blue) << 8) | byte(alpha)) >>>
    0
  );
}

function hueChannel(p: number, q: number, hue: number): number {
  let wrapped = hue;
  if (wrapped < 0) wrapped += 1;
  if (wrapped > 1) wrapped -= 1;
  if (wrapped < 1 / 6) return p + (q - p) * 6 * wrapped;
  if (wrapped < 1 / 2) return q;
  if (wrapped < 2 / 3) return p + (q - p) * (2 / 3 - wrapped) * 6;
  return p;
}

function hslToRgba(hue: number, saturation: number, lightness: number): Rgba {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  if (s === 0) return rgba(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgba(
    hueChannel(p, q, h + 1 / 3) * 255,
    hueChannel(p, q, h) * 255,
    hueChannel(p, q, h - 1 / 3) * 255,
  );
}

function hashColorToken(value: string): Rgba {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return rgba((hash >>> 16) & 0xff, (hash >>> 8) & 0xff, hash & 0xff);
}

export function productionColor(value: unknown, fallback: Rgba): Rgba {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    if (value <= 0xffffff) return ((value << 8) | 0xff) >>> 0;
    if (value <= 0xffffffff) return value >>> 0;
  }
  if (typeof value !== 'string') return fallback;

  const token = value.trim().toLowerCase();
  if (token === 'white') return WHITE;
  if (token === 'black') return 0x000000ff;
  if (token === 'primary.default') return PRIMARY;
  if (token === 'primary.dark') return PRIMARY_DARK;

  const hex = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(token)?.[1];
  if (hex !== undefined) {
    const expanded = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex;
    const parsed = Number.parseInt(expanded, 16);
    return expanded.length === 6 ? ((parsed << 8) | 0xff) >>> 0 : parsed >>> 0;
  }

  const hsl = /^hsl\(\s*(-?[\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(
    token,
  );
  if (hsl !== null) {
    return hslToRgba(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  }

  return hashColorToken(token);
}

function itemBounds(
  parent: Bounds,
  component: JsonRecord,
  padding: JsonRecord,
): Bounds {
  const margin = optionalRecord(component.margin);
  const left = nonNegative(padding.left) + nonNegative(margin.left);
  const right = nonNegative(padding.right) + nonNegative(margin.right);
  const top = nonNegative(padding.top) + nonNegative(margin.top);
  const bottom = nonNegative(padding.bottom) + nonNegative(margin.bottom);
  const availableWidth = Math.max(0, parent.width - left - right);
  const availableHeight = Math.max(0, parent.height - top - bottom);
  const size = optionalRecord(component.size);
  const width = componentSize(size.width, availableWidth);
  const height = componentSize(size.height, availableHeight);
  const placement = component.placement;

  let x = parent.x + left;
  let y = parent.y + top;
  if (placement === 'center') {
    x = parent.x + (parent.width - width) / 2;
    y = parent.y + (parent.height - height) / 2;
  } else if (placement === 'bottom') {
    x = parent.x + left;
    y = parent.y + parent.height - bottom - height;
  }

  return { x, y, width, height };
}

function componentEntity(
  parentId: string,
  parent: Bounds,
  parentVisible: boolean,
  padding: JsonRecord,
  raw: unknown,
  componentIndex: number,
): EntityInput {
  const component = record(raw, `${parentId}.components[${componentIndex}]`);
  const type = string(component.type, `${parentId}.components[${componentIndex}].type`);
  const source = optionalRecord(component.source);
  const bounds = itemBounds(parent, component, padding);
  const visible = parentVisible && boolean(component.show, true);
  const sourceId =
    typeof component.id === 'string' && component.id.length > 0
      ? component.id
      : String(componentIndex).padStart(2, '0');
  const id = `${parentId}::${type}:${sourceId}`;
  const common = {
    id,
    ...bounds,
    visible,
    interactive: false,
    zIndex: componentIndex + 1,
    tags: ['production', 'component', `component:${type}`, `parent:${parentId}`],
  } as const;

  switch (type) {
    case 'background': {
      const entity: RectEntityInput = {
        kind: 'rect',
        ...common,
        fill: productionColor(source.fill, NEUTRAL_SURFACE),
        stroke: productionColor(source.borderColor, TRANSPARENT),
        strokeWidth: nonNegative(source.borderWidth),
        radius: nonNegative(source.radius),
      };
      return entity;
    }
    case 'bar': {
      const entity: BarEntityInput = {
        kind: 'bar',
        ...common,
        value: visible ? 1 : 0,
        min: 0,
        max: 1,
        fill: productionColor(component.tint, PRIMARY),
        trackFill: productionColor(source.fill, NEUTRAL_SURFACE),
        radius: nonNegative(source.radius),
      };
      return entity;
    }
    case 'icon': {
      const iconSource =
        typeof component.source === 'string' && component.source.length > 0
          ? component.source
          : 'unknown';
      const entity: ImageEntityInput = {
        kind: 'image',
        ...common,
        source: `fixture:${iconSource}`,
        tint: productionColor(component.tint, WHITE),
        fit: 'contain',
      };
      return entity;
    }
    case 'text': {
      const text = typeof component.source === 'string' ? component.source : '';
      const entity: TextEntityInput = {
        kind: 'text',
        ...common,
        text,
        color: productionColor(component.tint, 0x111827ff),
        fontSize: Math.max(1, nonNegative(component.fontSize, 12)),
        align: 'center',
      };
      return entity;
    }
    default: {
      const entity: RectEntityInput = {
        kind: 'rect',
        ...common,
        fill: productionColor(component.tint, NEUTRAL_SURFACE),
        stroke: NEUTRAL_STROKE,
        strokeWidth: 1,
      };
      return entity;
    }
  }
}

function appendItem(
  entities: EntityInput[],
  nodeIds: Set<string>,
  id: string,
  bounds: Bounds,
  rotation: number,
  visible: boolean,
  locked: boolean,
  display: string,
  label: string,
  components: readonly unknown[],
  padding: JsonRecord,
  originTag: string,
): number {
  if (nodeIds.has(id)) throw new TypeError(`duplicate production entity ID ${id}`);
  nodeIds.add(id);
  entities.push({
    kind: 'rect',
    id,
    ...bounds,
    rotation,
    visible,
    interactive: !locked,
    fill: TRANSPARENT,
    stroke: TRANSPARENT,
    strokeWidth: 0,
    zIndex: 0,
    tags: ['production', originTag, `display:${display}`, `label:${label}`],
  });
  for (let index = 0; index < components.length; index += 1) {
    entities.push(componentEntity(id, bounds, visible, padding, components[index], index));
  }
  return components.length;
}

function sourceSummary(stats: {
  grids: number;
  items: number;
  relationGroups: number;
  gridCells: number;
  components: number;
  relationLinks: number;
  kinds: Record<'rect' | 'bar' | 'image' | 'text' | 'relation', number>;
}): ProductionConversionStats {
  const entities =
    stats.kinds.rect +
    stats.kinds.bar +
    stats.kinds.image +
    stats.kinds.text +
    stats.kinds.relation;
  return {
    source: {
      topLevelElements: stats.grids + stats.items + stats.relationGroups,
      grids: stats.grids,
      items: stats.items,
      relationGroups: stats.relationGroups,
    },
    expanded: {
      gridCells: stats.gridCells,
      directItems: stats.items,
      components: stats.components,
      relationLinks: stats.relationLinks,
    },
    output: {
      entities,
      rects: stats.kinds.rect,
      bars: stats.kinds.bar,
      images: stats.kinds.image,
      texts: stats.kinds.text,
      relations: stats.kinds.relation,
    },
  };
}

export function convertProductionFixture(input: unknown): ProductionWorkload {
  const source = array(input, '$');
  const entities: EntityInput[] = [];
  const nodeIds = new Set<string>();
  const relationGroups: JsonRecord[] = [];
  const stats = {
    grids: 0,
    items: 0,
    relationGroups: 0,
    gridCells: 0,
    components: 0,
    relationLinks: 0,
    kinds: { rect: 0, bar: 0, image: 0, text: 0, relation: 0 },
  };

  for (let index = 0; index < source.length; index += 1) {
    const element = record(source[index], `$[${index}]`);
    const type = string(element.type, `$[${index}].type`);
    if (type === 'relations') {
      relationGroups.push(element);
      stats.relationGroups += 1;
      continue;
    }

    const id = string(element.id, `$[${index}].id`);
    const attrs = optionalRecord(element.attrs);
    const display = typeof attrs.display === 'string' ? attrs.display : type;
    const label = typeof element.label === 'string' ? element.label : id;
    const visible = boolean(element.show, true);
    const locked = boolean(element.locked, false);
    const rotation = finite(attrs.angle);

    if (type === 'item') {
      stats.items += 1;
      const size = optionalRecord(element.size);
      const components = array(element.components ?? [], `$[${index}].components`);
      const before = entities.length;
      stats.components += appendItem(
        entities,
        nodeIds,
        id,
        {
          x: finite(attrs.x),
          y: finite(attrs.y),
          width: nonNegative(size.width, 1),
          height: nonNegative(size.height, 1),
        },
        rotation,
        visible,
        locked,
        display,
        label,
        components,
        optionalRecord(element.padding),
        'direct-item',
      );
      for (let output = before; output < entities.length; output += 1) {
        const kind = entities[output]?.kind;
        if (kind !== undefined) stats.kinds[kind] += 1;
      }
      continue;
    }

    if (type === 'grid') {
      stats.grids += 1;
      const rows = array(element.cells, `$[${index}].cells`);
      const gap = optionalRecord(element.gap);
      const template = record(element.item, `$[${index}].item`);
      const size = optionalRecord(template.size);
      const width = nonNegative(size.width, 1);
      const height = nonNegative(size.height, 1);
      const components = array(template.components ?? [], `$[${index}].item.components`);
      const padding = optionalRecord(template.padding);
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = array(rows[rowIndex], `$[${index}].cells[${rowIndex}]`);
        for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
          if (!row[columnIndex]) continue;
          const cellId = `${id}.${rowIndex}.${columnIndex}`;
          const before = entities.length;
          stats.gridCells += 1;
          stats.components += appendItem(
            entities,
            nodeIds,
            cellId,
            {
              x: finite(attrs.x) + columnIndex * (width + nonNegative(gap.x)),
              y: finite(attrs.y) + rowIndex * (height + nonNegative(gap.y)),
              width,
              height,
            },
            rotation,
            visible,
            locked,
            display,
            label,
            components,
            padding,
            'grid-cell',
          );
          for (let output = before; output < entities.length; output += 1) {
            const kind = entities[output]?.kind;
            if (kind !== undefined) stats.kinds[kind] += 1;
          }
        }
      }
      continue;
    }

    throw new TypeError(`$[${index}].type: unsupported production element ${type}`);
  }

  for (let groupIndex = 0; groupIndex < relationGroups.length; groupIndex += 1) {
    const group = relationGroups[groupIndex] as JsonRecord;
    const groupId = string(group.id, `relationGroups[${groupIndex}].id`);
    const links = array(group.links ?? [], `relationGroups[${groupIndex}].links`);
    const style = optionalRecord(group.style);
    const visible = boolean(group.show, true);
    const locked = boolean(group.locked, false);
    const color = productionColor(style.color, NEUTRAL_STROKE);
    const lineWidth = nonNegative(style.width, 1);
    for (let linkIndex = 0; linkIndex < links.length; linkIndex += 1) {
      const link = record(links[linkIndex], `relationGroups[${groupIndex}].links[${linkIndex}]`);
      const from = string(link.source, `relationGroups[${groupIndex}].links[${linkIndex}].source`);
      const to = string(link.target, `relationGroups[${groupIndex}].links[${linkIndex}].target`);
      if (!nodeIds.has(from)) throw new TypeError(`relation ${groupId} has unknown source ${from}`);
      if (!nodeIds.has(to)) throw new TypeError(`relation ${groupId} has unknown target ${to}`);
      const entity: RelationEntityInput = {
        kind: 'relation',
        id: `${groupId}::link:${String(linkIndex).padStart(5, '0')}`,
        from,
        to,
        color,
        lineWidth,
        visible,
        interactive: !locked,
        zIndex: -1,
        tags: ['production', 'relation', `group:${groupId}`],
      };
      entities.push(entity);
      stats.kinds.relation += 1;
      stats.relationLinks += 1;
    }
  }

  return {
    document: {
      version: 1,
      background: 0xf8fafcff,
      view: { x: 0, y: 0, scale: 1 },
      entities,
    },
    stats: sourceSummary(stats),
  };
}

export function formatProductionConversionStats(stats: ProductionConversionStats): string {
  return [
    `${stats.source.topLevelElements} source records`,
    `${stats.expanded.gridCells} cells`,
    `${stats.expanded.components} components`,
    `${stats.expanded.relationLinks} links`,
    `${stats.output.entities} Core v1 entities`,
  ].join(' · ');
}

export async function fixtureByteIdentity(bytes: Uint8Array): Promise<FixtureByteIdentity> {
  const copy = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
  const sha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return { bytes: bytes.byteLength, sha256 };
}

export async function assertProductionFixtureBytes(
  bytes: Uint8Array,
): Promise<FixtureByteIdentity> {
  const actual = await fixtureByteIdentity(bytes);
  if (
    actual.bytes !== PRODUCTION_FIXTURE_IDENTITY.bytes ||
    actual.sha256 !== PRODUCTION_FIXTURE_IDENTITY.sha256
  ) {
    throw new Error(
      `production fixture identity mismatch: expected ${PRODUCTION_FIXTURE_IDENTITY.bytes} bytes/${PRODUCTION_FIXTURE_IDENTITY.sha256}, received ${actual.bytes} bytes/${actual.sha256}`,
    );
  }
  return actual;
}
