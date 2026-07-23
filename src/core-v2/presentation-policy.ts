export const CORE_V2_PRESENTATION_POLICY_REVISION =
  'core-v2-presentation-policy/1';

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
}

/** Dense renderer policy produced from one logical presentation policy. */
export interface CoreV2ResolvedPresentationPolicy {
  readonly revision: number;
  readonly highlightedEntityIds: readonly string[] | null;
  readonly deEmphasisAlpha: number;
  readonly hiddenEntityIds: readonly string[];
}

export interface CoreV2PresentationPolicyEntityProbe {
  readonly id: string;
  readonly denseEntityIds: readonly string[];
  readonly emphasis: number;
  readonly visible: boolean;
  readonly renderObjectCount: number;
}

export interface CoreV2PresentationPolicyProductProbe {
  readonly schemaRevision: typeof CORE_V2_PRESENTATION_POLICY_REVISION;
  readonly revision: number;
  readonly status: 'normal' | 'active';
  readonly highlightIds: readonly string[] | null;
  readonly deEmphasisAlpha: number;
  readonly hiddenLayerIds: readonly string[];
  readonly entities: readonly CoreV2PresentationPolicyEntityProbe[];
}

export interface CoreV2RendererPresentationEntityProbe {
  readonly entityId: string;
  readonly emphasis: number;
  readonly visible: boolean;
  readonly renderObjectCount: number;
}
