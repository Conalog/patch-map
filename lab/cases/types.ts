import type {
  DrawInput,
  FitPadding,
  MapData,
  MergeStrategy,
  UpdateChanges,
  UpdateHistory,
} from '../../src/contracts';
import type { PatchmapInitOptions } from '../../src/patchmap';

export type LabCategory =
  | 'draw'
  | 'update'
  | 'interaction'
  | 'lifecycle'
  | 'package'
  | 'sandbox'
  | 'known-limitations';

export type LabRisk = 'low' | 'medium' | 'high' | 'critical';

/**
 * `verified` means every normative assertion in the case is locally testable.
 * `partial` and `pending` must never be promoted to PASS by the lab runner.
 */
export type LabEvidenceStatus = 'verified' | 'partial' | 'pending' | 'manual';

export type LabRunStatus =
  | 'not-run'
  | 'running'
  | 'pass'
  | 'fail'
  | 'partial'
  | 'pending';

export type LabFixtureKey =
  | 'all-elements'
  | 'all-components'
  | 'defaults'
  | 'visibility'
  | 'assets'
  | 'advanced-text'
  | 'relations'
  | 'grid-cells'
  | 'update-playground'
  | 'transform-playground'
  | 'production-like'
  | 'sandbox';

export type LabSelector =
  | { mode: 'path'; path: string }
  | { mode: 'id'; id: string }
  | { mode: 'ids'; ids: string[] }
  | { mode: 'path-and-id'; path: string; id: string }
  | { mode: 'current-selection' };

export interface LabUpdateRequest {
  target?: LabSelector;
  changes?: UpdateChanges;
  mergeStrategy?: MergeStrategy;
  refresh?: boolean;
  relativeTransform?: boolean;
  rotateOrigin?: 'center';
  history?: UpdateHistory;
  validateSchema?: boolean;
  normalize?: boolean;
  emit?: boolean;
}

export type LabPointerAction =
  | 'click'
  | 'double-click'
  | 'right-click'
  | 'touch-tap'
  | 'hover'
  | 'drag'
  | 'box-select'
  | 'paint-select'
  | 'pointerupoutside'
  | 'cancel';

export type LabTransformerGesture =
  | 'resize-n'
  | 'resize-ne'
  | 'resize-e'
  | 'resize-se'
  | 'resize-s'
  | 'resize-sw'
  | 'resize-w'
  | 'resize-nw'
  | 'rotate';

export type LabAction =
  | { kind: 'reset'; options?: PatchmapInitOptions }
  | { kind: 'draw'; fixture: LabFixtureKey; expectError?: string }
  | { kind: 'draw-inline'; data: DrawInput; expectError?: string }
  | { kind: 'draw-invalid'; inputKey: string; expectErrorIncludes?: string }
  | { kind: 'update'; request: LabUpdateRequest }
  | { kind: 'wait-frame'; frames?: number }
  | { kind: 'inspect'; target?: LabSelector; snapshot?: string }
  | {
      kind: 'view';
      method: 'fit' | 'focus';
      ids?: string | string[] | null;
      padding?: FitPadding;
    }
  | {
      kind: 'viewport';
      method: 'pan' | 'zoom';
      x?: number;
      y?: number;
      scale?: number;
    }
  | { kind: 'rotation'; method: 'set' | 'rotateBy' | 'reset'; value?: number }
  | {
      kind: 'flip';
      method: 'set' | 'toggleX' | 'toggleY' | 'reset';
      x?: boolean;
      y?: boolean;
    }
  | {
      kind: 'selection';
      method: 'configure' | 'set' | 'clear';
      target?: LabSelector;
      options?: Record<string, unknown>;
    }
  | {
      kind: 'pointer';
      action: LabPointerAction;
      target?: LabSelector;
      from?: { x: number; y: number };
      to?: { x: number; y: number };
      modifiers?: Array<'shift' | 'meta' | 'control' | 'alt'>;
      detail?: number;
    }
  | {
      kind: 'transformer';
      method: 'create' | 'replace' | 'select' | 'clear' | 'destroy';
      target?: LabSelector;
      options?: Record<string, unknown>;
    }
  | {
      kind: 'transformer-gesture';
      gesture: LabTransformerGesture;
      target?: LabSelector;
      delta?: { x: number; y: number };
      degrees?: number;
      cancelWith?: 'pointerupoutside' | 'pointercancel';
      shiftKey?: boolean;
    }
  | {
      kind: 'canvas-event';
      method: 'add' | 'get' | 'getAll' | 'on' | 'off' | 'remove' | 'removeAll';
      id?: string;
      path?: string;
      actions?: string;
    }
  | { kind: 'history'; method: 'undo' | 'redo' | 'clear' | 'inspect' }
  | {
      kind: 'lifecycle';
      method: 'init' | 'destroy' | 're-init' | 'resize' | 'theme-reset';
      width?: number;
      height?: number;
      options?: PatchmapInitOptions;
    }
  | { kind: 'animation'; method: 'pause' | 'resume'; durationMs?: number }
  | { kind: 'package-import'; format: 'esm-browser' }
  | { kind: 'sandbox-draw' }
  | { kind: 'sandbox-update' }
  | {
      kind: 'manual';
      instruction: string;
      completion: 'observe' | 'headed-windows-required' | 'oracle-required';
    };

export type LabCheckOperator =
  | 'equals'
  | 'not-equals'
  | 'includes'
  | 'matches'
  | 'exists'
  | 'not-exists'
  | 'same-reference'
  | 'different-reference'
  | 'unchanged'
  | 'greater-than'
  | 'less-than'
  | 'at-least';

export interface LabInvariant {
  id: string;
  label: string;
  /** Dot/bracket path in the lab-owned public snapshot. */
  path: string;
  operator: LabCheckOperator;
  expected?: unknown;
  normative: boolean;
  source: 'public-contract' | 'approved-v3' | 'approved-v4' | 'manual-observation';
  note?: string;
}

export interface LabStep {
  id: string;
  title: string;
  action: LabAction;
  expectations: LabInvariant[];
  evidenceStatus?: LabEvidenceStatus;
  description?: string;
}

export interface LabCase {
  id: string;
  title: string;
  category: LabCategory;
  risk: LabRisk;
  evidenceStatus: LabEvidenceStatus;
  description: string;
  tags: string[];
  fixture?: LabFixtureKey;
  oracleQuestions?: Array<`Q${number}`>;
  steps: LabStep[];
}

export interface LabFixture {
  key: Exclude<LabFixtureKey, 'production-like' | 'sandbox'>;
  title: string;
  data: MapData;
}

export const isConclusiveCase = (testCase: LabCase): boolean =>
  testCase.evidenceStatus === 'verified' &&
  testCase.steps.every(
    (step) =>
      step.evidenceStatus !== 'partial' &&
      step.evidenceStatus !== 'pending' &&
      step.expectations.every((expectation) => expectation.normative),
  );
