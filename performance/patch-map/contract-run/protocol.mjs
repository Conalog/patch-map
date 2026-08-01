export const SIZES = Object.freeze([
  100,
  500,
  1_000,
  2_000,
  5_000,
  'production-shaped-workload-v1',
]);

export const PERFORMANCE_CASE_IDS = Object.freeze([
  'PRF-001',
  'PRF-002',
  'PRF-003',
  'PRF-004',
  'PRF-005',
  'PRF-006',
  'PRF-009',
]);

export const WARMUPS = 2;
export const MEASURED = 7;
export const SEED = 319;
export const PROXY_CPU_THROTTLE_RATE = 4;
export const CPU_PROFILE = 'windows-low-end-n100-8g-v1';
export const PRODUCTION_DATASET_SHA256 =
  '4bc16c65500b4f305114162fdc4472b45997eea7498020496072ca0b741e95c3';

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assert(condition, message) {
  if (!condition) throw new Error(`Invalid PatchMap contract performance run: ${message}`);
}
