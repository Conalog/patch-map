import { Color, type ColorSource } from 'pixi.js';

import { isPlainRecord } from '../shared/plain-record';
import { PatchMapDatasetError } from './dataset';

export type PatchMapCanonicalRgba = `#${string}`;
export type PatchMapNormalizedRgba = readonly [number, number, number, number];
export type PatchMapByteRgba = readonly [number, number, number, number];
export type PatchMapColorTheme = Readonly<Record<string, unknown>>;
export type PatchMapNormalizedColorTheme = Readonly<
  Record<string, PatchMapCanonicalRgba>
>;

export const PATCH_MAP_DEFAULT_COLOR_THEME: PatchMapNormalizedColorTheme = Object.freeze({
  white: '#ffffffff',
  black: '#1a1a1aff',
  transparent: '#00000000',
  'primary.default': '#0c73bfff',
  'primary.dark': '#083967ff',
  'primary.accent': '#ef4444ff',
  'gray.light': '#9eb3c3ff',
  'gray.default': '#d9d9d9ff',
  'gray.dark': '#71717aff',
});

export type PatchMapResolvedColor =
  | Readonly<{
      source: 'direct';
      rgba: PatchMapCanonicalRgba;
      normalizedRgba: PatchMapNormalizedRgba;
      byteRgba: PatchMapByteRgba;
    }>
  | Readonly<{
      source: 'theme';
      themePath: string;
      rgba: PatchMapCanonicalRgba;
      normalizedRgba: PatchMapNormalizedRgba;
      byteRgba: PatchMapByteRgba;
    }>;

interface PatchMapColorChannels {
  readonly rgba: PatchMapCanonicalRgba;
  readonly normalizedRgba: PatchMapNormalizedRgba;
  readonly byteRgba: PatchMapByteRgba;
}

const RGB_FIELDS = new Set(['r', 'g', 'b', 'a']);
const HSL_FIELDS = new Set(['h', 's', 'l', 'a']);
const HSV_FIELDS = new Set(['h', 's', 'v', 'a']);
const CANONICAL_RGBA = /^#[0-9a-f]{8}$/u;

/** A closed-code, path-aware failure from the semantic color boundary. */
export class PatchMapColorResolutionError extends PatchMapDatasetError {
  public readonly inputPath: string;

  public constructor(inputPath: string, detail: string) {
    super('INVALID_VALUE', inputPath, detail);
    this.name = 'PatchMapColorResolutionError';
    this.inputPath = inputPath;
  }
}

/**
 * Instance-owned theme and PixiJS Color conversion boundary.
 *
 * Theme replacements are validated into a new map before publication. The
 * resolver never retains caller-owned arrays, typed arrays, color objects, or
 * PixiJS's mutable `Color.shared` singleton.
 */
export class PatchMapColorResolver {
  #themeEntries: ReadonlyMap<string, PatchMapColorChannels> = new Map();
  #themeKeys: readonly string[] = Object.freeze([]);
  #themeRevision = 0;

  public constructor(theme: PatchMapColorTheme = Object.freeze({})) {
    this.setTheme(theme);
  }

  public get themeRevision(): number {
    return this.#themeRevision;
  }

  public get themeKeys(): readonly string[] {
    return this.#themeKeys;
  }

  /** Atomically replace this resolver's detached, validated theme. */
  public setTheme(theme: PatchMapColorTheme, inputPath = '$.theme'): number {
    const nextEntries = buildThemeEntries(theme, inputPath);
    const nextKeys = Object.freeze([...nextEntries.keys()].sort());

    this.#themeEntries = nextEntries;
    this.#themeKeys = nextKeys;
    this.#themeRevision += 1;

    return this.#themeRevision;
  }

  /** Resolve one direct PixiJS color input or an exact active-theme key. */
  public resolve(value: unknown, inputPath: string): PatchMapResolvedColor {
    if (typeof inputPath !== 'string' || inputPath.length === 0) {
      throw new PatchMapColorResolutionError('$', 'color input path must be a nonempty string');
    }

    if (typeof value === 'string' && this.#themeEntries.has(value)) {
      const channels = this.#themeEntries.get(value);
      if (!channels) {
        throw new PatchMapColorResolutionError(inputPath, `theme color ${value} is unavailable`);
      }
      return resolvedColor(channels, 'theme', value);
    }

    return resolvedColor(resolveDirectChannels(value, inputPath), 'direct');
  }
}

export function createPatchMapColorResolver(
  theme: PatchMapColorTheme = Object.freeze({}),
): PatchMapColorResolver {
  return new PatchMapColorResolver(theme);
}

