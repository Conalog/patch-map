import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const contractRoot = 'contracts/patch-map/';
const manifestPath = `${contractRoot}evidence/decision-evidence-manifest.v1.json`;
const decisionOwnerPath = `${contractRoot}decisions.md`;

const manifest = await readJson(manifestPath);
const fixturePath = `${contractRoot}${manifest.fixtureFile.path}`;
const expectedPath = `${contractRoot}${manifest.expectedFile.path}`;
const fixtures = await readJson(fixturePath);
const expected = await readJson(expectedPath);

validateEvidenceEnvelopes(manifest, fixtures, expected);

assert(manifest.$schema === 'patch-map-decision-evidence-manifest/1', 'manifest schema');
assert(fixtures.$schema === 'patch-map-decision-fixtures/1', 'fixture schema');
assert(expected.$schema === 'patch-map-decision-normalized-expected/1', 'expected schema');
assert(fixtures.contractRevision === manifest.contractRevision, 'fixture contract revision');
assert(expected.contractRevision === manifest.contractRevision, 'expected contract revision');
assert(fixtures.observationRevision === manifest.observationRevision, 'fixture observation revision');
assert(expected.observationRevision === manifest.observationRevision, 'expected observation revision');

assert(await fileSha256(fixturePath) === manifest.fixtureFile.sha256, 'fixture file SHA-256');
assert(await fileSha256(expectedPath) === manifest.expectedFile.sha256, 'expected file SHA-256');

const decisionOwner = await readFile(`${root}${decisionOwnerPath}`, 'utf8');
const expectedDecisions = [...decisionOwner.matchAll(/^\| (OQ-\d{3}) \|/gm)]
  .map((match) => match[1]);
const decisionCount = expectedDecisions.length;
const fixtureById = uniqueById(fixtures.cases, 'fixture');
const expectedById = uniqueById(expected.cases, 'expected');
const manifestById = uniqueById(manifest.cases, 'manifest');

assert(decisionCount > 0, 'documented decision records');
assert(fixtures.cases.length === decisionCount, 'complete fixture records');
assert(expected.cases.length === decisionCount, 'complete expected records');
assert(manifest.cases.length === decisionCount, 'complete manifest records');
assertSameSet(fixtures.cases.map((record) => record.decision), expectedDecisions, 'fixture decisions');
assertSameSet(expected.cases.map((record) => record.decision), expectedDecisions, 'expected decisions');
assertSameSet(manifest.cases.map((record) => record.decision), expectedDecisions, 'manifest decisions');

