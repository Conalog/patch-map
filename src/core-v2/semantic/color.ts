import { Color, type ColorSource } from 'pixi.js';

import { CoreV2DatasetError } from './dataset';

export type CoreV2CanonicalRgba = `#${string}`;
export type CoreV2NormalizedRgba = readonly [number, number, number, number];
export type CoreV2ByteRgba = readonly [number, number, number, number];
export type CoreV2ColorTheme = Readonly<Record<string, unknown>>;

export type CoreV2ResolvedColor =
  | Readonly<{
      source: 'direct';
      rgba: CoreV2CanonicalRgba;
      normalizedRgba: CoreV2NormalizedRgba;
      byteRgba: CoreV2ByteRgba;
    }>
  | Readonly<{
      source: 'theme';
      themePath: string;
      rgba: CoreV2CanonicalRgba;
      normalizedRgba: CoreV2NormalizedRgba;
      byteRgba: CoreV2ByteRgba;
    }>;

interface CoreV2ColorChannels {
  readonly rgba: CoreV2CanonicalRgba;
  readonly normalizedRgba: CoreV2NormalizedRgba;
  readonly byteRgba: CoreV2ByteRgba;
}

const RGB_FIELDS = new Set(['r', 'g', 'b', 'a']);
const HSL_FIELDS = new Set(['h', 's', 'l', 'a']);
const HSV_FIELDS = new Set(['h', 's', 'v', 'a']);
const CANONICAL_RGBA = /^#[0-9a-f]{8}$/u;

/** A closed-code, path-aware failure from the semantic color boundary. */
export class CoreV2ColorResolutionError extends CoreV2DatasetError {
  public readonly inputPath: string;

  public constructor(inputPath: string, detail: string) {
    super('INVALID_VALUE', inputPath, detail);
    this.name = 'CoreV2ColorResolutionError';
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
export class CoreV2ColorResolver {
  #themeEntries: ReadonlyMap<string, CoreV2ColorChannels> = new Map();
  #themeKeys: readonly string[] = Object.freeze([]);
  #themeRevision = 0;

  public constructor(theme: CoreV2ColorTheme = Object.freeze({})) {
    this.setTheme(theme);
  }

  public get themeRevision(): number {
    return this.#themeRevision;
  }

  public get themeKeys(): readonly string[] {
    return this.#themeKeys;
  }

  /** Atomically replace this resolver's detached, validated theme. */
  public setTheme(theme: CoreV2ColorTheme, inputPath = '$.theme'): number {
    const nextEntries = buildThemeEntries(theme, inputPath);
    const nextKeys = Object.freeze([...nextEntries.keys()].sort());

    this.#themeEntries = nextEntries;
    this.#themeKeys = nextKeys;
    this.#themeRevision += 1;

    return this.#themeRevision;
  }

  /** Resolve one direct PixiJS color input or an exact active-theme key. */
  public resolve(value: unknown, inputPath: string): CoreV2ResolvedColor {
    if (typeof inputPath !== 'string' || inputPath.length === 0) {
      throw new CoreV2ColorResolutionError('$', 'color input path must be a nonempty string');
    }

    if (typeof value === 'string' && this.#themeEntries.has(value)) {
      const channels = this.#themeEntries.get(value);
      if (!channels) {
        throw new CoreV2ColorResolutionError(inputPath, `theme color ${value} is unavailable`);
      }
      return resolvedColor(channels, 'theme', value);
    }

    return resolvedColor(resolveDirectChannels(value, inputPath), 'direct');
  }
}

export function createCoreV2ColorResolver(
  theme: CoreV2ColorTheme = Object.freeze({}),
): CoreV2ColorResolver {
  return new CoreV2ColorResolver(theme);
}

function buildThemeEntries(
  theme: CoreV2ColorTheme,
  inputPath: string,
): ReadonlyMap<string, CoreV2ColorChannels> {
  if (!isPlainRecord(theme)) {
    throw new CoreV2ColorResolutionError(inputPath, 'color theme must be a plain object');
  }

  const entries = new Map<string, CoreV2ColorChannels>();
  collectThemeEntries(theme, '', inputPath, entries);
  return entries;
}

function collectThemeEntries(
  record: Readonly<Record<string, unknown>>,
  prefix: string,
  inputPath: string,
  entries: Map<string, CoreV2ColorChannels>,
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
      throw new CoreV2ColorResolutionError(valuePath, `duplicate theme color path ${themeKey}`);
    }
    entries.set(themeKey, resolveDirectChannels(value, valuePath));
  }
}

