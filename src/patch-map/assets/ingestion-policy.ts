import {
  PatchMapAssetError,
  type PatchMapAssetIngestionDecision,
  type PatchMapAssetIngestionPolicyProfile,
  type PatchMapAssetPolicy,
  type PatchMapAssetPolicyContext,
  type PatchMapAssetResponseMetadata,
} from './contracts';
import { isPlainRecord } from '../shared/plain-record';
import { invalidAsset, nonempty } from './registration-normalization';

interface NormalizedIngestionProfile {
  readonly protocols: readonly string[];
  readonly origins: readonly string[];
  readonly mediaTypes: readonly string[];
  readonly maxEncodedBytes: number;
  readonly maxDecodedWidth: number;
  readonly maxDecodedHeight: number;
}

/**
 * Create the per-instance, pre-fetch half of the asset security boundary.
 * Package-owned builtins remain eligible; every host descriptor is checked
 * before the shared coordinator performs cache lookup or backend work.
 */
export function createPatchMapAssetIngestionPolicy(
  profile: PatchMapAssetIngestionPolicyProfile,
): PatchMapAssetPolicy {
  const normalized = normalizeIngestionProfile(profile);
  return (context): void => {
    if (context.packageOwned) return;
    assertAssetUrlAllowed(normalized, context.descriptor.src, 'descriptor');
  };
}

/** Evaluate decoded/fetched metadata before a cache lease or GPU upload. */
export function evaluatePatchMapAssetResponsePolicy(
  profile: PatchMapAssetIngestionPolicyProfile,
  metadata: PatchMapAssetResponseMetadata,
): PatchMapAssetIngestionDecision {
  const normalized = normalizeIngestionProfile(profile);
  try {
    const requestUrl = nonempty(metadata.requestUrl, 'asset response requestUrl');
    assertAssetUrlAllowed(normalized, requestUrl, 'descriptor');
    const redirects = metadata.redirectUrls === undefined
      ? []
      : [...metadata.redirectUrls];
    for (const redirectUrl of redirects) {
      assertAssetUrlAllowed(
        normalized,
        nonempty(redirectUrl, 'asset redirectUrl'),
        'redirect',
      );
    }
    assertAssetUrlAllowed(
      normalized,
      nonempty(metadata.finalUrl, 'asset response finalUrl'),
      redirects.length === 0 ? 'descriptor' : 'redirect',
    );
    const mediaType = normalizeMediaType(metadata.mediaType);
    if (!normalized.mediaTypes.includes(mediaType)) {
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
    return Object.freeze({
      accepted: true,
      code: null,
      stage: 'accepted',
    });
  } catch (error) {
    if (
      error instanceof PatchMapAssetError &&
      error.code === 'ASSET_POLICY_REJECTED'
    ) {
      const stage = error.message.includes('redirect')
        ? 'redirect'
        : 'descriptor';
      return rejectedAssetDecision(stage);
    }
    throw error;
  }
}

export function assertPatchMapAssetResponseAllowed(
  profile: PatchMapAssetIngestionPolicyProfile,
  metadata: PatchMapAssetResponseMetadata,
): void {
  const decision = evaluatePatchMapAssetResponsePolicy(profile, metadata);
  if (!decision.accepted) {
    throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
  }
}

function normalizeIngestionProfile(
  profile: PatchMapAssetIngestionPolicyProfile,
): NormalizedIngestionProfile {
  if (!isPlainRecord(profile)) invalidAsset('asset ingestion policy must be an object');
  if (profile.redirects !== 'revalidate') {
    invalidAsset('asset redirects policy must be revalidate');
  }
  if (profile.credentials !== 'omit') {
    invalidAsset('asset credentials policy must be omit');
  }
  const protocols = uniquePolicyStrings(profile.protocols, 'asset protocols')
    .map((protocol) => protocol.replace(/:$/u, '').toLowerCase());
  const origins = uniquePolicyStrings(profile.origins, 'asset origins').map((origin) => {
    try {
      const parsed = new URL(origin);
      if (parsed.origin === 'null') invalidAsset('asset origin must be hierarchical');
      return parsed.origin.toLowerCase();
    } catch (error) {
      if (error instanceof PatchMapAssetError) throw error;
      return invalidAsset('asset origin must be an absolute URL');
    }
  });
  const mediaTypes = uniquePolicyStrings(profile.mediaTypes, 'asset mediaTypes')
    .map(normalizeMediaType);
  return Object.freeze({
    protocols: Object.freeze(protocols),
    origins: Object.freeze(origins),
    mediaTypes: Object.freeze(mediaTypes),
    maxEncodedBytes: positiveSafeInteger(profile.maxEncodedBytes, 'asset maxEncodedBytes'),
    maxDecodedWidth: positiveSafeInteger(profile.maxDecodedWidth, 'asset maxDecodedWidth'),
    maxDecodedHeight: positiveSafeInteger(profile.maxDecodedHeight, 'asset maxDecodedHeight'),
  });
}

function assertAssetUrlAllowed(
  profile: NormalizedIngestionProfile,
  source: string,
  stage: 'descriptor' | 'redirect',
): void {
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw policyRejected(stage);
  }
  const protocol = parsed.protocol.replace(/:$/u, '').toLowerCase();
  if (
    !profile.protocols.includes(protocol) ||
    parsed.origin === 'null' ||
    !profile.origins.includes(parsed.origin.toLowerCase()) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw policyRejected(stage);
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

function policyRejected(stage: 'descriptor' | 'redirect'): PatchMapAssetError {
  const error = new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', false);
  error.message = `ASSET_POLICY_REJECTED: ${stage}`;
  return error;
}

function uniquePolicyStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    invalidAsset(`${label} must be a non-empty array`);
  }
  const values = value.map((entry, index) => nonempty(entry, `${label}[${index}]`));
  if (new Set(values).size !== values.length) invalidAsset(`${label} must be unique`);
  return values;
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

export function allowPackageBuiltinsOnly(context: PatchMapAssetPolicyContext): void {
  if (!context.packageOwned) {
    throw new PatchMapAssetError('ASSET_POLICY_REJECTED', 'ASSET_FAILURE', true);
  }
}
