import { describe, expect, it } from 'vitest';

import { PatchMapPointerInteractionCoordinator } from
  '../../src/engine/pointer-interaction-coordinator';
import type { PatchMapPointerInteractionPort } from
  '../../src/engine/pointer-interaction-coordinator';
import type { PatchMapEngineSurface } from '../../src/engine/contracts';
import { PatchMapPointerGestureAuthority } from '../../src/pointer-gesture';

const SURFACE = {
  hitTestScreen: () => null,
} as unknown as PatchMapEngineSurface;

function createCoordinator(): PatchMapPointerInteractionCoordinator {
  const port = {
    requireSurface: () => SURFACE,
    liveSurface: () => SURFACE,
    hasMaterialized: () => false,
    logicalSelectionIndex: () => {
      throw new Error('logical selection index should not be read');
    },
    selectionIds: () => [],
    transformerOwnsPointer: () => false,
    routeTransformerInput: () => undefined,
    completeTransformerEdit: () => undefined,
    cancelTransformerEdit: () => undefined,
    selectBox: () => {
      throw new Error('box selection should not run');
    },
    applySelection: () => {
      throw new Error('selection should not run');
    },
    viewRevision: () => 0,
    interactionRevision: () => 0,
    advanceInteraction: () => undefined,
    interactionMode: () => 'select',
    dispatchHostPointerEvent: () => undefined,
    clearHostTooltip: () => undefined,
    emitPointerEvent: () => undefined,
    emitPointerHover: () => undefined,
    emitPointerTooltip: () => undefined,
    emitHostCallbackFailure: () => undefined,
    notReadyError: (operation: string) => new Error(`not ready: ${operation}`),
  } as unknown as PatchMapPointerInteractionPort;
  return new PatchMapPointerInteractionCoordinator(port);
}

function createForeignAuthority(): PatchMapPointerGestureAuthority {
  return new PatchMapPointerGestureAuthority({
    hitTest: () => null,
    clickTargetIdentity: () => null,
    hoverDuringPress: false,
  });
}

describe('PatchMap pointer interaction coordinator authority lifecycle', () => {
  it('owns one candidate and permits only exact adopt or discard transitions', () => {
    const coordinator = createCoordinator();
    const candidate = coordinator.createCandidateAuthority(SURFACE);
    const foreign = createForeignAuthority();

    expect(candidate.probe().destroyed).toBe(false);
    expect(() => coordinator.createCandidateAuthority(SURFACE))
      .toThrow('pointer gesture authority ownership is already active');
    expect(() => coordinator.adoptCandidateAuthority(foreign))
      .toThrow('pointer gesture authority candidate cannot be adopted');
    expect(() => coordinator.discardCandidateAuthority(foreign))
      .toThrow('pointer gesture authority candidate cannot be discarded');

    coordinator.adoptCandidateAuthority(candidate);
    expect(coordinator.probe().destroyed).toBe(false);
    expect(() => coordinator.discardCandidateAuthority(candidate))
      .toThrow('pointer gesture authority candidate cannot be discarded');
    coordinator.destroy();
    coordinator.destroy();
    expect(candidate.probe().destroyed).toBe(true);

    foreign.destroy();
  });

  it('destroys pending and discarded candidates and permits a clean retry', () => {
    const pendingOwner = createCoordinator();
    const pending = pendingOwner.createCandidateAuthority(SURFACE);
    pendingOwner.destroy();
    pendingOwner.destroy();
    expect(pending.probe().destroyed).toBe(true);

    const retryOwner = createCoordinator();
    const discarded = retryOwner.createCandidateAuthority(SURFACE);
    retryOwner.discardCandidateAuthority(discarded);
    expect(discarded.probe().destroyed).toBe(true);

    const retry = retryOwner.createCandidateAuthority(SURFACE);
    retryOwner.adoptCandidateAuthority(retry);
    retryOwner.destroy();
    expect(retry.probe().destroyed).toBe(true);
  });
});
