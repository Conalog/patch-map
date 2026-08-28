import {
  PatchMapAssetError,
  type PatchMapAssetPolicy,
  type PatchMapResolvedAssetPolicy,
  type PatchMapAssetIngestionDecision,
  type PatchMapAssetResponseMetadata,
} from './contracts';
import { isPlainRecord } from '../shared/plain-record';
import { invalidAsset, nonempty } from './registration-normalization';

export const PATCH_MAP_DEFAULT_ASSET_POLICY: PatchMapResolvedAssetPolicy = Object.freeze({
  maxEncodedBytes: 20 * 1024 * 1024,
  maxDecodedWidth: 8192,
  maxDecodedHeight: 8192,
});

const PATCH_MAP_ASSET_MEDIA_TYPES = Object.freeze([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  'application/font-woff',
]);

export function normalizePatchMapAssetPolicy(
  policy: PatchMapAssetPolicy | undefined,
): PatchMapResolvedAssetPolicy {
  if (policy !== undefined && !isPlainRecord(policy)) {
    invalidAsset('asset policy must be an object');
  }
  const value = policy ?? {};
  const keys = Object.keys(value);
  if (keys.some((key) => !Object.hasOwn(PATCH_MAP_DEFAULT_ASSET_POLICY, key))) {
    invalidAsset('asset policy contains an unknown field');
  }
  return Object.freeze({
    maxEncodedBytes: positiveSafeInteger(
      value.maxEncodedBytes ?? PATCH_MAP_DEFAULT_ASSET_POLICY.maxEncodedBytes,
      'asset maxEncodedBytes',
    ),
    maxDecodedWidth: positiveSafeInteger(
      value.maxDecodedWidth ?? PATCH_MAP_DEFAULT_ASSET_POLICY.maxDecodedWidth,
      'asset maxDecodedWidth',
    ),
    maxDecodedHeight: positiveSafeInteger(
      value.maxDecodedHeight ?? PATCH_MAP_DEFAULT_ASSET_POLICY.maxDecodedHeight,
      'asset maxDecodedHeight',
    ),
  });
}

/** Evaluate decoded/fetched metadata before a cache lease or GPU upload. */
export function evaluatePatchMapAssetResponsePolicy(
  policy: PatchMapResolvedAssetPolicy,
  metadata: PatchMapAssetResponseMetadata,
): PatchMapAssetIngestionDecision {
  const normalized = normalizePatchMapAssetPolicy(policy);
  const mediaType = normalizeMediaType(metadata.mediaType);
  if (!PATCH_MAP_ASSET_MEDIA_TYPES.includes(mediaType)) {
    return rejectedAssetDecision('media-type');
  }
  if (
    !Number.isSafeInteger(metadata.encodedBytes) ||
    metadata.encodedBytes < 0 ||
    metadata.encodedBytes > normalized.maxEncodedBytes
  ) {
    return rejectedAssetDecision('encoded-bytes');
  }
  if (
    metadata.decodedWidth !== undefined ||
    metadata.decodedHeight !== undefined
  ) {
    if (
      !positiveFinite(metadata.decodedWidth) ||
      !positiveFinite(metadata.decodedHeight) ||
      metadata.decodedWidth > normalized.maxDecodedWidth ||
      metadata.decodedHeight > normalized.maxDecodedHeight
    ) {
      return rejectedAssetDecision('decoded-size');
    }
  }
  if (
    mediaType === 'image/svg+xml' &&
    metadata.svgText !== undefined &&
    unsafeSvg(metadata.svgText)
  ) {
    return rejectedAssetDecision('svg-content');
  }
  return Object.freeze({ accepted: true, code: null, stage: 'accepted' });
}

export function assertPatchMapAssetResponseAllowed(
  policy: PatchMapResolvedAssetPolicy,
  metadata: PatchMapAssetResponseMetadata,
): void {
  const decision = evaluatePatchMapAssetResponsePolicy(policy, metadata);
  if (!decision.accepted) {
    throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
  }
}

function rejectedAssetDecision(
  stage: Exclude<PatchMapAssetIngestionDecision['stage'], 'accepted'>,
): PatchMapAssetIngestionDecision {
  return Object.freeze({
    accepted: false,
    code: 'ASSET_POLICY_REJECTED',
    stage,
  });
}

export function normalizeMediaType(value: unknown): string {
  const mediaType = nonempty(value, 'asset media type')
    .split(';', 1)[0]!
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(mediaType)) {
    invalidAsset('asset media type is invalid');
  }
  return mediaType;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    invalidAsset(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function unsafeSvg(value: string): boolean {
  if (typeof value !== 'string') return true;
  return /<\s*(?:script|foreignObject)\b/iu.test(value) ||
    /\bon[a-z]+\s*=/iu.test(value) ||
    /\b(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/iu.test(value) ||
    /\burl\(\s*["']?\s*(?:https?:|\/\/)/iu.test(value);
}
