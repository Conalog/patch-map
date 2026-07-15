import { describe, expect, it } from 'vitest';

import * as coreV1 from '../../src/core-v1/index';

const EXPECTED_RUNTIME_EXPORTS = [
  'Canvas2DRenderer',
  'CoreDestroyedError',
  'CoreError',
  'CoreScene',
  'CoreTargetError',
  'CoreValidationError',
  'NoopRenderer',
  'createCoreScene',
] as const;

describe('Core v1 package surface', () => {
  it('publishes only the intentional runtime entry points', () => {
    expect(Object.keys(coreV1).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());

    for (const name of EXPECTED_RUNTIME_EXPORTS) {
      expect(typeof coreV1[name], name).toBe('function');
    }
  });

  it('creates the public CoreScene and keeps public errors distinguishable', () => {
    const scene = coreV1.createCoreScene();

    expect(scene).toBeInstanceOf(coreV1.CoreScene);
    expect(new coreV1.CoreDestroyedError('destroyed')).toBeInstanceOf(coreV1.CoreError);
    expect(new coreV1.CoreTargetError('missing')).toBeInstanceOf(coreV1.CoreError);
    expect(new coreV1.CoreValidationError('scene', 'invalid')).toBeInstanceOf(coreV1.CoreError);
    expect(scene.destroy()).toBe(true);
  });
});
