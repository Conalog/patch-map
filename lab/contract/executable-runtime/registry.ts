import type {
  PatchMapExecutableCaseId,
} from '../executable-cases';
import {
  routePatchMapExecutableCase,
  type PatchMapExecutableRoute,
} from './case-routing';
import type {
  PatchMapExecutableRuntimeDescriptor,
} from './contracts';
import {
  PATCH_MAP_ASSET_OPERATION_DESCRIPTORS,
} from './registry/assets-operations';
import {
  PATCH_MAP_FOUNDATION_LIFECYCLE_DESCRIPTORS,
  PATCH_MAP_REPLACEMENT_RECOVERY_DESCRIPTOR,
} from './registry/foundation-lifecycle';
import {
  PATCH_MAP_INTEGRATION_DESCRIPTORS,
} from './registry/integrations';
import {
  PATCH_MAP_INTERACTION_DESCRIPTORS,
} from './registry/interaction';
import {
  PATCH_MAP_RENDERING_DESCRIPTORS,
} from './registry/rendering';

const PATCH_MAP_EXECUTABLE_DESCRIPTORS = Object.freeze({
  ...PATCH_MAP_FOUNDATION_LIFECYCLE_DESCRIPTORS,
  ...PATCH_MAP_RENDERING_DESCRIPTORS,
  ...PATCH_MAP_INTERACTION_DESCRIPTORS,
  'replacement-recovery': PATCH_MAP_REPLACEMENT_RECOVERY_DESCRIPTOR,
  ...PATCH_MAP_INTEGRATION_DESCRIPTORS,
  ...PATCH_MAP_ASSET_OPERATION_DESCRIPTORS,
}) satisfies Readonly<
  Record<PatchMapExecutableRoute, PatchMapExecutableRuntimeDescriptor>
>;

export function resolvePatchMapExecutableRuntime(
  caseId: PatchMapExecutableCaseId,
): PatchMapExecutableRuntimeDescriptor {
  return PATCH_MAP_EXECUTABLE_DESCRIPTORS[routePatchMapExecutableCase(caseId)];
}
