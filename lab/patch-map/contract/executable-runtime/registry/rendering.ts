import { createPatchMapLayoutOrderRuntime } from '../../layout-order-runtime';
import { createPatchMapPresentationDynamicsRuntime } from '../../presentation-dynamics-runtime';
import { createPatchMapRenderComponentAssetsRuntime } from '../../render-component-assets-runtime';
import { createPatchMapRenderImagesRuntime } from '../../render-images-runtime';
import { createPatchMapRenderTextRuntime } from '../../render-text-runtime';
import type { PatchMapExecutableRoute } from '../case-routing';
import type {
  PatchMapExecutableRuntimeDescriptor,
} from '../contracts';
import {
  createPatchMapExecutableDescriptor as createDescriptor,
  patchMapExecutableInvariant as invariant,
  requirePatchMapFold as requireFold,
  requirePatchMapHandlerFactory as requireFactory,
} from '../descriptor';
import {
  PATCH_MAP_FOLD_MODULES,
  PATCH_MAP_HANDLER_MODULES,
} from '../script-modules';
import {
  createPatchMapProductRuntimeDescriptor,
} from './runtime-descriptor';

const RENDER_FOUNDATION_DESCRIPTOR = createDescriptor({
  key: 'render-foundation',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    PATCH_MAP_HANDLER_MODULES.renderFoundation.createRenderFoundationHandlerEntries,
    'render-foundation handlers',
  )(),
  fold: requireFold(
    PATCH_MAP_FOLD_MODULES.renderFoundation.foldRenderFoundationExecution,
    'render-foundation fold',
  ),
});

const RENDER_BOUNDS_DESCRIPTOR = createDescriptor({
  key: 'render-bounds',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    PATCH_MAP_HANDLER_MODULES.renderBounds.createRenderBoundsHandlerEntries,
    'render-bounds handlers',
  )(),
  fold: requireFold(
    PATCH_MAP_FOLD_MODULES.renderBounds.foldRenderBoundsExecution,
    'render-bounds fold',
  ),
});

const RENDER_ORIENTATION_DESCRIPTOR = createDescriptor({
  key: 'render-orientation',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    PATCH_MAP_HANDLER_MODULES.renderOrientation.createRenderOrientationHandlerEntries,
    'render-orientation handlers',
  )(),
  fold: requireFold(
    PATCH_MAP_FOLD_MODULES.renderOrientation.foldRenderOrientationExecution,
    'render-orientation fold',
  ),
});

const RENDER_RELATIONS_DESCRIPTOR = createDescriptor({
  key: 'render-relations',
  needsSupplementalWebGLLease: false,
  createEntries: () => requireFactory(
    PATCH_MAP_HANDLER_MODULES.renderRelations.createRenderRelationsHandlerEntries,
    'render-relations handlers',
  )(),
  fold: requireFold(
    PATCH_MAP_FOLD_MODULES.renderRelations.foldRenderRelationsExecution,
    'render-relations fold',
  ),
});

const RENDER_IMAGES_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'render-images',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.renderImages.createRenderImageHandlerEntries,
  handlerLabel: 'render-images handlers',
  fold: PATCH_MAP_FOLD_MODULES.renderImages.foldRenderImageExecution,
  foldLabel: 'render-images fold',
  createRuntime: () => createPatchMapRenderImagesRuntime(),
  engineOptions: (runtime) => Object.freeze({
    assetRuntime: runtime.assetRuntime,
    assetPolicy: runtime.assetPolicy,
  }),
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const RENDER_COMPONENT_ASSETS_DESCRIPTOR =
  createPatchMapProductRuntimeDescriptor({
    key: 'render-component-assets',
    needsSupplementalWebGLLease: false,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.renderComponentAssets
        .createRenderComponentAssetHandlerEntries,
    handlerLabel: 'render-component-assets handlers',
    fold:
      PATCH_MAP_FOLD_MODULES.renderComponentAssets
        .foldRenderComponentAssetExecution,
    foldLabel: 'render-component-assets fold',
    createRuntime: () => createPatchMapRenderComponentAssetsRuntime(),
    engineOptions: (runtime) => Object.freeze({
      assetRuntime: runtime.assetRuntime,
      assetPolicy: runtime.assetPolicy,
    }),
    postDestroyProductProbe: (runtime) => (
      () => runtime.postDestroyProductProbe()
    ),
  });

const RENDER_TEXT_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'render-text',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.renderText.createRenderTextHandlerEntries,
  handlerLabel: 'render-text handlers',
  fold: PATCH_MAP_FOLD_MODULES.renderText.foldRenderTextExecution,
  foldLabel: 'render-text fold',
  createRuntime(plan) {
    invariant(
      plan.id === 'REN-006' || plan.id === 'REN-011',
      'render-text case identity',
    );
    return createPatchMapRenderTextRuntime(plan.id);
  },
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const LAYOUT_ORDER_DESCRIPTOR = createPatchMapProductRuntimeDescriptor({
  key: 'layout-order',
  needsSupplementalWebGLLease: false,
  handlerFactory:
    PATCH_MAP_HANDLER_MODULES.layoutOrder.createLayoutOrderHandlerEntries,
  handlerLabel: 'layout-order handlers',
  fold: PATCH_MAP_FOLD_MODULES.layoutOrder.foldLayoutOrderExecution,
  foldLabel: 'layout-order fold',
  createRuntime(plan) {
    invariant(
      plan.id === 'LAY-002' || plan.id === 'LAY-003',
      'layout-order case identity',
    );
    return createPatchMapLayoutOrderRuntime(plan.id);
  },
  postDestroyProductProbe: (runtime) => (
    () => runtime.postDestroyProductProbe()
  ),
});

const PRESENTATION_DYNAMICS_DESCRIPTOR =
  createPatchMapProductRuntimeDescriptor({
    key: 'presentation-dynamics',
    needsSupplementalWebGLLease: false,
    handlerFactory:
      PATCH_MAP_HANDLER_MODULES.presentationDynamics
        .createPresentationDynamicsHandlerEntries,
    handlerLabel: 'presentation-dynamics handlers',
    fold:
      PATCH_MAP_FOLD_MODULES.presentationDynamics
        .foldPresentationDynamicsExecution,
    foldLabel: 'presentation-dynamics fold',
    createRuntime(plan) {
      invariant(
        plan.id === 'UPD-005'
          || plan.id === 'REN-009'
          || plan.id === 'ANI-001'
          || plan.id === 'ANI-002',
        'presentation-dynamics case identity',
      );
      return createPatchMapPresentationDynamicsRuntime(plan.id);
    },
    postDestroyProductProbe: (runtime) => (
      () => runtime.postDestroyProductProbe()
    ),
  });

export const PATCH_MAP_RENDERING_DESCRIPTORS = Object.freeze({
  'render-foundation': RENDER_FOUNDATION_DESCRIPTOR,
  'render-bounds': RENDER_BOUNDS_DESCRIPTOR,
  'render-orientation': RENDER_ORIENTATION_DESCRIPTOR,
  'render-relations': RENDER_RELATIONS_DESCRIPTOR,
  'render-images': RENDER_IMAGES_DESCRIPTOR,
  'render-component-assets': RENDER_COMPONENT_ASSETS_DESCRIPTOR,
  'render-text': RENDER_TEXT_DESCRIPTOR,
  'layout-order': LAYOUT_ORDER_DESCRIPTOR,
  'presentation-dynamics': PRESENTATION_DYNAMICS_DESCRIPTOR,
}) satisfies Readonly<
  Partial<Record<PatchMapExecutableRoute, PatchMapExecutableRuntimeDescriptor>>
>;