function resolveDirectChannels(value: unknown, inputPath: string): CoreV2ColorChannels {
  const detached = validateAndDetachColorSource(value, inputPath);

  let color: Color;
  try {
    color = new Color(detached);
  } catch {
    throw new CoreV2ColorResolutionError(
      inputPath,
      'color input is neither a resolvable theme path nor a supported PixiJS color',
    );
  }

  const normalized = color.toArray();
  const byteRgb = color.toUint8RgbArray();
  if (normalized.length !== 4 || byteRgb.length !== 3) {
    throw new CoreV2ColorResolutionError(inputPath, 'PixiJS color conversion was not canonical RGBA');
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
  ] as CoreV2ByteRgba);
  const rgba = `#${byteRgba
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`.toLowerCase();
  if (!CANONICAL_RGBA.test(rgba)) {
    throw new CoreV2ColorResolutionError(inputPath, 'PixiJS color conversion was not canonical RGBA');
  }
  const normalizedRgba = Object.freeze([
    red,
    green,
    blue,
    alpha,
  ] as CoreV2NormalizedRgba);

  return Object.freeze({
    rgba: rgba as CoreV2CanonicalRgba,
    normalizedRgba,
    byteRgba,
  });
}

function validateAndDetachColorSource(value: unknown, inputPath: string): ColorSource {
  if (value instanceof Color) return new Color(value);

  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      throw new CoreV2ColorResolutionError(inputPath, 'color string must not be empty');
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 0xffffff) {
      throw new CoreV2ColorResolutionError(inputPath, 'numeric color must be a finite 24-bit integer');
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
    throw new CoreV2ColorResolutionError(
      inputPath,
      'typed color arrays must be Float32Array, Uint8Array, or Uint8ClampedArray',
    );
  }

  if (!isPlainRecord(value)) {
    throw new CoreV2ColorResolutionError(inputPath, 'color input uses an unsupported value type');
  }

  return validateAndDetachColorObject(value, inputPath);
}

function validateAndDetachColorObject(
  value: Readonly<Record<string, unknown>>,
  inputPath: string,
): ColorSource {
  const keys = Object.keys(value);
  if (hasOwn(value, 'r') || hasOwn(value, 'g') || hasOwn(value, 'b')) {
    assertExactFields(keys, RGB_FIELDS, inputPath, ['r', 'g', 'b']);
    const result = {
      r: colorNumber(value.r, inputPath, 'RGB channel r', 0, 255),
      g: colorNumber(value.g, inputPath, 'RGB channel g', 0, 255),
      b: colorNumber(value.b, inputPath, 'RGB channel b', 0, 255),
      ...(hasOwn(value, 'a')
        ? { a: colorNumber(value.a, inputPath, 'alpha channel', 0, 1) }
        : {}),
    };
    return result;
  }

  if (hasOwn(value, 'l')) {
    assertExactFields(keys, HSL_FIELDS, inputPath, ['h', 's', 'l']);
    const result = {
      h: colorNumber(value.h, inputPath, 'HSL channel h', 0, 360),
      s: colorNumber(value.s, inputPath, 'HSL channel s', 0, 100),
      l: colorNumber(value.l, inputPath, 'HSL channel l', 0, 100),
      ...(hasOwn(value, 'a')
        ? { a: colorNumber(value.a, inputPath, 'alpha channel', 0, 1) }
        : {}),
    };
    return result;
  }

  if (hasOwn(value, 'v')) {
    assertExactFields(keys, HSV_FIELDS, inputPath, ['h', 's', 'v']);
    const result = {
      h: colorNumber(value.h, inputPath, 'HSV channel h', 0, 360),
      s: colorNumber(value.s, inputPath, 'HSV channel s', 0, 100),
      v: colorNumber(value.v, inputPath, 'HSV channel v', 0, 100),
      ...(hasOwn(value, 'a')
        ? { a: colorNumber(value.a, inputPath, 'alpha channel', 0, 1) }
        : {}),
    };
    return result;
  }

  throw new CoreV2ColorResolutionError(
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
    throw new CoreV2ColorResolutionError(inputPath, 'color arrays must contain three or four channels');
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
    throw new CoreV2ColorResolutionError(
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
      throw new CoreV2ColorResolutionError(inputPath, `color object is missing ${field}`);
    }
  }
  for (const field of keys) {
    if (!allowed.has(field)) {
      throw new CoreV2ColorResolutionError(
        inputPath,
        `unsupported color object field ${field}`,
      );
    }
  }
}

function resolvedColor(
  channels: CoreV2ColorChannels,
  source: 'direct',
): CoreV2ResolvedColor;
function resolvedColor(
  channels: CoreV2ColorChannels,
  source: 'theme',
  themePath: string,
): CoreV2ResolvedColor;
function resolvedColor(
  channels: CoreV2ColorChannels,
  source: 'direct' | 'theme',
  themePath?: string,
): CoreV2ResolvedColor {
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
    hasOwn(value, 'r') ||
    hasOwn(value, 'g') ||
    hasOwn(value, 'b') ||
    hasOwn(value, 'l') ||
    hasOwn(value, 'v')
  );
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function appendObjectPath(base: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}
