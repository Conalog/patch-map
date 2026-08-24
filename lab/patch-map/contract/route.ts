import {
  PATCH_MAP_CONTRACT_PRESENTER_BY_ID,
  selectPatchMapContractPresenter,
  type PatchMapContractPresenterDescriptor,
} from './presenters';

export const PATCH_MAP_CONTRACT_ROUTE_PATH = '/lab/patch-map/';
export const PATCH_MAP_CONTRACT_LEGACY_ROUTE_PATH = '/lab/core-v2';
export const PATCH_MAP_CONTRACT_DATASET_SIZES = [
  '100',
  '500',
  '1000',
  '2000',
  '5000',
  'production',
] as const;

export type PatchMapContractDatasetSize = (typeof PATCH_MAP_CONTRACT_DATASET_SIZES)[number];
export type PatchMapContractRouteErrorCode =
  | 'INVALID_PATH'
  | 'INVALID_QUERY'
  | 'UNKNOWN_PARAMETER'
  | 'DUPLICATE_PARAMETER'
  | 'MISSING_PARAMETER'
  | 'INVALID_SCENARIO'
  | 'INVALID_SIZE'
  | 'INVALID_SEED';

export interface PatchMapContractRoute {
  readonly path:
    | typeof PATCH_MAP_CONTRACT_ROUTE_PATH
    | typeof PATCH_MAP_CONTRACT_LEGACY_ROUTE_PATH;
  readonly scenario: string;
  readonly size: PatchMapContractDatasetSize;
  readonly seed: number;
  readonly canonicalUrl: string;
  readonly presenter: PatchMapContractPresenterDescriptor;
}

export class PatchMapContractRouteError extends Error {
  readonly code: PatchMapContractRouteErrorCode;

  constructor(code: PatchMapContractRouteErrorCode, message: string) {
    super(message);
    this.name = 'PatchMapContractRouteError';
    this.code = code;
  }
}

function fail(code: PatchMapContractRouteErrorCode, message: string): never {
  throw new PatchMapContractRouteError(code, message);
}

function asUrl(input: string | URL): URL {
  try {
    return input instanceof URL ? new URL(input.href) : new URL(input, 'http://patch-map.local');
  } catch {
    return fail('INVALID_QUERY', 'PatchMap contract route must be a valid URL');
  }
}

export function parsePatchMapContractDatasetSize(value: string): PatchMapContractDatasetSize {
  if (!PATCH_MAP_CONTRACT_DATASET_SIZES.some((size) => size === value)) {
    return fail('INVALID_SIZE', `Dataset size is not canonical: ${value}`);
  }
  return value as PatchMapContractDatasetSize;
}

export function parsePatchMapContractSeed(value: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    return fail('INVALID_SEED', `Seed must be a canonical uint32 decimal: ${value}`);
  }
  const seed = Number(value);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    return fail('INVALID_SEED', `Seed must be a canonical uint32 decimal: ${value}`);
  }
  return seed;
}

function parseRawParameters(search: string): Readonly<Record<'scenario' | 'size' | 'seed', string>> {
  if (search.length <= 1) {
    return fail('MISSING_PARAMETER', 'scenario, size, and seed are required');
  }

  const values = new Map<string, string>();
  for (const pair of search.slice(1).split('&')) {
    if (!/^[A-Za-z]+=[A-Za-z0-9-]+$/.test(pair)) {
      return fail('INVALID_QUERY', `Query parameter is not canonical: ${pair || '<empty>'}`);
    }
    const separator = pair.indexOf('=');
    const key = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (key !== 'scenario' && key !== 'size' && key !== 'seed') {
      return fail('UNKNOWN_PARAMETER', `Unknown PatchMap contract route parameter: ${key}`);
    }
    if (values.has(key)) {
      return fail('DUPLICATE_PARAMETER', `Duplicate PatchMap contract route parameter: ${key}`);
    }
    values.set(key, value);
  }

  for (const required of ['scenario', 'size', 'seed'] as const) {
    if (!values.has(required)) {
      return fail('MISSING_PARAMETER', `Missing PatchMap contract route parameter: ${required}`);
    }
  }

  return Object.freeze({
    scenario: values.get('scenario') ?? '',
    size: values.get('size') ?? '',
    seed: values.get('seed') ?? '',
  });
}

export function buildPatchMapContractRoute(
  scenario: string,
  size: PatchMapContractDatasetSize,
  seed: number,
): string {
  selectPatchMapContractPresenter(scenario);
  parsePatchMapContractDatasetSize(size);
  parsePatchMapContractSeed(String(seed));
  return `${PATCH_MAP_CONTRACT_ROUTE_PATH}?scenario=${scenario}&size=${size}&seed=${seed}`;
}

export function parsePatchMapContractRoute(input: string | URL): PatchMapContractRoute {
  const url = asUrl(input);
  if (
    url.pathname !== PATCH_MAP_CONTRACT_ROUTE_PATH &&
    url.pathname !== PATCH_MAP_CONTRACT_LEGACY_ROUTE_PATH
  ) {
    return fail('INVALID_PATH', `PatchMap contract route path must be ${PATCH_MAP_CONTRACT_ROUTE_PATH}`);
  }
  if (url.hash !== '' || (typeof input === 'string' && input.includes('#'))) {
    return fail('INVALID_QUERY', 'PatchMap contract route must not include a fragment');
  }

  const params = parseRawParameters(url.search);
  if (!/^[A-Z]{3}-[0-9]{3}$/.test(params.scenario)) {
    return fail('INVALID_SCENARIO', `Scenario ID is not canonical: ${params.scenario}`);
  }
  if (!PATCH_MAP_CONTRACT_PRESENTER_BY_ID.has(params.scenario)) {
    return fail('INVALID_SCENARIO', `Scenario is not approved: ${params.scenario}`);
  }

  const size = parsePatchMapContractDatasetSize(params.size);
  const seed = parsePatchMapContractSeed(params.seed);
  const presenter = selectPatchMapContractPresenter(params.scenario);
  const canonicalUrl = buildPatchMapContractRoute(params.scenario, size, seed);

  return Object.freeze({
    path: url.pathname,
    scenario: params.scenario,
    size,
    seed,
    canonicalUrl,
    presenter,
  });
}
