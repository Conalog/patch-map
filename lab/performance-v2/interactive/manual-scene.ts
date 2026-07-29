import { buildCoreV2SeededScenarioScene } from '../contract/seeded-scene';

export const CORE_V2_MANUAL_SCENE_REVISION = 'core-v2-manual-scene/1' as const;

export interface CoreV2ManualScene {
  readonly revision: typeof CORE_V2_MANUAL_SCENE_REVISION;
  readonly animationDurationMs: number;
  readonly dataset: readonly Readonly<Record<string, unknown>>[];
  readonly primaryIds: readonly string[];
  readonly relationIds: readonly string[];
  readonly barTargets: readonly Readonly<{
    readonly ownerId: string;
    readonly componentId: 'bar';
  }>[];
  readonly textTargets: readonly Readonly<{
    readonly ownerId: string;
    readonly componentId: 'label';
  }>[];
}

export function buildCoreV2ManualScene(
  size: string,
  seed: number,
  animationDurationMs = 200,
): CoreV2ManualScene {
  const recordCount = size === 'production'
    ? 500
    : Math.max(1, Number.parseInt(size, 10));
  if (!Number.isSafeInteger(recordCount) || recordCount < 1) {
    throw new RangeError(`Core v2 manual scene size is invalid: ${size}`);
  }
  if (
    !Number.isSafeInteger(animationDurationMs) ||
    animationDurationMs < 0 ||
    animationDurationMs > 60_000
  ) {
    throw new RangeError(
      `Core v2 manual bar animation duration is invalid: ${animationDurationMs}`,
    );
  }
  const seeded = structuredClone(
    buildCoreV2SeededScenarioScene(recordCount, seed),
  ) as Readonly<Record<string, unknown>>[];
  const shifted = seeded.map((record) => {
    const attrs = isRecord(record.attrs) ? record.attrs : {};
    const componentValues = Array.isArray(record.components)
      ? record.components as readonly unknown[]
      : undefined;
    const components = componentValues === undefined
      ? undefined
      : componentValues.map((component) =>
          isRecord(component) && component.type === 'bar'
            ? { ...component, animationDuration: animationDurationMs }
            : component);
    return {
      ...record,
      ...(components === undefined ? {} : { components }),
      attrs: {
        ...attrs,
        y: numberValue(attrs.y, 0) + 270,
      },
    };
  });
  const dataset: Readonly<Record<string, unknown>>[] = [
    {
      type: 'rect',
      id: 'manual-rect-a',
      size: { width: 130, height: 84 },
      fill: '#ff6b35',
      radius: 12,
      attrs: { x: 32, y: 48, zIndex: 4 },
    },
    {
      type: 'rect',
      id: 'manual-rect-b',
      size: { width: 110, height: 104 },
      fill: '#24a29a',
      radius: 8,
      attrs: { x: 224, y: 38, angle: -7, zIndex: 3 },
    },
    {
      type: 'text',
      id: 'manual-text',
      text: '직접 편집하세요',
      size: { width: 220, height: 46 },
      style: {
        fontFamily: 'Fira Code',
        fontSize: 19,
        fill: '#172033',
        align: 'left',
      },
      attrs: { x: 402, y: 54, zIndex: 5 },
    },
    {
      type: 'group',
      id: 'manual-group',
      attrs: { x: 680, y: 38, angle: 5, zIndex: 2 },
      children: [
        {
          type: 'rect',
          id: 'manual-group-card',
          size: { width: 156, height: 110 },
          fill: '#f4d35e',
          radius: 14,
          attrs: { x: 0, y: 0, zIndex: 0 },
        },
        {
          type: 'text',
          id: 'manual-group-label',
          text: '그룹',
          size: { width: 110, height: 28 },
          style: { fontFamily: 'Fira Code', fontSize: 18, fill: '#172033' },
          attrs: { x: 22, y: 40, zIndex: 1 },
        },
      ],
    },
    {
      type: 'relations',
      id: 'manual-relations',
      links: [
        { source: 'manual-rect-a', target: 'manual-rect-b' },
        { source: 'manual-rect-b', target: 'manual-text' },
      ],
      style: { color: '#334155', width: 3, opacity: 0.72 },
      attrs: { x: 0, y: 0, zIndex: 1 },
    },
    ...shifted,
  ];
  const barTargets = Array.from({ length: recordCount }, (_, index) => Object.freeze({
    ownerId: `node-${index}`,
    componentId: 'bar' as const,
  }));
  const textTargets = Array.from({ length: recordCount }, (_, index) => Object.freeze({
    ownerId: `node-${index}`,
    componentId: 'label' as const,
  }));
  return deepFreeze({
    revision: CORE_V2_MANUAL_SCENE_REVISION,
    animationDurationMs,
    dataset,
    primaryIds: [
      'manual-rect-a',
      'manual-rect-b',
      'manual-text',
      'manual-group',
      'node-0',
      'node-1',
    ],
    relationIds: ['manual-relations'],
    barTargets,
    textTargets,
  });
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
