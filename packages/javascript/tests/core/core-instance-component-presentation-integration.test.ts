import { afterEach, describe, expect, it } from 'vitest';

import { RenderAlign, RenderKind } from '../../src/dense/renderer-types';
import type { PatchMapRuntime } from '../../src/core';
import { PixiEngineSurface } from '../../src/composition/pixi-engine-surface';
import { createPublicApiEngine } from '../support/public-api-engine';
import {
  createTestCore,
  gridPresentationScene,
} from './support/presentation-test-support';

describe('PatchMap instance component presentation integration', () => {
  const allocated: PatchMapRuntime[] = [];

  afterEach(async () => {
    await Promise.all(allocated.splice(0).map((core) => core.destroy()));
  });

  it('publishes bar tint and hidden icon presentation atomically without semantic changes', async () => {
    const { core, renderer } = createTestCore(allocated);
    const engine = createPublicApiEngine({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({
      instanceId: 'grid-instance-presentation-overlay',
      width: 800,
      height: 600,
    });
    const input = gridPresentationScene();
    engine.loadDataset(input);
    engine.publishFrame(0);
    const exported = engine.exportDataset();
    const history = engine.historyState();
    const semanticHash = engine.snapshot().semanticHash;

    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        height: [48],
        tint: ['#2563eb'],
        source: [{ type: 'rect', fill: '#ffffff', radius: 8 }],
        show: [true],
      },
      icon: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'status' }],
        show: [true],
        source: ['ess'],
        tint: ['#ef4444'],
      },
      animate: false,
    })).toMatchObject({
      status: 'committed',
      changed: true,
      missingTargets: [],
      overlayCount: 2,
    });
    await core.settleSceneImages();
    expect(core.sceneImageProbe()).toMatchObject({ activeTargetCount: 1 });

    const overrides = renderer.presentationOverrides.at(-1)!;
    expect(overrides.get('grid-presentation.0.0::bar:level')).toMatchObject({
      fill: 0x2563ebff,
      trackFill: 0xffffffff,
      radius: 8,
      visible: true,
    });
    expect(overrides.get('grid-presentation.0.0::icon:status')).toEqual({
      visible: true,
      source: 'ess',
      tint: 0xef4444ff,
    });
    expect(core.projection?.imagesByEntityId?.['grid-presentation.0.0::icon:status'])
      .toMatchObject({ authoredSource: 'ess', bindingKey: 'alias:ess' });
    expect(engine.exportDataset()).toBe(exported);
    expect(engine.historyState()).toEqual(history);
    expect(engine.snapshot().semanticHash).toBe(semanticHash);

    const barOverrideBeforeRepeatedColumns = overrides.get(
      'grid-presentation.0.0::bar:level',
    );
    const iconOverrideBeforeRepeatedColumns = overrides.get(
      'grid-presentation.0.0::icon:status',
    );
    const imageBeforeRepeatedColumns = core.projection?.imagesByEntityId?.[
      'grid-presentation.0.0::icon:status'
    ];
    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        height: [50],
        tint: ['#2563eb'],
        source: [{ type: 'rect', fill: '#ffffff', radius: 8 }],
        show: [true],
      },
      icon: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'status' }],
        show: [true],
        source: ['ess'],
        tint: ['#ef4444'],
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true, overlayCount: 2 });
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::bar:level',
    )).toBe(barOverrideBeforeRepeatedColumns);
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::icon:status',
    )).toBe(iconOverrideBeforeRepeatedColumns);
    expect(core.projection?.imagesByEntityId?.[
      'grid-presentation.0.0::icon:status'
    ]).toBe(imageBeforeRepeatedColumns);

    const overridesBeforeHeightOnly = renderer.presentationOverrides.at(-1);
    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        height: new Float64Array([52]),
      },
      animate: false,
    })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedTargets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
      overlayCount: 2,
    });
    expect(core.projection?.byEntityId['grid-presentation.0.0::bar:level']?.localBounds[3])
      .toBe(52);
    expect(renderer.presentationOverrides.at(-1)).toBe(overridesBeforeHeightOnly);
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::bar:level',
    )).toMatchObject({ fill: 0x2563ebff });
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::icon:status',
    )).toEqual({ visible: true, source: 'ess', tint: 0xef4444ff });
    expect(engine.exportDataset()).toBe(exported);
    expect(engine.historyState()).toEqual(history);
    expect(engine.snapshot().semanticHash).toBe(semanticHash);

    expect(engine.transact({
      strict: true,
      operations: [{
        op: 'merge',
        target: { kind: 'component', ownerId: 'grid-presentation', id: 'level' },
        changes: [{ path: ['tint'], value: '#22c55e' }],
      }],
    })).toMatchObject({ status: 'committed', changed: true });
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::bar:level',
    )).toMatchObject({ fill: 0x2563ebff });
    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        tint: [null],
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true });
    expect(renderer.presentationOverrides.at(-1)?.get(
      'grid-presentation.0.0::bar:level',
    )).toMatchObject({ fill: 0x22c55eff });

    const projectionBeforeRejection = core.projection;
    const overridesBeforeRejection = renderer.presentationOverrides.at(-1);
    expect(engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        tint: ['#22c55e'],
      },
      icon: {
        targets: [{ id: 'missing.0.0', componentId: 'status' }],
        show: [true],
      },
      animate: false,
    })).toMatchObject({ status: 'rejected', changed: false });
    expect(core.projection).toBe(projectionBeforeRejection);
    expect(renderer.presentationOverrides.at(-1)).toBe(overridesBeforeRejection);

    let tintAccessorReads = 0;
    const throwingTint = Object.defineProperty({ length: 1 }, '0', {
      get() {
        tintAccessorReads += 1;
        throw new Error('tint column accessor failed');
      },
    });
    expect(() => engine.updateInstanceBarHeights({
      bar: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'level' }],
        tint: throwingTint,
      },
      animate: false,
    })).toThrow('instance bar tint[0] must be a present data property');
    expect(tintAccessorReads).toBe(0);
    expect(core.projection).toBe(projectionBeforeRejection);
    expect(renderer.presentationOverrides.at(-1)).toBe(overridesBeforeRejection);

    let styleAccessorReads = 0;
    const accessorStyle = Object.defineProperty({}, 'fontSize', {
      enumerable: true,
      get() {
        styleAccessorReads += 1;
        return 18;
      },
    });
    expect(() => engine.updateInstanceBarHeights({
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        style: [accessorStyle],
      },
      animate: false,
    })).toThrow('record fields must be own enumerable data properties');
    expect(styleAccessorReads).toBe(0);
    expect(core.projection).toBe(projectionBeforeRejection);
    expect(renderer.presentationOverrides.at(-1)).toBe(overridesBeforeRejection);

    engine.loadDataset(gridPresentationScene());
    expect(renderer.presentationOverrides.at(-1)?.size).toBe(0);
    expect(engine.updateInstanceBarHeights({
      icon: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'status' }],
        show: [null],
        source: [null],
        tint: [null],
      },
      animate: false,
    })).toMatchObject({ status: 'unchanged', changed: false, overlayCount: 0 });

    await engine.destroy();
  });

  it('projects concrete background and text fields, restores current authored values, and stays atomic', async () => {
    const { core, renderer } = createTestCore(allocated);
    const engine = createPublicApiEngine({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({
      instanceId: 'grid-instance-background-text-overlay',
      width: 800,
      height: 600,
    });
    const input = gridPresentationScene();
    engine.loadDataset(input);
    engine.publishFrame(0);
    const exported = engine.exportDataset();
    const history = engine.historyState();
    const semanticHash = engine.snapshot().semanticHash;
    const backgroundId = 'grid-presentation.0.0::background:surface';
    const textId = 'grid-presentation.0.0::text:label';
    const authoredSiblingTextId = 'grid-presentation.0.1::text:label';
    const callerBackgroundSource = {
      type: 'rect',
      fill: '#1d4ed8',
      borderWidth: 3,
      borderColor: '#f8fafc',
      radius: [3, 4, 5, 6],
    };
    const callerBackgroundAttrs = { x: 3, alpha: 0.75 };
    const callerTextAttrs = { y: 2, alpha: 0.9 };
    const callerTextStyle = {
      fontSize: 18,
      fontWeight: 700,
      align: 'right',
      lineHeight: 20,
    };

    expect(engine.updateInstanceBarHeights({
      background: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'surface' }],
        changes: {
          source: [callerBackgroundSource],
          tint: ['#ffffff'],
          show: [true],
          attrs: [callerBackgroundAttrs],
        },
      },
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        changes: {
          show: [true],
          margin: [4],
          placement: ['right-bottom'],
          tint: ['#fef08a'],
          split: [0],
          attrs: [callerTextAttrs],
        },
        text: ['83\n%'],
        style: [callerTextStyle],
      },
      animate: false,
    })).toMatchObject({
      status: 'committed',
      changed: true,
      appliedTargets: [
        { id: 'grid-presentation.0.0', componentId: 'surface' },
        { id: 'grid-presentation.0.0', componentId: 'label' },
      ],
      missingTargets: [],
      overlayCount: 2,
    });

    expect(core.projection?.backgroundsByEntityId?.[backgroundId]).toMatchObject({
      sourceKind: 'rect',
      fill: 0x1d4ed8ff,
      borderWidth: 3,
      borderColor: 0xf8fafcff,
      radius: [3, 4, 5, 6],
    });
    expect(core.projection?.textsByEntityId?.[textId]).toMatchObject({
      source: '83\n%',
      visibleText: '83\n%',
      placement: 'right-bottom',
      margin: { top: 4, right: 4, bottom: 4, left: 4 },
      color: 0xfef08aff,
      fontSizePx: 18,
      lineHeightPx: 20,
    });
    expect(renderer.presentationOverrides.at(-1)?.get(backgroundId)).toMatchObject({
      kind: RenderKind.Rect,
      visible: true,
      opacity: 0.75,
      strokeWidth: 3,
    });
    expect(renderer.presentationOverrides.at(-1)?.get(textId)).toMatchObject({
      kind: RenderKind.Text,
      visible: true,
      opacity: 0.9,
      align: RenderAlign.Right,
    });
    expect(core.projection?.byEntityId[backgroundId]?.affine[4]).toBe(3);
    expect(core.projection?.byEntityId[textId]?.affine[5]).toBeGreaterThan(2);

    callerBackgroundSource.fill = '#000000';
    callerBackgroundSource.radius[0] = 40;
    callerBackgroundAttrs.x = 30;
    callerTextAttrs.alpha = 0.1;
    callerTextStyle.fontSize = 40;
    expect(engine.updateInstanceBarHeights({
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        changes: { show: [true] },
      },
      animate: false,
    })).toMatchObject({ status: 'unchanged', changed: false, overlayCount: 2 });
    expect(core.projection?.backgroundsByEntityId?.[backgroundId]).toMatchObject({
      fill: 0x1d4ed8ff,
      radius: [3, 4, 5, 6],
    });
    expect(core.projection?.textsByEntityId?.[textId]).toMatchObject({ fontSizePx: 18 });
    expect(core.projection?.byEntityId[backgroundId]?.affine[4]).toBe(3);
    expect(renderer.presentationOverrides.at(-1)?.get(textId)).toMatchObject({ opacity: 0.9 });
    expect(engine.exportDataset()).toBe(exported);
    expect(engine.historyState()).toEqual(history);
    expect(engine.snapshot().semanticHash).toBe(semanticHash);

    const projectionBeforeVisibilityOnly = core.projection;
    const textProjectionBeforeVisibilityOnly = core.projection?.textsByEntityId?.[textId];
    expect(engine.updateInstanceBarHeights({
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        changes: { show: [false] },
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true, overlayCount: 2 });
    expect(core.projection).toBe(projectionBeforeVisibilityOnly);
    expect(core.projection?.textsByEntityId?.[textId]).toBe(textProjectionBeforeVisibilityOnly);
    expect(renderer.presentationOverrides.at(-1)?.get(textId)).toMatchObject({ visible: false });
    expect(engine.updateInstanceBarHeights({
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        changes: { show: [true] },
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true, overlayCount: 2 });
    expect(core.projection).toBe(projectionBeforeVisibilityOnly);
    expect(renderer.presentationOverrides.at(-1)?.get(textId)).toMatchObject({ visible: true });

    expect(engine.updateInstanceBarHeights({
      background: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'surface' }],
        changes: { source: [{ type: 'rect', fill: '#7f1d1d', radius: 9 }] },
      },
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        text: ['91%'],
        style: [{ fontSize: 20, fontWeight: 700, align: 'left' }],
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true, overlayCount: 2 });
    expect(core.projection?.backgroundsByEntityId?.[backgroundId]).toMatchObject({
      fill: 0x7f1d1dff,
      radius: [9, 9, 9, 9],
    });
    expect(core.projection?.textsByEntityId?.[textId]).toMatchObject({
      source: '91%',
      fontSizePx: 20,
    });
    expect(engine.updateInstanceBarHeights({
      background: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'surface' }],
        changes: { source: ['ess'] },
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true, overlayCount: 2 });
    expect(core.projection?.backgroundsByEntityId?.[backgroundId]).toMatchObject({
      sourceKind: 'asset',
    });
    expect(core.projection?.imagesByEntityId?.[backgroundId]).toMatchObject({
      authoredSource: 'ess',
      bindingKey: 'alias:ess',
    });
    expect(renderer.presentationOverrides.at(-1)?.get(backgroundId)).toMatchObject({
      kind: RenderKind.Image,
      source: 'ess',
    });

    const projectionBeforeInvalid = core.projection;
    const overridesBeforeInvalid = renderer.presentationOverrides.at(-1);
    expect(() => engine.updateInstanceBarHeights({
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        style: [{ fontSize: -1 }],
      },
      animate: false,
    })).toThrow('INVALID_VALUE');
    expect(core.projection).toBe(projectionBeforeInvalid);
    expect(renderer.presentationOverrides.at(-1)).toBe(overridesBeforeInvalid);

    expect(engine.updateInstanceBarHeights({
      background: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'surface' }],
        changes: { tint: ['#22c55e'] },
      },
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'missing' }],
        text: ['missing'],
      },
      animate: false,
    })).toMatchObject({
      status: 'rejected',
      changed: false,
      appliedTargets: [],
      missingTargets: [{ id: 'grid-presentation.0.0', componentId: 'missing' }],
    });
    expect(core.projection).toBe(projectionBeforeInvalid);
    expect(renderer.presentationOverrides.at(-1)).toBe(overridesBeforeInvalid);

    expect(engine.transact({
      strict: true,
      operations: [{
        op: 'merge',
        target: { kind: 'component', ownerId: 'grid-presentation', id: 'label' },
        changes: [
          { path: ['text'], value: 'authored-next' },
          { path: ['style', 'fontSize'], value: 22 },
        ],
      }],
    })).toMatchObject({ status: 'committed', changed: true });
    expect(core.projection?.textsByEntityId?.[textId]).toMatchObject({
      source: '91%',
      fontSizePx: 20,
    });
    expect(core.projection?.textsByEntityId?.[authoredSiblingTextId]).toMatchObject({
      source: 'authored-next',
      fontSizePx: 22,
    });

    expect(engine.updateInstanceBarHeights({
      background: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'surface' }],
        changes: {
          source: [null],
          tint: [null],
          show: [null],
          attrs: [null],
        },
      },
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        changes: {
          show: [null],
          margin: [null],
          placement: [null],
          tint: [null],
          split: [null],
          attrs: [null],
        },
        text: [null],
        style: [null],
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true, overlayCount: 0 });
    expect(core.projection?.textsByEntityId?.[textId]).toMatchObject({
      source: 'authored-next',
      fontSizePx: 22,
    });
    expect(renderer.presentationOverrides.at(-1)?.has(backgroundId)).toBe(false);
    expect(renderer.presentationOverrides.at(-1)?.has(textId)).toBe(false);

    expect(engine.updateInstanceBarHeights({
      background: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'surface' }],
        changes: { tint: ['#ef4444'] },
      },
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        text: ['replace-clears'],
      },
      animate: false,
    })).toMatchObject({ status: 'committed', overlayCount: 2 });
    engine.loadDataset(gridPresentationScene());
    expect(renderer.presentationOverrides.at(-1)?.size).toBe(0);
    expect(engine.updateInstanceBarHeights({
      text: {
        targets: [{ id: 'grid-presentation.0.0', componentId: 'label' }],
        text: ['destroy-clears'],
      },
      animate: false,
    })).toMatchObject({ status: 'committed', overlayCount: 1 });

    await engine.destroy();
    const coordinator = (core as unknown as {
      readonly instancePresentation: Readonly<{
        readonly presentations: ReadonlyMap<string, unknown>;
        readonly rendererOverrides: ReadonlyMap<string, unknown>;
      }>;
    }).instancePresentation;
    expect(coordinator.presentations.size).toBe(0);
    expect(coordinator.rendererOverrides.size).toBe(0);
  });

  it('keeps cached repeated text projections inside each grid item stacking path', async () => {
    const { core } = createTestCore(allocated);
    const engine = createPublicApiEngine({
      surfaceFactory: () => Promise.resolve(new PixiEngineSurface(core)),
    });
    await engine.initialize({
      instanceId: 'grid-instance-repeated-text-stacking',
      width: 800,
      height: 600,
    });
    engine.loadDataset(gridPresentationScene());

    expect(engine.updateInstanceBarHeights({
      text: {
        targets: [
          { id: 'grid-presentation.0.0', componentId: 'label' },
          { id: 'grid-presentation.0.1', componentId: 'label' },
        ],
        text: ['91%', '91%'],
      },
      animate: false,
    })).toMatchObject({ status: 'committed', changed: true, overlayCount: 2 });

    for (const ownerId of ['grid-presentation.0.0', 'grid-presentation.0.1']) {
      const ownerPath = core.projection?.byEntityId[ownerId]?.stackingPath;
      const textPath = core.projection?.byEntityId[`${ownerId}::text:label`]?.stackingPath;
      expect(textPath?.slice(0, -1)).toEqual(ownerPath);
    }

    await engine.destroy();
  });
});
