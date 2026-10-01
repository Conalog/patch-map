import type { EntityInput } from '../../dense/contracts';
import type {
  ComponentIdentity,
  ElementIdentity,
  EntitySourceIdentity,
  ExpandedItemIdentity,
  PatchMapProjectionIndex,
} from '../contracts';

export type JsonRecord = Readonly<Record<string, unknown>>;

export interface RootFragment {
  readonly element: ElementIdentity;
  readonly elements: readonly ElementIdentity[];
  readonly components: readonly ComponentIdentity[];
  readonly expandedItems: readonly ExpandedItemIdentity[];
  readonly entities: readonly EntityInput[];
  readonly entitySources: Readonly<Record<string, EntitySourceIdentity>>;
  readonly projection: PatchMapProjectionIndex;
}