let approved = 0;
let pending = 0;
for (const record of manifest.cases) {
  const fixture = fixtureById.get(record.id);
  const normalizedExpected = expectedById.get(record.id);
  const fixtureIndex = fixtures.cases.indexOf(fixture);
  const expectedIndex = expected.cases.indexOf(normalizedExpected);
  assert(fixture !== undefined, `${record.id} fixture pair`);
  assert(normalizedExpected !== undefined, `${record.id} expected pair`);
  assert(fixture.decision === record.decision, `${record.id} fixture decision`);
  assert(normalizedExpected.decision === record.decision, `${record.id} expected decision`);
  assert(canonicalSha256(fixture) === record.fixtureSha256, `${record.id} fixture digest`);
  assert(canonicalSha256(normalizedExpected) === record.expectedRecordSha256, `${record.id} expected digest`);
  assert(record.fixtureRef === `${fixtures.$schema}#/cases/${fixtureIndex}`, `${record.id} fixture ref`);
  assert(record.expectedRef === `${expected.$schema}#/cases/${expectedIndex}`, `${record.id} expected ref`);
  assert(fixtureIndex === expectedIndex, `${record.id} pair index`);
  assertSameSet(record.scenarios, fixture.scenarios, `${record.id} scenarios`);
  assertSameOrdered(record.execution.prerequisites, fixture.executionPrerequisites ?? [], `${record.id} execution prerequisites`);
  assertSameOrdered(record.blockers, fixture.requiredEvidence ?? [], `${record.id} manifest blockers`);
  assertSameOrdered(normalizedExpected.blockedBy ?? [], fixture.requiredEvidence ?? [], `${record.id} expected blockers`);
  assert(normalizedExpected.reviewState === record.contractReview.status, `${record.id} review state`);
  assert(record.decisionStatus === 'resolved', `${record.id} decision status`);
  assert(record.execution.status === 'not-run', `${record.id} execution status`);
  assert(record.execution.actualEvidenceSha256 === null, `${record.id} actual digest absent`);
  assert(record.executionReview.status === 'not-reviewed', `${record.id} execution review`);
  assert(record.readinessLevel === 'spec-ready', `${record.id} readiness`);

  if (record.contractReview.status === 'analysis-owner-contract-approved') {
    approved += 1;
    assert(fixture.fixtureState === 'canonical', `${record.id} canonical fixture state`);
    assert(fixture.requiredEvidence === undefined, `${record.id} no contract blocker in fixture`);
    assert(normalizedExpected.blockedBy === undefined, `${record.id} approved expected has no blockers`);
    assert(normalizedExpected.expected !== null, `${record.id} approved expected present`);
    assert(record.contractReview.expectedEvidenceSha256 === record.expectedRecordSha256, `${record.id} approved digest`);
    assert(record.blockers.length === 0, `${record.id} approved blockers empty`);
  } else {
    pending += 1;
    assert(record.contractReview.status === 'analysis-owner-pending-external-evidence', `${record.id} pending status`);
    assert(fixture.fixtureState.startsWith('pending-'), `${record.id} pending fixture state`);
    assert(Array.isArray(fixture.requiredEvidence) && fixture.requiredEvidence.length > 0, `${record.id} pending fixture evidence`);
    assert(record.contractReview.expectedEvidenceSha256 === null, `${record.id} pending expected digest absent`);
    assert(record.blockers.length > 0, `${record.id} pending blockers present`);
  }
}

assert(approved === decisionCount, 'all documented decisions contract-approved');
assert(pending === 0, 'no pending-external-evidence records');
assert(manifest.reviewSummary.decisionCount === decisionCount, 'review decision count');
assert(manifest.reviewSummary.contractApproved === approved, 'review approved count');
assert(manifest.reviewSummary.pendingExternalEvidence === pending, 'review pending count');

const pendingDecisions = manifest.cases
  .filter((record) => record.contractReview.status === 'analysis-owner-pending-external-evidence')
  .map((record) => record.decision);
assertSameSet(pendingDecisions, [], 'pending decision registry');

validateSemanticGuardrails(fixtureById, expectedById);
await validateExternalEvidence(fixtureById, expectedById);

console.log(`PatchMap decision evidence verified: ${approved} approved, ${pending} pending, ${manifestById.size} total`);

async function readJson(relativePath) {
  return JSON.parse(await readFile(`${root}${relativePath}`, 'utf8'));
}

async function fileSha256(relativePath) {
  return sha256(await readFile(`${root}${relativePath}`));
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(sortKeys(value)));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function uniqueById(records, label) {
  const result = new Map();
  for (const record of records) {
    assert(typeof record.id === 'string' && record.id.length > 0, `${label} record ID`);
    assert(!result.has(record.id), `${label} duplicate ID ${record.id}`);
    result.set(record.id, record);
  }
  return result;
}

