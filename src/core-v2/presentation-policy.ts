export const CORE_V2_PRESENTATION_POLICY_REVISION =
  'core-v2-presentation-policy/1';

/** One detached logical or dense fill override in packed `0xRRGGBBAA` form. */
export interface CoreV2PresentationFillOverride {
  readonly id: string;
  readonly packedColor: number;
}

/**
 * Host-owned transient presentation state. Logical IDs are resolved by Core
 * into dense renderer IDs without mutating or annotating the loaded dataset.
 */
export interface CoreV2PresentationPolicyInput {
  /**
   * `null`/omitted disables highlight emphasis. An empty array deliberately
   * de-emphasizes every current entity until the policy is cleared.
   */
  readonly highlightIds?: readonly string[] | null;
  readonly deEmphasisAlpha?: number;
  readonly hiddenLayerIds?: readonly string[];
  readonly fillOverrides?: readonly CoreV2PresentationFillOverride[];
}

/** Dense renderer policy produced from one logical presentation policy. */
export interface CoreV2ResolvedPresentationPolicy {
  readonly revision: number;
  readonly highlightedEntityIds: readonly string[] | null;
  readonly deEmphasisAlpha: number;
  readonly hiddenEntityIds: readonly string[];
  readonly fillOverrides: readonly CoreV2PresentationFillOverride[];
}

export interface CoreV2PresentationPolicyEntityProbe {
  readonly id: string;
  readonly denseEntityIds: readonly string[];
  readonly emphasis: number;
  readonly visible: boolean;
  readonly renderObjectCount: number;
  readonly packedFills: readonly number[];
}

export interface CoreV2PresentationPolicyProductProbe {
  readonly schemaRevision: typeof CORE_V2_PRESENTATION_POLICY_REVISION;
  readonly revision: number;
  readonly status: 'normal' | 'active';
  readonly highlightIds: readonly string[] | null;
  readonly deEmphasisAlpha: number;
  readonly hiddenLayerIds: readonly string[];
  readonly fillOverrides: readonly CoreV2PresentationFillOverride[];
  readonly entities: readonly CoreV2PresentationPolicyEntityProbe[];
}

export interface CoreV2RendererPresentationEntityProbe {
  readonly entityId: string;
  readonly emphasis: number;
  readonly visible: boolean;
  readonly renderObjectCount: number;
  readonly packedFill: number;
}
