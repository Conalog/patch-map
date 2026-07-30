export const PATCH_MAP_RENDER_TEXT_SPECIMEN_IDS = Object.freeze([
  'placed',
  'auto',
  'wrap',
  'overflow-visible',
  'overflow-hidden',
  'overflow-ellipsis',
  'upright',
] as const);

export type PatchMapRenderTextSpecimenId =
  (typeof PATCH_MAP_RENDER_TEXT_SPECIMEN_IDS)[number];

export interface PatchMapRenderTextSpecimen {
  readonly id: PatchMapRenderTextSpecimenId;
  readonly datasetId: string;
  readonly target: Readonly<{
    kind: 'component';
    ownerId: string;
    id: string;
  }>;
  readonly dataset: readonly Readonly<Record<string, unknown>>[];
}

const BASE_TEXT_STYLE = Object.freeze({
  fontFamily: 'Unifont',
  fontSize: 16,
  lineHeight: 20,
  letterSpacing: 0,
});

/**
 * Build runtime-owned PATCH MAP v0.10 specimens from authored inputs only.
 * Each call returns a detached immutable graph so one execution cannot retain
 * aliases into another execution.
 */
export function createPatchMapRenderTextSpecimens(): readonly PatchMapRenderTextSpecimen[] {
  return deepFreeze([
    specimen('placed', {
      itemSize: size(240, 160),
      source: 'AB',
      placement: 'right-bottom',
      margin: 5,
      tint: '#ff0000',
    }),
    specimen('auto', {
      itemSize: size(32, 20),
      source: 'ABCD',
      style: {
        autoFont: { min: 8, max: 18 },
      },
    }),
    specimen('wrap', {
      itemSize: size(240, 160),
      source: 'ABCDEFGHIJ',
      style: {
        wordWrap: true,
        breakWords: true,
        wordWrapWidth: 32,
      },
    }),
    specimen('overflow-visible', {
      itemSize: size(32, 20),
      source: 'ABCDEFGHIJ',
      style: { overflow: 'visible' },
    }),
    specimen('overflow-hidden', {
      itemSize: size(32, 20),
      source: 'ABCDEFGHIJ',
      style: { overflow: 'hidden' },
    }),
    specimen('overflow-ellipsis', {
      itemSize: size(32, 20),
      source: 'ABCDEFGHIJ',
      style: { overflow: 'ellipsis' },
    }),
    specimen('upright', {
      itemSize: size(240, 160),
      source: 'AB',
      placement: 'center',
      itemAngle: 37,
      orientation: 'upright',
    }),
  ]);
}

interface SpecimenInput {
  readonly itemSize: Readonly<{ width: number; height: number }>;
  readonly source: string;
  readonly placement?: string;
  readonly margin?: number;
  readonly tint?: string;
  readonly style?: Readonly<Record<string, unknown>>;
  readonly itemAngle?: number;
  readonly orientation?: 'follow-item' | 'upright';
}

function specimen(
  id: PatchMapRenderTextSpecimenId,
  input: SpecimenInput,
): PatchMapRenderTextSpecimen {
  const ownerId = `core-v2-ren011-${id}`;
  const datasetId = `core-v2-ren011-specimen-${id}`;
  const component: Record<string, unknown> = {
    type: 'text',
    id,
    text: input.source,
    style: {
      ...BASE_TEXT_STYLE,
      ...input.style,
    },
  };
  if (input.placement !== undefined) component.placement = input.placement;
  if (input.margin !== undefined) component.margin = input.margin;
  if (input.tint !== undefined) component.tint = input.tint;

  const item: Record<string, unknown> = {
    type: 'item',
    id: ownerId,
    size: input.itemSize,
    components: [component],
  };
  if (input.itemAngle !== undefined) item.attrs = { angle: input.itemAngle };
  if (input.orientation !== undefined) item.contentOrientation = input.orientation;

  return {
    id,
    datasetId,
    target: { kind: 'component', ownerId, id },
    dataset: [item],
  };
}

function size(width: number, height: number): Readonly<{ width: number; height: number }> {
  return { width, height };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