function validateEvidenceEnvelopes(manifestDocument, fixtureDocument, expectedDocument) {
  assertAllowedKeys(manifestDocument, ['$schema', 'contractRevision', 'observationRevision', 'generatedAt', 'scope', 'fixtureFile', 'expectedFile', 'reviewSummary', 'statusRules', 'cases'], 'manifest document');
  assertAllowedKeys(fixtureDocument, ['$schema', 'contractRevision', 'observationRevision', 'mutationRevision', 'purpose', 'rules', 'cases'], 'fixture document');
  assertAllowedKeys(expectedDocument, ['$schema', 'contractRevision', 'observationRevision', 'matching', 'cases'], 'expected document');
  assert(Array.isArray(fixtureDocument.cases), 'fixture cases array');
  assert(Array.isArray(expectedDocument.cases), 'expected cases array');
  assert(Array.isArray(manifestDocument.cases), 'manifest cases array');

  for (const fixture of fixtureDocument.cases) {
    assertAllowedKeys(fixture, ['id', 'decision', 'scenarios', 'fixtureState', 'setup', 'actionTrace', 'requiredEvidence', 'executionPrerequisites'], `${fixture.id ?? 'fixture'} envelope`);
    assert(/^DEC-OQ-\d{3}-[A-Z0-9-]+$/.test(fixture.id), `${fixture.id} canonical ID`);
    assert(/^OQ-\d{3}$/.test(fixture.decision), `${fixture.id} decision ID`);
    assertStringArray(fixture.scenarios, `${fixture.id} scenarios`, { nonEmpty: true });
    assert(typeof fixture.fixtureState === 'string' && fixture.fixtureState.length > 0, `${fixture.id} fixture state`);
    assertPlainObject(fixture.setup, `${fixture.id} setup`);
    assert(Array.isArray(fixture.actionTrace) && fixture.actionTrace.length > 0, `${fixture.id} action trace`);
    for (const action of fixture.actionTrace) {
      assertPlainObject(action, `${fixture.id} action`);
      assert(typeof action.action === 'string' && action.action.length > 0, `${fixture.id} action discriminator`);
    }
    if (fixture.requiredEvidence !== undefined) assertStringArray(fixture.requiredEvidence, `${fixture.id} required evidence`, { nonEmpty: true });
    if (fixture.executionPrerequisites !== undefined) assertStringArray(fixture.executionPrerequisites, `${fixture.id} execution prerequisites`, { nonEmpty: true });
  }

  for (const record of expectedDocument.cases) {
    assertAllowedKeys(record, ['id', 'decision', 'reviewState', 'expected', 'blockedBy'], `${record.id ?? 'expected'} envelope`);
    assert(['analysis-owner-contract-approved', 'analysis-owner-pending-external-evidence'].includes(record.reviewState), `${record.id} review state enum`);
    assert(record.expected === null || (typeof record.expected === 'object' && !Array.isArray(record.expected)), `${record.id} normalized expected object or pending null`);
    if (record.blockedBy !== undefined) assertStringArray(record.blockedBy, `${record.id} expected blockers`, { nonEmpty: true });
  }

  for (const record of manifestDocument.cases) {
    assertAllowedKeys(record, ['id', 'decision', 'scenarios', 'fixtureRef', 'expectedRef', 'fixtureSha256', 'expectedRecordSha256', 'decisionStatus', 'contractReview', 'execution', 'executionReview', 'readinessLevel', 'blockers'], `${record.id ?? 'manifest'} envelope`);
    assertStringArray(record.blockers, `${record.id} manifest blockers`);
    assertPlainObject(record.contractReview, `${record.id} contract review`);
    assertPlainObject(record.execution, `${record.id} execution`);
    assertPlainObject(record.executionReview, `${record.id} execution review`);
  }
}

