import type { PatchMapAssetDescriptor, PatchMapAssetSource } from '../semantic/dataset';
import { PATCH_MAP_FIRA_CODE_FAMILY } from '../semantic/text-font-family';
import { isPlainRecord } from '../shared/plain-record';
import { stableHash64Hex as stableHash } from '../shared/stable-hash';
import {
  PatchMapAssetError,
  type PatchMapAssetRegistration,
  type PatchMapNormalizedAssetRegistration,
} from './contracts';
import {
  BUILTIN_IMAGE_SVGS,
  builtinImageSvg,
  type BuiltinImageAlias,
} from './builtin-image-glyphs';

export const BUILTIN_IMAGE_ALIASES = Object.freeze(
  Object.keys(BUILTIN_IMAGE_SVGS) as BuiltinImageAlias[],
);

export const BUILTIN_FIRA_CODE_FACES = Object.freeze([
  builtinFiraCodeFace(
    300,
    'FiraCode-Light.woff2',
    102_924,
    'e3aa3db06cfb19dfc0b0f1f38355add3e8d1ef45d3af39ce95d9ca7d96114e6c',
  ),
  builtinFiraCodeFace(
    400,
    'FiraCode-Regular.woff2',
    103_240,
    'a6ce59520b90e15d7062ffef214f94c8add5a4085c0bbb1683602ef227a4d1fe',
  ),
  builtinFiraCodeFace(
    500,
    'FiraCode-Medium.woff2',
    102_384,
    '0e04bafb989ea46e840a581e49557b229662a00021493a5744c595d0882adf28',
  ),
  builtinFiraCodeFace(
    600,
    'FiraCode-SemiBold.woff2',
    106_992,
    'd16779aa6dfc7c4effe686ece5bdf4b1356a7352167e37fa256f596a9d428f11',
  ),
  builtinFiraCodeFace(
    700,
    'FiraCode-Bold.woff2',
    107_788,
    'd778c19803c672d294663e9283c7b752cc125ab266f0ddb8e53b039da92caf67',
  ),
]);

export const BUILTIN_FONT_WEIGHTS = Object.freeze(
  BUILTIN_FIRA_CODE_FACES.map(({ fontWeight }) => fontWeight),
);

export const PATCH_MAP_BUILTIN_FONT_ASSETS: readonly PatchMapAssetRegistration[] = Object.freeze(
  BUILTIN_FIRA_CODE_FACES.map((face) => Object.freeze({
    alias: `FiraCode-${face.fontWeight}`,
    descriptor: Object.freeze({
      src: face.descriptorSource,
      parser: 'web-font',
      data: Object.freeze({
        family: PATCH_MAP_FIRA_CODE_FAMILY,
        weights: Object.freeze([String(face.fontWeight)]),
      }),
    }),
    kind: 'font' as const,
    fontWeight: face.fontWeight,
  })),
);

export const PATCH_MAP_BUILTIN_ASSETS: readonly PatchMapAssetRegistration[] = Object.freeze([
  ...BUILTIN_IMAGE_ALIASES.map((alias) => Object.freeze({
    alias,
    descriptor: `patch-map-builtin://images/${alias}.svg`,
    kind: 'image' as const,
  })),
  ...PATCH_MAP_BUILTIN_FONT_ASSETS,
]);

function builtinFiraCodeFace(
  fontWeight: 300 | 400 | 500 | 600 | 700,
  fileName: string,
  byteLength: number,
  sha256: string,
) {
  return Object.freeze({
    fontWeight,
    fileName,
    byteLength,
    sha256,
    descriptorSource: `patch-map-builtin://fonts/${fileName}?sha256=${sha256}`,
  });
}

const PACKAGE_BUILTIN_SIGNATURES = new Map(PATCH_MAP_BUILTIN_ASSETS.map((registration) => {
  const normalized = normalizeRegistration(registration);
  const canonical = canonicalDescriptor(normalized.descriptor);
  return [normalized.alias, registrationSignature(normalized, canonical)] as const;
}));

