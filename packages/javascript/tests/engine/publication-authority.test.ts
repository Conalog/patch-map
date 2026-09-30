import { describe, expect, it } from 'vitest';

import { PatchMapPublicationAuthority } from '../../src/engine/publication-authority';

describe('PatchMapPublicationAuthority', () => {
  it('owns monotonic lifecycle and product revision stamps', () => {
    const authority = new PatchMapPublicationAuthority();
    const initial = authority.revisionStamp();

    expect(initial).toEqual({
      lifecycleGeneration: 0,
      sceneRevision: 0,
      viewRevision: 0,
      interactionRevision: 0,
    });
    expect(Object.isFrozen(initial)).toBe(true);

    authority.advanceLifecycle();
    authority.advanceScene();
    authority.advanceView();
    authority.advanceInteraction();
    expect(authority.revisionStamp()).toEqual({
      lifecycleGeneration: 1,
      sceneRevision: 1,
      viewRevision: 1,
      interactionRevision: 1,
    });

    const rebind = authority.planLifecycleRebind(2);
    expect(authority.lifecycleGeneration).toBe(1);
    authority.commitLifecycleRebind(rebind);
    expect(authority.lifecycleGeneration).toBe(2);
    expect(() => authority.planLifecycleRebind(4)).toThrow(RangeError);
  });

  it('commits the frame before draining history and overlay publication', () => {
    const authority = new PatchMapPublicationAuthority();
    authority.advanceScene();
    authority.advanceView();
    authority.advanceInteraction();
    authority.queueHistoryPublication('undo');
    const acceptance = authority.planOverlayAcceptance(7, 'overlay-7');
    if (acceptance.status !== 'accepted') throw new Error('overlay plan was superseded');
    const accepted = authority.commitOverlayAcceptance(acceptance);

    expect(authority.overlayProbe()).toMatchObject({
      latestAccepted: accepted,
      latestPublished: null,
      pendingPublicationCount: 1,
      acceptedCount: 1,
      publicationCount: 0,
    });

    const frame = authority.commitFrame();
    expect(frame).toEqual({
      frameRevision: 1,
      publishedTuple: { scene: 1, view: 1, interaction: 1 },
    });
    expect(authority.overlayProbe()).toMatchObject({
      latestPublished: null,
      pendingPublicationCount: 1,
    });

    expect(authority.publishPendingHistory()).toEqual([{
      direction: 'undo',
      sceneRevision: 1,
      frameRevision: 1,
      publication: 'published',
    }]);
    expect(authority.publishPendingOverlay()).toEqual({
      sourceRevision: 7,
      payloadHash: 'overlay-7',
      sceneRevision: 1,
      frameRevision: 1,
    });
    expect(authority.overlayProbe()).toMatchObject({
      pendingPublicationCount: 0,
      publicationCount: 1,
      latestPublished: { frameRevision: 1 },
    });
  });

  it('drops stale history visibility and superseded overlay inputs deterministically', () => {
    const authority = new PatchMapPublicationAuthority();
    authority.advanceScene();
    authority.queueHistoryPublication('redo');
    authority.advanceScene();

    authority.commitFrame();
    const empty = authority.publishPendingHistory();
    expect(empty).toEqual([]);
    expect(authority.publishPendingHistory()).toBe(empty);

    const first = authority.planOverlayAcceptance(3, 'first');
    if (first.status !== 'accepted') throw new Error('first overlay was superseded');
    authority.commitOverlayAcceptance(first);
    expect(authority.planOverlayAcceptance(3, 'duplicate')).toEqual({
      status: 'superseded',
      sourceRevision: 3,
      payloadHash: 'duplicate',
    });
    authority.resetOverlay();
    expect(authority.overlayProbe()).toEqual({
      latestAccepted: null,
      latestPublished: null,
      pendingPublicationCount: 0,
      acceptedCount: 0,
      publicationCount: 0,
    });
  });

  it('correlates one surface revision with the first represented product tuple', () => {
    const authority = new PatchMapPublicationAuthority();
    authority.advanceScene();
    expect(authority.correlateGeometryRevision(10)).toMatchObject({
      revision: 1,
      surfaceRevision: 10,
      representedRevisions: { scene: 1, view: 0, interaction: 0 },
      revisionLags: { scene: 0, view: 0, interaction: 0 },
    });

    authority.advanceScene();
    authority.advanceInteraction();
    expect(authority.correlateGeometryRevision(10)).toMatchObject({
      representedRevisions: { scene: 1, view: 0, interaction: 0 },
      revisionLags: { scene: 1, view: 0, interaction: 1 },
    });
    expect(authority.correlateGeometryRevision(11)).toMatchObject({
      representedRevisions: { scene: 2, view: 0, interaction: 1 },
      revisionLags: { scene: 0, view: 0, interaction: 0 },
    });
  });
});
