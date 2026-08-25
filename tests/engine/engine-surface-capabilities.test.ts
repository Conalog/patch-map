import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  PatchMapEngineSurface,
  PatchMapSurfaceDiagnosticsPort,
  PatchMapSurfaceGeometryQueryPort,
  PatchMapSurfaceLifecyclePort,
  PatchMapSurfaceMutationPresentationPort,
  PatchMapSurfaceProductObservationPort,
  PatchMapSurfaceViewportInputPort,
} from '../../src/patch-map/engine/contracts';

const CAPABILITY_KEYS = Object.freeze({
  lifecycle: Object.freeze([
    'canvasCount', 'destroyed', 'canvasElement', 'captureBase64', 'prepare',
    'load', 'loadAsync', 'publishFrame', 'suspendPresentation',
    'resumePresentation', 'resize', 'destroy',
  ] as const),
  mutationPresentation: Object.freeze([
    'reconcile', 'select', 'setReducedMotion', 'setSelectionOverlayPolicy',
    'setSelectionMarquee', 'setPresentationPolicy', 'clearPresentationPolicy',
    'presentationPolicyProbe', 'setPresentationLayer',
    'clearPresentationLayer', 'presentationLayersSnapshot',
    'refreshSemanticTargets', 'updateInstanceBarHeights',
  ] as const),
  viewportInput: Object.freeze([
    'setView', 'setViewportGesturePolicies', 'setViewportZoomLimits',
    'bindViewportInput', 'bindPointerInput', 'bindContextMenuInput',
    'bindAccessibilityActivation', 'cancelViewportGestures',
    'setAccessibilityTree', 'focusAccessibilityTarget',
    'accessibilitySurfaceProbe', 'hitTestScreen', 'screenToWorld',
  ] as const),
  geometryQuery: Object.freeze([
    'worldGeometrySnapshot', 'geometrySnapshot', 'selectionGeometries',
    'previewIncrementalRoots', 'clearIncrementalPreview',
    'queryRegionGeometry', 'relationHitTestScreen',
  ] as const),
  productObservation: Object.freeze([
    'sceneImageProbe', 'retrySceneImage', 'componentVisualProbe',
    'barPresentationProbe', 'paintOrderProbe', 'textProbe',
    'settleSceneImages', 'settleSceneImageBindings',
  ] as const),
  diagnostics: Object.freeze([
    'frameLoopActiveAnimations', 'frameLoopWorkloadSize',
    'viewportGestureActive', 'debugSnapshot', 'interactionOwnershipProbe',
    'pixiPublicSurfaceProbe', 'rendererLossProbe', 'forceRendererLoss',
  ] as const),
});

const OPTIONAL_KEYS = Object.freeze([
  'canvasElement', 'captureBase64', 'prepare', 'loadAsync',
  'suspendPresentation', 'resumePresentation',
  'setReducedMotion', 'setSelectionOverlayPolicy', 'setSelectionMarquee',
  'setPresentationPolicy', 'clearPresentationPolicy',
  'presentationPolicyProbe', 'setPresentationLayer',
  'clearPresentationLayer', 'presentationLayersSnapshot',
  'refreshSemanticTargets', 'updateInstanceBarHeights',
  'setViewportGesturePolicies', 'setViewportZoomLimits', 'bindViewportInput',
  'bindPointerInput', 'bindContextMenuInput', 'bindAccessibilityActivation',
  'cancelViewportGestures', 'setAccessibilityTree',
  'focusAccessibilityTarget', 'accessibilitySurfaceProbe',
  'worldGeometrySnapshot', 'geometrySnapshot', 'selectionGeometries',
  'previewIncrementalRoots', 'clearIncrementalPreview',
  'queryRegionGeometry', 'relationHitTestScreen', 'sceneImageProbe',
  'retrySceneImage', 'componentVisualProbe', 'barPresentationProbe',
  'paintOrderProbe', 'textProbe', 'settleSceneImages',
  'settleSceneImageBindings', 'frameLoopActiveAnimations',
  'frameLoopWorkloadSize', 'viewportGestureActive',
  'interactionOwnershipProbe', 'pixiPublicSurfaceProbe',
  'rendererLossProbe', 'forceRendererLoss',
] as const);

type CapabilityKey = typeof CAPABILITY_KEYS[
  keyof typeof CAPABILITY_KEYS
][number];
type OptionalKey<T> = {
  [Key in keyof T]-?: object extends Pick<T, Key> ? Key : never;
}[keyof T];

describe('PatchMap Engine surface capabilities', () => {
  it('keeps the injected surface as one compatibility composite', () => {
    expectTypeOf<PatchMapEngineSurface>()
      .toExtend<PatchMapSurfaceLifecyclePort>();
    expectTypeOf<PatchMapEngineSurface>()
      .toExtend<PatchMapSurfaceMutationPresentationPort>();
    expectTypeOf<PatchMapEngineSurface>()
      .toExtend<PatchMapSurfaceViewportInputPort>();
    expectTypeOf<PatchMapEngineSurface>()
      .toExtend<PatchMapSurfaceGeometryQueryPort>();
    expectTypeOf<PatchMapEngineSurface>()
      .toExtend<PatchMapSurfaceProductObservationPort>();
    expectTypeOf<PatchMapEngineSurface>()
      .toExtend<PatchMapSurfaceDiagnosticsPort>();

    expectTypeOf<keyof PatchMapEngineSurface>().toEqualTypeOf<CapabilityKey>();
    expectTypeOf<OptionalKey<PatchMapEngineSurface>>()
      .toEqualTypeOf<typeof OPTIONAL_KEYS[number]>();

    const keys = Object.values(CAPABILITY_KEYS).flat();
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(OPTIONAL_KEYS).size).toBe(OPTIONAL_KEYS.length);
    expect(OPTIONAL_KEYS.every((key) => keys.includes(key))).toBe(true);
  });
});