function validateSemanticGuardrails(fixtureById, expectedById) {
  for (const fixture of fixtureById.values()) {
    assert(Array.isArray(fixture.actionTrace) && fixture.actionTrace.length > 0, `${fixture.id} action trace`);
    for (const action of fixture.actionTrace) assert(typeof action.action === 'string', `${fixture.id} action discriminator`);
  }

  const clickActions = fixtureById.get('DEC-OQ-013-CLICK-COUNT').actionTrace;
  assert(clickActions.every((action) => action.count === undefined), 'OQ-013 derives click count');
  assert(clickActions.map((action) => action.sequenceOrdinal).join(',') === '1,2,3,4', 'OQ-013 click sequence');

  const emptyOrder = expectedById.get('DEC-OQ-016-EVENT-PROPAGATION').expected.emptySurface.order;
  assert(emptyOrder.join(',') === 'surface-capture,surface-target,surface-bubble', 'OQ-016 empty propagation phases');
  const eventFixture = fixtureById.get('DEC-OQ-016-EVENT-PROPAGATION');
  const eventExpected = expectedById.get('DEC-OQ-016-EVENT-PROPAGATION').expected;
  assert(eventFixture.setup.samePhaseImmediateListeners.join(',') === 'group-capture-immediate-1,group-capture-immediate-2', 'OQ-016 immediate listener registration order');
  assert(eventExpected.immediateStoppedOrder.join(',') === 'surface-capture,group-capture-immediate-1' && eventExpected.immediateSkippedSamePhaseListeners.join(',') === 'group-capture-immediate-2', 'OQ-016 immediate stop trace');

  const historyExpected = expectedById.get('DEC-OQ-012-HISTORY-CAPACITY').expected;
  assert(historyExpected.afterClear.undoDepth === 0 && historyExpected.afterClear.redoDepth === 0 && !historyExpected.afterClear.undoAvailable && !historyExpected.afterClear.redoAvailable, 'OQ-012 clear history availability');
  assert(['unavailableUndo', 'unavailableRedo', 'afterClearUnavailableCalls', 'capacityZero'].every((key) => historyExpected[key].semanticRevisionDelta === 0 && historyExpected[key].historyObserverEvents === 0), 'OQ-012 unavailable no-op semantics');

  const shortcutFixture = fixtureById.get('DEC-OQ-020-EDITABLE-SHORTCUT-SUPPRESSION');
  const shortcutExpected = expectedById.get('DEC-OQ-020-EDITABLE-SHORTCUT-SUPPRESSION').expected;
  assertSameSet(shortcutFixture.setup.accelerators.map((entry) => entry.keys), ['Ctrl+Z', 'Cmd+Z', 'Ctrl+Shift+Z', 'Cmd+Shift+Z', 'Ctrl+Y', 'Cmd+Y'], 'OQ-020 accelerator matrix');
  assert(shortcutFixture.setup.historyPreparationBySemanticAction.undo.undoDepth === 1 && shortcutFixture.setup.historyPreparationBySemanticAction.undo.redoDepth === 0, 'OQ-020 undo-ready cell');
  assert(shortcutFixture.setup.historyPreparationBySemanticAction.redo.undoDepth === 0 && shortcutFixture.setup.historyPreparationBySemanticAction.redo.redoDepth === 1 && shortcutFixture.setup.historyPreparationBySemanticAction.redo.preActions.join(',') === 'apply-state-change,undo', 'OQ-020 redo-ready cell');
  assert(Object.keys(shortcutExpected.accelerators).length === 6 && shortcutExpected.canvasCellCount === 6 && shortcutExpected.protectedCellCount === 36 && shortcutExpected.freshHistoryPerCell, 'OQ-020 shortcut target matrix');
  assert(shortcutExpected.protectedCellResult.coreHistoryActions === 0 && shortcutExpected.protectedCellResult.defaultPreventedByCore === false, 'OQ-020 protected editable suppression');

  const transformProfile = expectedById.get('DEC-OQ-018-TRANSFORM-SELECTION-LOCK-CANCEL').expected.interruptionProfile;
  const terminalProfile = expectedById.get('DEC-OQ-032-GESTURE-TERMINALS').expected.interruptionProfile;
  assert(transformProfile === terminalProfile, 'OQ-018/OQ-032 shared interruption profile');
  const transformFixture = fixtureById.get('DEC-OQ-018-TRANSFORM-SELECTION-LOCK-CANCEL');
  assertSameSet(transformFixture.setup.freshBranches, ['selection-change', 'lock-change'], 'OQ-018 fresh interruption branches');
  assert(transformFixture.actionTrace[0].branches.every((branch) => branch.prepare?.selection?.[0] === 'rect' && branch.prepare?.locked === false), 'OQ-018 branch reset/reselect');

  assert(expectedById.get('DEC-OQ-028-ACCESSIBILITY-OWNERSHIP').expected.semanticActivations === 2, 'OQ-028 independent activation sources');

  const relationHit = expectedById.get('DEC-OQ-036-RELATION-HIT-TOLERANCE').expected;
  assert(relationHit.boxPaintParity?.thin?.['3.9'] === true && relationHit.boxPaintParity?.thick?.['6.1'] === false, 'OQ-036 box/paint parity');

  const dimensionFixture = fixtureById.get('DEC-OQ-022-DIMENSION-AND-NEGATIVE-VALUES');
  const dimensionCases = dimensionFixture.setup.cases;
  const dimensionExpected = expectedById.get('DEC-OQ-022-DIMENSION-AND-NEGATIVE-VALUES').expected;
  assert(dimensionCases.every((entry) => Array.isArray(entry.path) && entry.path.length > 0), 'OQ-022 path-qualified values');
  assert(dimensionFixture.setup.baseDataset[0].padding.top === 0, 'OQ-022 structured padding path');
  assert(dimensionFixture.setup.baseDataset[0].components.find((component) => component.id === 'bar').margin.bottom === 0, 'OQ-022 structured margin path');
  assertSameSet(dimensionExpected.acceptedCaseIds, ['accept-percent', 'accept-calc', 'accept-text-css-size'], 'OQ-022 accepted current grammar');
  assertSameSet(dimensionExpected.rejected.map(({ caseId }) => caseId), ['reject-plain-numeric-string', 'reject-component-px-string', 'reject-negative-duration', 'reject-negative-border', 'reject-negative-margin', 'reject-negative-padding'], 'OQ-022 rejected invalid values');

  const relationDataset = fixtureById.get('DEC-OQ-023-RELATION-DUPLICATES').setup.dataset;
  assert(relationDataset.some((record) => record.id === 'a') && relationDataset.some((record) => record.id === 'b') && relationDataset.some((record) => record.type === 'relations'), 'OQ-023 executable relation dataset');

  const rotationFixture = fixtureById.get('DEC-OQ-030-ANGLE-ROTATION-CONFLICT');
  assert(rotationFixture.setup.valid.every((record) => record.type === 'rect' && record.size !== undefined), 'OQ-030 complete valid records');
  assert(rotationFixture.actionTrace.at(-1).path.join('.') === 'attrs.rotation', 'OQ-030 explicit merge conflict');

  const assetLeaseFixture = fixtureById.get('DEC-OQ-010-SHARED-ASSET-LEASE');
  const assetLease = expectedById.get('DEC-OQ-010-SHARED-ASSET-LEASE').expected;
  assert(/^[a-f0-9]{64}$/.test(assetLeaseFixture.setup.asset.descriptorSha256), 'OQ-010 descriptor SHA-256');
  assert(assetLease.afterPendingAcquisitions.pendingUsers === 3 && assetLease.afterResolve.leases === 3, 'OQ-010 real pending consumers');
  assert(assetLease.afterDestroyAAndB.leases === 1 && assetLease.afterDestroyC.unloadCalls === 1, 'OQ-010 retained lease and unload once');

  const initFixture = fixtureById.get('DEC-OQ-011-REQUIRED-INIT-ASSET');
  assert(new Set(initFixture.actionTrace.map((action) => action.lifecycle)).size === 3, 'OQ-011 independent lifecycle branches');

  const security = fixtureById.get('DEC-OQ-026-ASSET-SECURITY-POLICY');
  assert(security.setup.attempts.length === 10, 'OQ-026 security attempt matrix');
  const securityExpected = expectedById.get('DEC-OQ-026-ASSET-SECURITY-POLICY').expected;
  assertSameSet(securityExpected.redaction.channels, ['return', 'observer', 'telemetry', 'log', 'lab', 'evidence-artifact'], 'OQ-026 redaction channels');
  assert(securityExpected.redaction.markerMatches === 0, 'OQ-026 exact marker redaction');
  assert(securityExpected.attempts['svg-script'].sanitize === 1 && securityExpected.attempts['svg-external'].sanitize === 1, 'OQ-026 SVG sanitizer path');
  assert(securityExpected.resourceAccounting.afterDestroy.cacheEntries === 0 && securityExpected.resourceAccounting.afterDestroy.leases === 0, 'OQ-026 cache lease cleanup');

  const placeholders = expectedById.get('DEC-OQ-034-SCENE-ASSET-PLACEHOLDER').expected.placeholders;
  assert(placeholders['fallback-image'].geometry.width === 32 && placeholders.background.localBounds.width === 100 && placeholders.icon.localBounds.width === 20, 'OQ-034 placeholder branches');
  assert(['background', 'icon'].every((id) => placeholders[id].queryable && placeholders[id].pointHit && placeholders[id].boxHit && placeholders[id].sanitizedAssetIdentity.startsWith('asset-failure:')), 'OQ-034 component query/hit/identity');

  const terminalFixture = fixtureById.get('DEC-OQ-032-GESTURE-TERMINALS');
  const terminalExpected = expectedById.get('DEC-OQ-032-GESTURE-TERMINALS').expected;
  const terminalPartitions = [terminalExpected.commitOnce.terminals, terminalExpected.revertNoHistory.terminals, terminalExpected.terminateNoStaleCompletion.terminals].flat();
  assertSameSet(terminalPartitions, terminalFixture.setup.terminals, 'OQ-032 terminal partition');
  assert(Object.values(terminalExpected.cleanup).every((value) => value === 0), 'OQ-032 zero cleanup state');
}

