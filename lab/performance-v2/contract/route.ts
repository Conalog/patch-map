import {
  CORE_V2_CONTRACT_PRESENTER_BY_ID,
  selectCoreV2ContractPresenter,
  type CoreV2ContractPresenterDescriptor,
} from './presenters';

export const CORE_V2_CONTRACT_ROUTE_PATH = '/lab/core-v2';
export const CORE_V2_CONTRACT_DATASET_SIZES = [
  '100',
  '500',
  '1000',
  '2000',
  '5000',
  'production',
] as const;

export type CoreV2ContractDatasetSize = (typeof CORE_V2_CONTRACT_DATASET_SIZES)[number];
export type CoreV2ContractRouteErrorCode =
  | 'INVALID_PATH'
  | 'INVALID_QUERY'
  | 'UNKNOWN_PARAMETER'
  | 'DUPLICATE_PARAMETER'
  | 'MISSING_PARAMETER'
  | 'INVALID_SCENARIO'
  | 'INVALID_SIZE'
  | 'INVALID_SEED';

export interface CoreV2ContractRoute {
  readonly path: typeof CORE_V2_CONTRACT_ROUTE_PATH;
  readonly scenario: string;
  readonly size: CoreV2ContractDatasetSize;
  readonly seed: number;
  readonly canonicalUrl: string;
  readonly presenter: CoreV2ContractPresenterDescriptor;
}

export class CoreV2ContractRouteError extends Error {
  readonly code: CoreV2ContractRouteErrorCode;

  constructor(code: CoreV2ContractRouteErrorCode, message: string) {
    super(message);
    this.name = 'CoreV2ContractRouteError';
    this.code = code;
  }
}

function fail(code: CoreV2ContractRouteErrorCode, message: string): never {
  throw new CoreV2ContractRouteError(code, message);
}

function asUrl(input: string | URL): URL {
  try {
    return input instanceof URL ? new URL(input.href) : new URL(input, 'http://core-v2.local');
  } catch {
    return fail('INVALID_QUERY', 'Core v2 contract route must be a valid URL');
  }
}

export function parseCoreV2ContractDatasetSize(value: string): CoreV2ContractDatasetSize {
  if (!CORE_V2_CONTRACT_DATASET_SIZES.some((size) => size === value)) {
    return fail('INVALID_SIZE', `Dataset size is not canonical: ${value}`);
  }
  return value as CoreV2ContractDatasetSize;
}

export function parseCoreV2ContractSeed(value: string): number {
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
      return fail('UNKNOWN_PARAMETER', `Unknown Core v2 contract route parameter: ${key}`);
    }
    if (values.has(key)) {
      return fail('DUPLICATE_PARAMETER', `Duplicate Core v2 contract route parameter: ${key}`);
    }
    values.set(key, value);
  }

  for (const required of ['scenario', 'size', 'seed'] as const) {
    if (!values.has(required)) {
      return fail('MISSING_PARAMETER', `Missing Core v2 contract route parameter: ${required}`);
    }
  }

  return Object.freeze({
    scenario: values.get('scenario') ?? '',
    size: values.get('size') ?? '',
    seed: values.get('seed') ?? '',
  });
}

export function buildCoreV2ContractRoute(
  scenario: string,
  size: CoreV2ContractDatasetSize,
  seed: number,
): string {
  selectCoreV2ContractPresenter(scenario);
  parseCoreV2ContractDatasetSize(size);
  parseCoreV2ContractSeed(String(seed));
  return `${CORE_V2_CONTRACT_ROUTE_PATH}?scenario=${scenario}&size=${size}&seed=${seed}`;
}

export function parseCoreV2ContractRoute(input: string | URL): CoreV2ContractRoute {
  const url = asUrl(input);
  if (url.pathname !== CORE_V2_CONTRACT_ROUTE_PATH) {
    return fail('INVALID_PATH', `Core v2 contract route path must be ${CORE_V2_CONTRACT_ROUTE_PATH}`);
  }
  if (url.hash !== '' || (typeof input === 'string' && input.includes('#'))) {
    return fail('INVALID_QUERY', 'Core v2 contract route must not include a fragment');
  }

  const params = parseRawParameters(url.search);
  if (!/^[A-Z]{3}-[0-9]{3}$/.test(params.scenario)) {
    return fail('INVALID_SCENARIO', `Scenario ID is not canonical: ${params.scenario}`);
  }
  if (!CORE_V2_CONTRACT_PRESENTER_BY_ID.has(params.scenario)) {
    return fail('INVALID_SCENARIO', `Scenario is not approved: ${params.scenario}`);
  }

  const size = parseCoreV2ContractDatasetSize(params.size);
  const seed = parseCoreV2ContractSeed(params.seed);
  const presenter = selectCoreV2ContractPresenter(params.scenario);
  const canonicalUrl = buildCoreV2ContractRoute(params.scenario, size, seed);

  return Object.freeze({
    path: CORE_V2_CONTRACT_ROUTE_PATH,
    scenario: params.scenario,
    size,
    seed,
    canonicalUrl,
    presenter,
  });
}
