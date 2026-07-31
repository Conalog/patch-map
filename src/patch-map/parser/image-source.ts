import type {
  PatchMapImageProjection,
  PatchMapImageSourceKind,
} from '../contracts';
import { stableHash64Hex as stableHash } from '../shared/stable-hash';

export interface PatchMapNormalizedImageSource {
  readonly authoredSource: PatchMapImageProjection['authoredSource'];
  readonly bindingKey: string;
  readonly cacheIdentity: string;
  readonly sourceKind: PatchMapImageSourceKind;
}

/**
 * Owns the stable renderer/cache identity policy for one validated image
 * source. Validation and caller-owned value detachment stay in the parser.
 */
export function normalizePatchMapImageSource(
  authoredSource: PatchMapImageProjection['authoredSource'],
): PatchMapNormalizedImageSource {
  if (typeof authoredSource === 'string') {
    const sourceKind = classifyImageSourceString(authoredSource);
    if (sourceKind === 'data-uri') {
      const identity = `data-uri:${authoredSource.length}:${stableHash(authoredSource)}`;
      return Object.freeze({
        authoredSource,
        bindingKey: identity,
        cacheIdentity: identity,
        sourceKind,
      });
    }
    const identity = `${sourceKind}:${authoredSource}`;
    return Object.freeze({
      authoredSource,
      bindingKey: identity,
      cacheIdentity: identity,
      sourceKind,
    });
  }

  const canonical = stableSerializeJson(authoredSource);
  return Object.freeze({
    authoredSource,
    bindingKey: `descriptor:${canonical}`,
    cacheIdentity: descriptorCacheIdentity(authoredSource),
    sourceKind: 'descriptor',
  });
}

function classifyImageSourceString(
  source: string,
): Exclude<PatchMapImageSourceKind, 'descriptor'> {
  if (/^data:/iu.test(source)) return 'data-uri';
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(source)) return 'url';
  return 'alias';
}

function descriptorCacheIdentity(
  source: Exclude<PatchMapImageProjection['authoredSource'], string>,
): string {
  if (descriptorNeedsFramedIdentity(source)) {
    const canonical = stableSerializeJson(source);
    return `descriptor-safe:${source.src.length}:${source.src}:${stableHash(canonical)}`;
  }
  const query: Array<readonly [string, unknown]> = [];
  if (source.data !== undefined) {
    const keys = Object.keys(source.data).sort();
    if (keys.length === 0) query.push(['data', source.data]);
    for (const key of keys) query.push([key, source.data[key]]);
  }
  if (source.format !== undefined) query.push(['format', source.format]);
  if (source.parser !== undefined) query.push(['parser', source.parser]);
  if (source.loadParser !== undefined) query.push(['loadParser', source.loadParser]);
  query.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const suffix = query.length === 0
    ? ''
    : `?${query.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(
        scalarIdentityValue(value),
      )}`).join('&')}`;
  return `descriptor:${source.src}${suffix}`;
}

function descriptorNeedsFramedIdentity(
  source: Exclude<PatchMapImageProjection['authoredSource'], string>,
): boolean {
  if (/[?#]/u.test(source.src)) return true;
  const topLevelOptionNames = new Set(['data', 'format', 'parser', 'loadParser']);
  return Object.keys(source.data ?? {}).some((key) => topLevelOptionNames.has(key));
}

function scalarIdentityValue(value: unknown): string {
  return typeof value === 'string' ? value : stableSerializeJson(value);
}

function stableSerializeJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableSerializeJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerializeJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(`@unsupported:${typeof value}`);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
