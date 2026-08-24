import type { PatchMapEngineOptions } from '../../../../src/patch-map';
import type {
  PatchMapExecutableCasePlan,
} from '../executable-cases';

export type PatchMapExecutableRuntimeKey =
  | 'foundation'
  | 'data-foundation'
  | 'data-closure'
  | 'lifecycle-resize'
  | 'lifecycle-destroy'
  | 'lifecycle-interruption'
  | 'determinism-lifecycle'
  | 'render-foundation'
  | 'render-bounds'
  | 'render-orientation'
  | 'render-relations'
  | 'render-images'
  | 'render-component-assets'
  | 'render-text'
  | 'layout-order'
  | 'presentation-dynamics'
  | 'update-transactions'
  | 'viewport'
  | 'query-selection'
  | 'pointer-selection'
  | 'interaction-editor'
  | 'authoring'
  | 'editor-workflow'
  | 'history'
  | 'replacement-recovery'
  | 'export-extraction'
  | 'pixijs-integration'
  | 'package-integration'
  | 'performance'
  | 'asset-ingestion'
  | 'security-operations'
  | 'accessibility'
  | 'migration'
  | 'assets';

export type PatchMapExecutableHandler = (
  context: Readonly<Record<string, unknown>>,
  action: Readonly<Record<string, unknown>>,
) => unknown;

export type PatchMapExecutableHandlerEntry = readonly [
  string,
  PatchMapExecutableHandler,
];

export type PatchMapHandlerFactory = (
  this: void,
  ...products: readonly Readonly<Record<string, unknown>>[]
) => readonly PatchMapExecutableHandlerEntry[];

export type PatchMapFold = (
  this: void,
  options: Readonly<Record<string, unknown>>,
) => PatchMapFoldedExecution;

/**
 * The committed JavaScript modules are checked at the Lab boundary instead of
 * being trusted as product types. Their named exports remain deliberately
 * opaque so approved evidence can never become a product/runtime dependency.
 */
export interface PatchMapHandlerFactoryModule {
  readonly [exportName: string]: PatchMapHandlerFactory | undefined;
}

export interface PatchMapFoldModule {
  readonly [exportName: string]: PatchMapFold | undefined;
}

export interface PatchMapFoldedExecution {
  readonly actual: Readonly<Record<string, unknown>>;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly captures: Readonly<Record<string, unknown>>;
}

export interface PatchMapExecutableRun {
  readonly handlerEntries: readonly PatchMapExecutableHandlerEntry[];
  readonly engineOptions: Readonly<PatchMapEngineOptions>;
  readonly actionTimeoutMs?: number;
  readonly postDestroyProductProbe?: () =>
    | Readonly<Record<string, unknown>>
    | Promise<Readonly<Record<string, unknown>>>;
}

export interface PatchMapExecutableRuntimeDescriptor {
  readonly key: PatchMapExecutableRuntimeKey;
  readonly needsSupplementalWebGLLease: boolean;
  createRun(plan: PatchMapExecutableCasePlan): Readonly<PatchMapExecutableRun>;
  handlerEntries(
    plan: PatchMapExecutableCasePlan,
  ): readonly PatchMapExecutableHandlerEntry[];
  fold(options: Readonly<{
    casePlan: PatchMapExecutableCasePlan;
    execution: Readonly<Record<string, unknown>>;
    provenance: Readonly<Record<string, unknown>>;
    environment: Readonly<Record<string, unknown>>;
  }>): PatchMapFoldedExecution;
}

export type PatchMapRuntimeFoldInput =
  Parameters<PatchMapExecutableRuntimeDescriptor['fold']>[0];