export function normalizeRegistration(
  registration: PatchMapAssetRegistration,
): PatchMapNormalizedAssetRegistration {
  if (!isPlainRecord(registration)) invalidAsset('asset registration must be an object');
  const alias = nonempty(registration.alias, 'alias');
  const descriptor = normalizeDescriptor(registration.descriptor);
  const kind = registration.kind ?? 'image';
  if (kind !== 'image' && kind !== 'font') invalidAsset('asset kind must be image or font');
  if (
    registration.fontWeight !== undefined &&
    (!Number.isInteger(registration.fontWeight) || registration.fontWeight <= 0)
  ) {
    invalidAsset('fontWeight must be a positive integer');
  }
  return Object.freeze({
    alias,
    descriptor,
    kind,
    ...(registration.fontWeight === undefined ? {} : { fontWeight: registration.fontWeight }),
  });
}

export function normalizePatchMapAssetDescriptor(source: PatchMapAssetSource): PatchMapAssetDescriptor {
  return normalizeDescriptor(source);
}

export function normalizeDescriptor(source: PatchMapAssetSource): PatchMapAssetDescriptor {
  if (typeof source === 'string') return Object.freeze({ src: nonempty(source, 'asset src') });
  if (!isPlainRecord(source)) invalidAsset('asset descriptor must be a plain object');
  const keys = Object.keys(source);
  const allowed = new Set(['src', 'data', 'format', 'parser', 'loadParser']);
  if (keys.some((key) => !allowed.has(key))) invalidAsset('asset descriptor has an unknown field');
  const descriptor: PatchMapAssetDescriptor = {
    src: nonempty(source.src, 'asset src'),
    ...(source.data === undefined ? {} : { data: cloneJsonRecord(source.data, 'asset data') }),
    ...(source.format === undefined ? {} : { format: nonempty(source.format, 'asset format') }),
    ...(source.parser === undefined ? {} : { parser: nonempty(source.parser, 'asset parser') }),
    ...(source.loadParser === undefined
      ? {}
      : { loadParser: nonempty(source.loadParser, 'asset loadParser') }),
  };
  return deepFreeze(descriptor);
}

export function canonicalDescriptor(descriptor: PatchMapAssetDescriptor): string {
  return stableSerialize(descriptor);
}

export function registrationSignature(
  registration: PatchMapNormalizedAssetRegistration,
  canonical: string,
): string {
  return `${canonical}|${registration.kind}|${registration.fontWeight ?? ''}`;
}

export function resourceIdentityFields(canonical: string, packageOwned: boolean): Readonly<{
  resourceIdentity: string;
  cacheIdentity: string;
  packageOwned: boolean;
}> {
  const resourceIdentity = `${packageOwned ? 'package' : 'host'}:${canonical}`;
  return Object.freeze({
    resourceIdentity,
    cacheIdentity: `descriptor:${stableHash(resourceIdentity)}`,
    packageOwned,
  });
}

export function isPackageBuiltin(
  registration: PatchMapNormalizedAssetRegistration,
  canonical: string,
): boolean {
  return PACKAGE_BUILTIN_SIGNATURES.get(registration.alias) ===
    registrationSignature(registration, canonical);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidAsset('asset descriptor numbers must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return invalidAsset('asset descriptor must contain JSON values');
}

function cloneJsonRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) invalidAsset(`${label} must be a plain object`);
  return deepFreeze(cloneJson(value, new WeakSet<object>()) as Record<string, unknown>);
}

function cloneJson(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidAsset('asset descriptor numbers must be finite');
    return value;
  }
  if (typeof value !== 'object') invalidAsset('asset descriptor must contain JSON values');
  if (ancestors.has(value)) invalidAsset('asset descriptor cannot be cyclic');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((entry) => cloneJson(entry, ancestors)));
    if (!isPlainRecord(value)) invalidAsset('asset descriptor objects must be plain');
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) result[key] = cloneJson(value[key], ancestors);
    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
}

export function builtinImageDataUri(alias: string): string {
  if (!Object.hasOwn(BUILTIN_IMAGE_SVGS, alias)) invalidAsset('unknown builtin image alias');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    builtinImageSvg(alias as BuiltinImageAlias),
  )}`;
}

export function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalidAsset(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export function invalidAsset(message: string): never {
  const error = new PatchMapAssetError('INVALID_VALUE', 'INVALID_INPUT', false);
  error.message = `INVALID_VALUE: ${message}`;
  throw error;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
