import type { PatchMapTextProductProbe } from '../core/contracts';
import type { PatchMapEngineTextPublicationStatus } from './contracts/rendering';

/**
 * Classify the engine-visible publication state of an indexed surface text probe.
 * The facade owns revision correlation; this policy owns proof that the renderer
 * and its aggregate text lane represent the same semantic projection.
 */
export function resolvePatchMapTextPublicationStatus(
  probe: PatchMapTextProductProbe | null,
  publishedCurrent: boolean,
): PatchMapEngineTextPublicationStatus {
  if (surfaceTextProbeIsAbsent(probe)) return 'absent';
  if (surfaceTextProbeIsCurrent(probe) && publishedCurrent) return 'current';
  return probe === null ? 'unavailable' : 'pending';
}

function surfaceTextProbeIsCurrent(probe: PatchMapTextProductProbe | null): boolean {
  if (
    probe === null ||
    !probe.state.visible ||
    probe.publication.status !== 'current' ||
    probe.publication.sceneRevision !== probe.publication.renderedSceneRevision ||
    probe.publication.rendererFrame === null ||
    probe.renderer.route === null ||
    probe.renderer.route === 'none' ||
    probe.renderer.rendererKind === 'none' ||
    probe.renderer.route !== probe.renderer.rendererKind ||
    probe.renderer.objectCount !== 1 ||
    probe.renderer.staleGlyphCount !== 0 ||
    probe.renderer.lastRenderedFrame !== probe.publication.rendererFrame ||
    probe.renderer.attachedSignatures === null ||
    probe.renderer.lastRenderedSignatures === null ||
    probe.rendererPaint === null ||
    probe.renderLanes === null
  ) {
    return false;
  }
  const expected = {
    content: probe.semantic.contentSignature,
    style: probe.semantic.styleSignature,
    layout: probe.semantic.layoutSignature,
  };
  const semantic = probe.renderer.semanticSignatures;
  const attached = probe.renderer.attachedSignatures;
  const rendered = probe.renderer.lastRenderedSignatures;
  return semantic.content === expected.content &&
    semantic.style === expected.style &&
    semantic.layout === expected.layout &&
    attached.content === semantic.content &&
    attached.style === semantic.style &&
    attached.layout === semantic.layout &&
    rendered.content === attached.content &&
    rendered.style === attached.style &&
    rendered.layout === attached.layout &&
    rendered.renderer === attached.renderer &&
    probe.rendererPaint.entityId === probe.entityId &&
    probe.rendererPaint.lane === 'text' &&
    probe.rendererPaint.rendererKind === 'text' &&
    probe.rendererPaint.primitiveCount === 1 &&
    probe.rendererPaint.renderObjectCount === 1 &&
    probe.rendererPaint.packedTint === (probe.semantic.color >>> 0) &&
    probe.rendererPaint.rgbTint === (probe.semantic.color >>> 8) &&
    probe.rendererPaint.alpha ===
      (((probe.semantic.color >>> 0) & 0xff) / 255) * probe.state.opacity &&
    probe.renderLanes.text.role === 'text' &&
    probe.renderLanes.text.renderObjectCount >= 1 &&
    probe.renderLanes.text.visiblePrimitiveCount >= 1;
}

function surfaceTextProbeIsAbsent(probe: PatchMapTextProductProbe | null): boolean {
  return probe !== null &&
    !probe.state.visible &&
    probe.geometry.visibleBounds === null &&
    probe.publication.status === 'absent' &&
    probe.renderer.route === null &&
    probe.renderer.rendererKind === 'none' &&
    probe.renderer.objectCount === 0 &&
    probe.renderer.staleGlyphCount === 0 &&
    probe.renderer.attachedSignatures === null &&
    probe.renderer.lastRenderedSignatures === null &&
    probe.renderer.lastRenderedFrame === null &&
    probe.rendererPaint === null &&
    probe.renderLanes === null;
}