/** Validate, detach, flatten, and canonicalize one public instance theme. */
export function normalizePatchMapColorTheme(
  theme: PatchMapColorTheme,
  inputPath = '$.theme',
): PatchMapNormalizedColorTheme {
  const entries = buildThemeEntries(theme, inputPath);
  return Object.freeze(Object.fromEntries(
    [...entries].map(([key, channels]) => [key, channels.rgba]),
  ));
}

function buildThemeEntries(
  theme: PatchMapColorTheme,
  inputPath: string,
): ReadonlyMap<string, PatchMapColorChannels> {
  if (!isPlainRecord(theme)) {
    throw new PatchMapColorResolutionError(inputPath, 'color theme must be a plain object');
  }

  const entries = new Map<string, PatchMapColorChannels>();
  collectThemeEntries(theme, '', inputPath, entries);
  return entries;
}

function collectThemeEntries(
  record: Readonly<Record<string, unknown>>,
  prefix: string,
  inputPath: string,
  entries: Map<string, PatchMapColorChannels>,
): void {
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    const themeKey = prefix.length === 0 ? key : `${prefix}.${key}`;
    const valuePath = appendObjectPath(inputPath, key);

    if (isThemeBranch(value)) {
      collectThemeEntries(value, themeKey, valuePath, entries);
      continue;
    }

    if (entries.has(themeKey)) {
      throw new PatchMapColorResolutionError(valuePath, `duplicate theme color path ${themeKey}`);
    }
    entries.set(themeKey, resolveDirectChannels(value, valuePath));
  }
}

function resolveDirectChannels(value: unknown, inputPath: string): PatchMapColorChannels {
  const detached = validateAndDetachColorSource(value, inputPath);

  let color: Color;
  try {
    color = new Color(detached);
  } catch {
    throw new PatchMapColorResolutionError(
      inputPath,
      'color input is neither a resolvable theme path nor a supported PixiJS color',
    );
  }

  const normalized = color.toArray();
  const byteRgb = color.toUint8RgbArray();
  if (normalized.length !== 4 || byteRgb.length !== 3) {
    throw new PatchMapColorResolutionError(inputPath, 'PixiJS color conversion was not canonical RGBA');
  }
  const normalizedChannels = [normalized[0], normalized[1], normalized[2], normalized[3]];
  for (const [index, channel] of normalizedChannels.entries()) {
    assertFiniteRange(channel, inputPath, `normalized RGBA channel ${index}`, 0, 1);
  }
  const [red, green, blue, alpha] = normalizedChannels as [number, number, number, number];

  const byteRgba = Object.freeze([
    byteRgb[0],
    byteRgb[1],
    byteRgb[2],
    Math.round(alpha * 255),
  ] as PatchMapByteRgba);
  const rgba = `#${byteRgba
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`.toLowerCase();
  if (!CANONICAL_RGBA.test(rgba)) {
    throw new PatchMapColorResolutionError(inputPath, 'PixiJS color conversion was not canonical RGBA');
  }
  const normalizedRgba = Object.freeze([
    red,
    green,
    blue,
    alpha,
  ] as PatchMapNormalizedRgba);

  return Object.freeze({
    rgba: rgba as PatchMapCanonicalRgba,
    normalizedRgba,
    byteRgba,
  });
}

function validateAndDetachColorSource(value: unknown, inputPath: string): ColorSource {
  if (value instanceof Color) return new Color(value);

  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      throw new PatchMapColorResolutionError(inputPath, 'color string must not be empty');
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 0xffffff) {
      throw new PatchMapColorResolutionError(inputPath, 'numeric color must be a finite 24-bit integer');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return validateArrayChannels(value, inputPath, 0, 1) as ColorSource;
  }

  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) {
    validateArrayChannels(value, inputPath, 0, 255);
    return value instanceof Uint8ClampedArray
      ? new Uint8ClampedArray(value)
      : new Uint8Array(value);
  }

  if (value instanceof Float32Array) {
    validateArrayChannels(value, inputPath, 0, 1);
    return new Float32Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    throw new PatchMapColorResolutionError(
      inputPath,
      'typed color arrays must be Float32Array, Uint8Array, or Uint8ClampedArray',
    );
  }

  if (!isPlainRecord(value)) {
    throw new PatchMapColorResolutionError(inputPath, 'color input uses an unsupported value type');
  }

  return validateAndDetachColorObject(value, inputPath);
}

