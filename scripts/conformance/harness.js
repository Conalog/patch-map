import * as patchMapExports from '/src/index.ts';
import { fixtureIds, getFixture } from '/fixtures/index.mjs';

const isScreenshotEnvelope = (value) =>
  value !== null &&
  typeof value === 'object' &&
  Object.prototype.hasOwnProperty.call(value, 'observed');

const runFixture = async (id) => {
  const fixture = getFixture(id);
  if (!fixture) {
    throw new Error(`Unknown conformance fixture: ${id}`);
  }

  let result;
  try {
    result = await fixture.run(patchMapExports);
    return isScreenshotEnvelope(result) ? result.observed : result;
  } finally {
    if (typeof result?.cleanup === 'function') {
      await result.cleanup();
    }
  }
};

window.__PATCHMAP_CONFORMANCE__ = Object.freeze({
  fixtureIds: Object.freeze([...fixtureIds]),
  runFixture,
});