async function validateExternalEvidence(fixtureById, expectedById) {
  for (const id of ['DEC-OQ-031-INTERNATIONAL-TEXT']) {
    const fixture = fixtureById.get(id);
    const normalized = expectedById.get(id);
    assert(fixture.setup.evidencePath === normalized.expected.evidencePath, `${id} evidence path parity`);
    assert(fixture.setup.evidenceSha256 === normalized.expected.evidenceSha256, `${id} evidence digest parity`);
    assert(await fileSha256(`${contractRoot}${fixture.setup.evidencePath}`) === fixture.setup.evidenceSha256, `${id} evidence file digest`);
  }

  const production = fixtureById.get('DEC-OQ-002-PRODUCTION-WORKLOAD').setup.production;
  assert(await fileSha256(`${contractRoot}${production.path}`) === production.sha256, 'OQ-002 production fixture digest');
  assert((await readFile(`${root}${contractRoot}${production.path}`)).byteLength === production.bytes, 'OQ-002 production fixture bytes');

  const unicode = await readJson(`${contractRoot}evidence/international-text-observation.v1.json`);
  assert(unicode.cases.length === 16, 'OQ-031 complete sixteen-case corpus');
  assert(unicode.fontProfile.layoutBoundsKind === 'semantic-advance-frame-not-ink-or-pixel-bounds', 'OQ-031 semantic advance bounds');
  assert(unicode.fontProfile.alphabeticBaselinePx === 16, 'OQ-031 alphabetic baseline intent');
  const unicodeCaseIds = new Set(unicode.cases.map((record) => record.id));
  const unicodeById = new Map(unicode.cases.map((record) => [record.id, record]));
  for (const id of ['unicode-multiline', 'unicode-long-unbroken', 'unicode-spaces', 'unicode-missing-requested-font', 'unicode-overflow-visible', 'unicode-overflow-hidden', 'unicode-overflow-ellipsis', 'unicode-auto-font-boundary', 'unicode-auto-font-tie']) {
    assert(unicodeCaseIds.has(id), `OQ-031 ${id} corpus coverage`);
  }
  assert(unicode.cases.every((record) => record.graphemes.join('') === record.source), 'OQ-031 grapheme arrays preserve source');
  assert(unicode.cases.every((record) => Object.values(record.layoutBounds).every(Number.isFinite)), 'OQ-031 finite semantic bounds');
  const bidi = unicodeById.get('unicode-bidi-mixed');
  assert(bidi.bidiRunsLogical.length === 2 && bidi.bidiRunsLogical[0].text === 'مرحبا ' && bidi.bidiRunsLogical[1].text === 'world', 'OQ-031 maximal bidi runs');
  assert(bidi.logicalToVisual.join(',') === '10,9,8,7,6,5,0,1,2,3,4', 'OQ-031 bidi logical-to-visual map');
  assert(unicodeById.get('unicode-emoji-graphemes').layoutBounds.width === 96, 'OQ-031 emoji semantic advance');
  assert(unicodeById.get('unicode-missing-glyph').missingGlyphs[0].identity === 'patch-map-missing-glyph-box/1', 'OQ-031 deterministic missing glyph');
  assert(unicodeById.get('unicode-overflow-visible').layoutBounds.width === 80, 'OQ-031 visible overflow bounds');
  assert(unicodeById.get('unicode-overflow-hidden').visibleText === 'ABCD', 'OQ-031 hidden overflow text');
  assert(unicodeById.get('unicode-overflow-ellipsis').visibleText === 'ABC…', 'OQ-031 ellipsis text');
  assert(unicode.fontProfile.autoFontSupportedSizes.step === 1 && unicode.fontProfile.autoFontSupportedSizes.lineHeightPx === 20, 'OQ-031 auto-font lattice');
  assert(unicodeById.get('unicode-auto-font-boundary').autoFont.chosenPx === 16 && unicodeById.get('unicode-auto-font-boundary').autoFont.largestRejectedPx === 17, 'OQ-031 auto-font boundary');
  assert(unicodeById.get('unicode-auto-font-tie').autoFont.fittingCandidatesPx.join(',') === '12,13,14,15,16' && unicodeById.get('unicode-auto-font-tie').autoFont.chosenPx === 16, 'OQ-031 auto-font multiple-fit choice');
  for (const font of unicode.fontProfile.files) {
    assert(await fileSha256(`${contractRoot}${font.path}`) === font.sha256, `OQ-031 ${font.identity} digest`);
    assert((await readFile(`${root}${contractRoot}${font.path}`)).byteLength === font.bytes, `OQ-031 ${font.identity} bytes`);
  }

  const windowsFixture = fixtureById.get('DEC-OQ-025-PERFORMANCE-BUDGET');
  assert(windowsFixture.setup.profile.id === 'windows-low-end-n100-8g-v1', 'OQ-025 exact target profile');
  assertSameOrdered(windowsFixture.executionPrerequisites, ['raw 2-warmup/7-sample target-Windows evidence'], 'OQ-025 execution prerequisite');
}

function assertAllowedKeys(value, allowed, label) {
  assertPlainObject(value, label);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  assert(unexpected.length === 0, `${label} unexpected keys: ${unexpected.join(', ')}`);
}

function assertPlainObject(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} object`);
}

function assertStringArray(value, label, { nonEmpty = false } = {}) {
  assert(Array.isArray(value), `${label} array`);
  if (nonEmpty) assert(value.length > 0, `${label} non-empty`);
  assert(value.every((entry) => typeof entry === 'string' && entry.length > 0), `${label} strings`);
  assert(value.length === new Set(value).size, `${label} unique`);
}

function assertSameOrdered(actual, wanted, label) {
  assert(Array.isArray(actual) && Array.isArray(wanted), `${label} arrays`);
  assert(JSON.stringify(actual) === JSON.stringify(wanted), `${label} exact`);
}

function assertSameSet(actual, wanted, label) {
  assert(actual.length === new Set(actual).size, `${label} unique`);
  assert([...actual].sort().join('\n') === [...wanted].sort().join('\n'), `${label} complete`);
}

function assert(condition, label) {
  if (!condition) throw new Error(`Decision evidence verification failed: ${label}`);
}