function validateAndDetachColorObject(
  value: Readonly<Record<string, unknown>>,
  inputPath: string,
): ColorSource {
  const keys = Object.keys(value);
  if (Object.hasOwn(value, 'r') || Object.hasOwn(value, 'g') || Object.hasOwn(value, 'b')) {
    assertExactFields(keys, RGB_FIELDS, inputPath, ['r', 'g', 'b']);
    const result = {
      r: colorNumber(value.r, inputPath, 'RGB channel r', 0, 255),
      g: colorNumber(value.g, inputPath, 'RGB channel g', 0, 255),
      b: colorNumber(value.b, inputPath, 'RGB channel b', 0, 255),
      ...(Object.hasOwn(value, 'a')
        ? { a: colorNumber(value.a, inputPath, 'alpha channel', 0, 1) }
        : {}),
    };
    return result;
  }

  if (Object.hasOwn(value, 'l')) {
    assertExactFields(keys, HSL_FIELDS, inputPath, ['h', 's', 'l']);
    const result = {
      h: colorNumber(value.h, inputPath, 'HSL channel h', 0, 360),
      s: colorNumber(value.s, inputPath, 'HSL channel s', 0, 100),
      l: colorNumber(value.l, inputPath, 'HSL channel l', 0, 100),
      ...(Object.hasOwn(value, 'a')
        ? { a: colorNumber(value.a, inputPath, 'alpha channel', 0, 1) }
        : {}),
    };
    return result;
  }

  if (Object.hasOwn(value, 'v')) {
    assertExactFields(keys, HSV_FIELDS, inputPath, ['h', 's', 'v']);
    const result = {
      h: colorNumber(value.h, inputPath, 'HSV channel h', 0, 360),
      s: colorNumber(value.s, inputPath, 'HSV channel s', 0, 100),
      v: colorNumber(value.v, inputPath, 'HSV channel v', 0, 100),
      ...(Object.hasOwn(value, 'a')
        ? { a: colorNumber(value.a, inputPath, 'alpha channel', 0, 1) }
        : {}),
    };
    return result;
  }

  throw new PatchMapColorResolutionError(
    inputPath,
    'color object must use RGB(A), HSL(A), or HSV(A) fields',
  );
}

function validateArrayChannels(
  value: ArrayLike<unknown>,
  inputPath: string,
  min: number,
  max: number,
): number[] {
  if (value.length !== 3 && value.length !== 4) {
    throw new PatchMapColorResolutionError(inputPath, 'color arrays must contain three or four channels');
  }
  const channels: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const channel = value[index];
    assertFiniteRange(channel, inputPath, `color channel ${index}`, min, max);
    channels.push(channel);
  }
  return channels;
}

function colorNumber(
  value: unknown,
  inputPath: string,
  label: string,
  min: number,
  max: number,
): number {
  assertFiniteRange(value, inputPath, label, min, max);
  return value;
}

function assertFiniteRange(
  value: unknown,
  inputPath: string,
  label: string,
  min: number,
  max: number,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new PatchMapColorResolutionError(
      inputPath,
      `${label} must be a finite number from ${min} through ${max}`,
    );
  }
}

function assertExactFields(
  keys: readonly string[],
  allowed: ReadonlySet<string>,
  inputPath: string,
  required: readonly string[],
): void {
  for (const field of required) {
    if (!keys.includes(field)) {
      throw new PatchMapColorResolutionError(inputPath, `color object is missing ${field}`);
    }
  }
  for (const field of keys) {
    if (!allowed.has(field)) {
      throw new PatchMapColorResolutionError(
        inputPath,
        `unsupported color object field ${field}`,
      );
    }
  }
}

function resolvedColor(
  channels: PatchMapColorChannels,
  source: 'direct',
): PatchMapResolvedColor;
function resolvedColor(
  channels: PatchMapColorChannels,
  source: 'theme',
  themePath: string,
): PatchMapResolvedColor;
function resolvedColor(
  channels: PatchMapColorChannels,
  source: 'direct' | 'theme',
  themePath?: string,
): PatchMapResolvedColor {
  if (source === 'theme') {
    if (themePath === undefined) {
      throw new Error('theme resolution requires a theme path');
    }
    return Object.freeze({ source, themePath, ...channels });
  }
  return Object.freeze({ source, ...channels });
}

function isThemeBranch(value: unknown): value is Readonly<Record<string, unknown>> {
  return isPlainRecord(value) && !isColorObjectShape(value);
}

function isColorObjectShape(value: Readonly<Record<string, unknown>>): boolean {
  return (
    Object.hasOwn(value, 'r') ||
    Object.hasOwn(value, 'g') ||
    Object.hasOwn(value, 'b') ||
    Object.hasOwn(value, 'l') ||
    Object.hasOwn(value, 'v')
  );
}

function appendObjectPath(base: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}
