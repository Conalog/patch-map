export const PATCH_MAP_PRESENTATION_POLICY_REVISION =
  'patch-map-presentation-policy/1';

/** One detached logical or dense fill override in packed `0xRRGGBBAA` form. */
export interface PatchMapPresentationFillOverride {
  readonly id: string;
  readonly packedColor: number;
}

/**
 * Host-owned transient presentation state. Logical IDs are resolved by Core
 * into dense renderer IDs without mutating or annotating the loaded dataset.
 */
export interface PatchMapPresentationPolicyInput {
  /**
   * `null`/omitted disables highlight emphasis. An empty array deliberately
   * de-emphasizes every current entity until the policy is cleared.
   */
  readonly highlightIds?: readonly string[] | null;
  readonly deEmphasisAlpha?: number;
  readonly hiddenLayerIds?: readonly string[];
  readonly fillOverrides?: readonly PatchMapPresentationFillOverride[];
}

/** Dense renderer policy produced from one logical presentation policy. */
export interface PatchMapResolvedPresentationPolicy {
  readonly revision: number;
  readonly highlightedEntityIds: readonly string[] | null;
  readonly deEmphasisAlpha: number;
  readonly hiddenEntityIds: readonly string[];
  readonly fillOverrides: readonly PatchMapPresentationFillOverride[];
}

export interface PatchMapPresentationPolicyEntityProbe {
  readonly id: string;
  readonly denseEntityIds: readonly string[];
  readonly emphasis: number;
  readonly visible: boolean;
  readonly renderObjectCount: number;
  readonly packedFills: readonly number[];
}

export interface PatchMapPresentationPolicyProductProbe {
  readonly schemaRevision: typeof PATCH_MAP_PRESENTATION_POLICY_REVISION;
  readonly revision: number;
  readonly status: 'normal' | 'active';
  readonly highlightIds: readonly string[] | null;
  readonly deEmphasisAlpha: number;
  readonly hiddenLayerIds: readonly string[];
  readonly fillOverrides: readonly PatchMapPresentationFillOverride[];
  readonly entities: readonly PatchMapPresentationPolicyEntityProbe[];
}

export interface PatchMapRendererPresentationEntityProbe {
  readonly entityId: string;
  readonly emphasis: number;
  readonly visible: boolean;
  readonly renderObjectCount: number;
  readonly packedFill: number;
}
