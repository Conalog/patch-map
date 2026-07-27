export const CORE_V2_SEEDED_SCENE_REVISION =
  'core-v2-seeded-scenario-scene/1' as const;

/**
 * Deterministic Lab input generator shared by update, determinism, animation,
 * text, and performance journeys. It owns plain frozen PATCH MAP JSON only.
 */
export function buildCoreV2SeededScenarioScene(
  sizeValue: number,
  seedValue: number,
  actionIndexValue = 0,
): readonly Readonly<Record<string, unknown>>[] {
  const size = positiveSafeInteger(sizeValue, 'size');
  const seed = uint32(seedValue, 'seed');
  const actionIndex = nonNegativeSafeInteger(actionIndexValue, 'actionIndex');
  const random = createSeededRandom(
    actionIndex === 0
      ? seed
      : (seed ^ Math.imul(actionIndex, 0x9e37_79b1)) >>> 0,
  );
  const columns = Math.max(1, Math.ceil(Math.sqrt(size)));
  const dataset: Readonly<Record<string, unknown>>[] = [];
  for (let index = 0; index < size; index += 1) {
    const width = 88 + Math.floor(random() * 25);
    const height = 60 + Math.floor(random() * 21);
    const barHeight = 8 + Math.floor(random() * 25);
    const color = rgbaHex(
      Math.floor(random() * 192) + 32,
      Math.floor(random() * 192) + 32,
      Math.floor(random() * 192) + 32,
    );
    const fontSize = actionIndex === 0 ? 12 : 11 + Math.floor(random() * 4);
    const text = actionIndex === 0
      ? `${index}`
      : `${index}:${Math.floor(random() * 10_000)}`;
    dataset.push({
      type: 'item',
      id: `node-${index}`,
      label: `Node ${index}`,
      size: { width, height },
      padding: 4,
      attrs: {
        x: (index % columns) * 128,
        y: Math.floor(index / columns) * 92,
      },
      components: [
        {
          type: 'background',
          id: 'bg',
          source: { type: 'rect', fill: '#e2e8f0ff' },
        },
        {
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: color },
          size: { width: Math.max(1, width - 16), height: barHeight },
          placement: 'bottom',
          animation: true,
          animationDuration: 200,
        },
        {
          type: 'text',
          id: 'label',
          text,
          placement: 'center',
          style: {
            fontFamily: 'FiraCode',
            fontSize,
            fill: '#0f172aff',
          },
        },
      ],
    });
  }
  return deepFreeze(dataset);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function rgbaHex(red: number, green: number, blue: number): string {
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}ff`;
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > 5_000) {
    throw new RangeError(`${label} must be a positive safe integer up to 5000`);
  }
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function uint32(value: unknown, label: string): number {
  const number = nonNegativeSafeInteger(value, label);
  if (number > 0xffff_ffff) throw new RangeError(`${label} must be uint32`);
  return number;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry, seen);
  } else {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      deepFreeze(entry, seen);
    }
  }
  return Object.freeze(value);
}
