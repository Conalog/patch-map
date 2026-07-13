import { lifecycleFixtures } from './cases/lif.mjs';
import { drawFixtures } from './cases/draw.mjs';
import { updateFixtures } from './cases/update.mjs';

const fixtures = [...lifecycleFixtures, ...drawFixtures, ...updateFixtures];

export const fixtureIds = fixtures.map(({ id }) => id);

export const getFixture = (id) => fixtures.find((fixture) => fixture.id === id);
