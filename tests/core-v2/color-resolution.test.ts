import { Color } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import fixtureCatalog from '../../docs/reference/core-v2-functional-contract/evidence/catalog-fixtures.v1.json';
import { createCoreV2ColorResolver } from '../../src/core-v2/semantic/color';
import type { CoreV2ColorResolutionError } from '../../src/core-v2/semantic/color';

interface Dat004Params {
  readonly themeA: Readonly<Record<string, unknown>>;
  readonly themeB: Readonly<Record<string, unknown>>;
  readonly colors: readonly unknown[];
  readonly colorInputMatrix: readonly Readonly<{
    id: string;
    construct: string;
    values?: readonly (number | string)[];
    value?: Readonly<Record<string, number | string>>;
    datasetPath?: string;
  }>[];
}

const dat004Case = fixtureCatalog.cases.find((candidate) => candidate.id === 'DAT-004');
if (!dat004Case) throw new Error('approved DAT-004 fixture is unavailable');
const approved = dat004Case.setup.params as unknown as Dat004Params;

describe('Core v2 PixiJS color resolution', () => {
  it('resolves approved direct inputs and isolates active themes by instance', () => {
    const themeA = structuredClone(approved.themeA);
    const themeB = structuredClone(approved.themeB);
    const themeABefore = JSON.stringify(themeA);
    const themeBBefore = JSON.stringify(themeB);
    const resolverA = createCoreV2ColorResolver(themeA);
    const resolverB = createCoreV2ColorResolver(themeB);

    expect(resolverA.resolve(approved.colors[0], '$[0].fill')).toMatchObject({
      source: 'theme',
      themePath: 'primary.default',
      rgba: '#0c73bfff',
    });
    expect(resolverB.resolve(approved.colors[0], '$[0].fill').rgba).toBe('#112233ff');
    expect(resolverA.resolve(approved.colors[1], '$[1].fill').rgba).toBe('#ff0000ff');
    expect(resolverA.resolve(approved.colors[2], '$[2].fill').rgba).toBe('#00ff00ff');
    expect(resolverA.resolve(approved.colors[3], '$[3].fill').rgba).toBe('#0000ff80');

    expect(resolverA.setTheme({ 'primary.default': '#445566ff' })).toBe(2);
    expect(resolverA.resolve('primary.default', '$[0].fill').rgba).toBe('#445566ff');
    expect(resolverB.resolve('primary.default', '$[0].fill').rgba).toBe('#112233ff');
    expect(resolverB.themeRevision).toBe(1);
    expect(JSON.stringify(themeA)).toBe(themeABefore);
    expect(JSON.stringify(themeB)).toBe(themeBBefore);
  });

  it('supports nested themes without retaining caller aliases', () => {
    const theme = { primary: { default: '#0c73bfff' }, accent: '#FF008080' };
    const resolver = createCoreV2ColorResolver(theme);

    theme.primary.default = '#ffffffff';
    theme.accent = '#000000ff';

    expect(resolver.themeKeys).toEqual(['accent', 'primary.default']);
    expect(Object.isFrozen(resolver.themeKeys)).toBe(true);
    expect(resolver.resolve('primary.default', '$.fill').rgba).toBe('#0c73bfff');
    expect(resolver.resolve('accent', '$.stroke.color').rgba).toBe('#ff008080');
  });

  it('normalizes string, number, normalized-array, and byte-array color sources', () => {
    const resolver = createCoreV2ColorResolver();
    const typedFixture = approved.colorInputMatrix.find((entry) => entry.id === 'typed-array');
    if (!typedFixture?.values) throw new Error('approved typed-array fixture is unavailable');
    const byteInput = new Uint8Array(typedFixture.values.map(Number));
    const byteBefore = [...byteInput];
    const floatInput = new Float32Array([0, 0.5, 1, 0.25]);
    const floatBefore = [...floatInput];

    expect(resolver.resolve('dodgerblue', '$.name').rgba).toBe('#1e90ffff');
    expect(resolver.resolve('rgba(255, 0, 0, 0.5)', '$.css').rgba).toBe('#ff000080');
    expect(resolver.resolve(0x123456, '$.number').rgba).toBe('#123456ff');
    expect(resolver.resolve([1, 0.5, 0, 0.5], '$.array').rgba).toBe('#ff800080');
    expect(resolver.resolve(byteInput, '$.bytes').rgba).toBe('#ff800080');
    expect(resolver.resolve(new Uint8ClampedArray(byteInput), '$.clamped').rgba).toBe(
      '#ff800080',
    );
    expect(resolver.resolve(floatInput, '$.float').rgba).toBe('#0080ff40');
    expect([...byteInput]).toEqual(byteBefore);
    expect([...floatInput]).toEqual(floatBefore);
  });

  it('normalizes Pixi Color and RGB, HSL, and HSV object families with alpha', () => {
    const resolver = createCoreV2ColorResolver();
    const objectFixture = approved.colorInputMatrix.find(
      (entry) => entry.id === 'pixijs-color-object',
    );
    if (!objectFixture?.value) throw new Error('approved Pixi Color fixture is unavailable');
    const pixiInput = new Color({
      r: Number(objectFixture.value.r),
      g: Number(objectFixture.value.g),
      b: Number(objectFixture.value.b),
      a: Number(objectFixture.value.a),
    });
    const pixiBefore = pixiInput.toHexa();
    const rgbInput = { r: 12, g: 34, b: 56, a: 0.25 };
    const rgbBefore = JSON.stringify(rgbInput);

    expect(resolver.resolve(pixiInput, '$.pixi').rgba).toBe('#0c223840');
    expect(resolver.resolve(rgbInput, '$.rgb').rgba).toBe('#0c223840');
    expect(resolver.resolve({ h: 0, s: 100, l: 50, a: 0.5 }, '$.hsl').rgba).toBe(
      '#ff000080',
    );
    expect(resolver.resolve({ h: 120, s: 100, v: 100, a: 0.25 }, '$.hsv').rgba).toBe(
      '#00ff0040',
    );
    expect(pixiInput.toHexa()).toBe(pixiBefore);
    expect(JSON.stringify(rgbInput)).toBe(rgbBefore);
  });

  it('returns frozen canonical, finite normalized, and byte RGBA together', () => {
    const resolver = createCoreV2ColorResolver();
    const sharedBefore = Color.shared.toHexa();
    const resolved = resolver.resolve([0.25, 0.5, 0.75, 0.125], '$.fill');

    expect(resolved.rgba).toMatch(/^#[0-9a-f]{8}$/u);
    expect(resolved.rgba).toBe('#4080bf20');
    expect(resolved.byteRgba).toEqual([64, 128, 191, 32]);
    expect(resolved.normalizedRgba.every((channel) => Number.isFinite(channel))).toBe(true);
    expect(resolved.normalizedRgba.every((channel) => channel >= 0 && channel <= 1)).toBe(true);
    expect(resolved.byteRgba.every((channel) => Number.isInteger(channel))).toBe(true);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.normalizedRgba)).toBe(true);
    expect(Object.isFrozen(resolved.byteRgba)).toBe(true);
    expect(Color.shared.toHexa()).toBe(sharedBefore);
  });

  it('rejects missing theme paths and invalid direct inputs with exact input paths', () => {
    const resolver = createCoreV2ColorResolver({ 'primary.default': '#0c73bfff' });
    const invalidTyped = approved.colorInputMatrix.find(
      (entry) => entry.id === 'non-finite-typed-array',
    );
    const invalidObject = approved.colorInputMatrix.find(
      (entry) => entry.id === 'infinite-color-object',
    );
    if (!invalidTyped?.values || !invalidTyped.datasetPath || !invalidObject?.datasetPath) {
      throw new Error('approved invalid color fixtures are unavailable');
    }
    const nonFinite = new Float32Array(
      invalidTyped.values.map((value) => (value === 'NaN' ? Number.NaN : Number(value))),
    );

    expectInvalid(() => resolver.resolve('missing.path', '$[0].fill'), '$[0].fill');
    expectInvalid(
      () => resolver.resolve(nonFinite, invalidTyped.datasetPath ?? '$'),
      invalidTyped.datasetPath,
    );
    expectInvalid(
      () => resolver.resolve({ r: 0, g: Number.POSITIVE_INFINITY, b: 1, a: 1 }, '$[1].fill'),
      invalidObject.datasetPath,
    );
    expectInvalid(() => resolver.resolve([255, 0, 0], '$.plainArray'), '$.plainArray');
    expectInvalid(() => resolver.resolve([0, Number.NaN, 1], '$.nan'), '$.nan');
    expectInvalid(() => resolver.resolve([0, 1], '$.short'), '$.short');
    expectInvalid(() => resolver.resolve({ h: 0, s: 100, l: 50, v: 100 }, '$.mixed'), '$.mixed');
    expectInvalid(() => resolver.resolve(new Int16Array([1, 2, 3]), '$.typed'), '$.typed');
    expectInvalid(() => resolver.resolve(Number.POSITIVE_INFINITY, '$.number'), '$.number');
  });

  it('publishes a theme replacement only after every new entry validates', () => {
    const resolver = createCoreV2ColorResolver({ stable: '#112233ff' });
    const revision = resolver.themeRevision;
    const keys = resolver.themeKeys;

    expectInvalid(
      () => resolver.setTheme({ stable: '#445566ff', broken: [0, Number.NaN, 1] }, '$.next'),
      '$.next.broken',
    );

    expect(resolver.themeRevision).toBe(revision);
    expect(resolver.themeKeys).toBe(keys);
    expect(resolver.resolve('stable', '$.fill').rgba).toBe('#112233ff');
  });
});

function expectInvalid(operation: () => unknown, inputPath: string): void {
  expect(operation).toThrowError(
    expect.objectContaining<Partial<CoreV2ColorResolutionError>>({
      category: 'INVALID_INPUT',
      code: 'INVALID_VALUE',
      datasetPath: inputPath,
      inputPath,
      appliedCount: 0,
    }),
  );
}
