import { readFile } from 'node:fs/promises';

import {
  catalogActionSchemaPath,
  catalogObservationSchemaPath,
  catalogProfilePath,
  catalogTypedCasePath,
  root,
  validateActionContract,
  validateExecutionBindings,
  validateTypedAssertions,
} from './core-v2-catalog-lib.mjs';

const typed = await readJson(catalogTypedCasePath);
const profiles = await readJson(catalogProfilePath);
const actions = await readJson(catalogActionSchemaPath);
const observations = await readJson(catalogObservationSchemaPath);

validateActionContract(typed.cases, actions);
validateTypedAssertions(typed.cases, observations);
validateExecutionBindings(typed, profiles, actions);

expectReject('unknown opcode', () => {
  const subject = structuredClone(typed.cases);
  subject[0].actions[0].type = 'unknown-opcode';
  validateActionContract(subject, actions);
});

expectReject('operand shape drift', () => {
  const subject = structuredClone(typed.cases);
  subject[0].actions[0].operands.unreviewed = true;
  validateActionContract(subject, actions);
});

expectReject('output metadata drift', () => {
  const contract = structuredClone(actions);
  delete contract.definitions[0].output.schema;
  validateActionContract(typed.cases, contract);
});

expectReject('binding metadata drift', () => {
  const contract = structuredClone(actions);
  delete contract.definitions[0].binding.capturePaths;
  validateActionContract(typed.cases, contract);
});

expectReject('operator type drift', () => {
  const subject = structuredClone(typed.cases);
  const assertion = subject.flatMap((record) => record.expected.assertions)
    .find((entry) => entry.operator === 'orderedEq');
  assertion.value = 'not-an-array';
  validateTypedAssertions(subject, observations);
});

expectReject('unknown observation domain', () => {
  const subject = structuredClone(typed.cases);
  subject[0].expected.assertions[0].path = 'invented.value';
  validateTypedAssertions(subject, observations);
});

expectReject('unresolved fixture reference', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'PRF-002');
  record.expected.assertions.at(-1).value = { $ref: '/fixtures/missingExpectedHash' };
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('fabricated capture checkpoint', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'UPD-002');
  const assertion = record.expected.assertions.find((entry) => entry.value?.$ref?.startsWith('/captures/'));
  assertion.value = { $ref: '/captures/fabricated/target' };
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('checkpoint expected-value drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'LIF-003');
  record.fixture.captureCheckpoints[0].expected['events/bindingCount'] = 0;
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('aliased dataset reference drift', () => {
  const subject = structuredClone(typed);
  subject.cases.find((entry) => entry.id === 'LIF-003').fixture.params.datasetARef = 'fabricated-dataset';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('profile legacy dataset alias drift', () => {
  const subject = structuredClone(profiles);
  subject.profiles['dataset-schema-matrix'].legacyDatasetRef = 'fabricated-dataset';
  validateExecutionBindings(typed, subject, actions);
});

expectReject('profile relation dataset alias drift', () => {
  const subject = structuredClone(profiles);
  const profile = Object.values(subject.profiles).find((entry) => entry.relationDatasetRef !== undefined);
  profile.relationDatasetRef = 'fabricated-dataset';
  validateExecutionBindings(typed, subject, actions);
});

expectReject('plural generator reference drift', () => {
  const subject = structuredClone(typed);
  subject.cases.find((entry) => entry.id === 'PRF-002').actions[0].operands.generatorRefs[0] = 'fabricated-generator';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('target collection reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'UPD-009');
  record.actions.find((action) => action.type === 'setSelection').operands.targetIds[0] = 'fabricated-target';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('select IDs reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.actions.some((action) => action.type === 'select'));
  record.actions.find((action) => action.type === 'select').operands.ids[0] = 'fabricated-target';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('nested selection operation reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'TRN-001');
  record.actions.find((action) => action.type === 'transform-target-operations').operands.operations[0].ids[0] = 'fabricated-target';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('parent move reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.actions.some((action) => action.type === 'moveAcrossParents'));
  record.actions.find((action) => action.type === 'moveAcrossParents').operands.toParentId = 'fabricated-parent';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('cascade target reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.actions.some((action) => action.type === 'apply-host-cascade-confirmation'));
  record.actions.find((action) => action.type === 'apply-host-cascade-confirmation').operands.cascadeTargets[0] = 'fabricated-target';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('retained scene target reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.actions.some((action) => action.type === 'replace-scene' && action.operands.retainIds));
  record.actions.find((action) => action.type === 'replace-scene' && action.operands.retainIds).operands.retainIds[0] = 'fabricated-target';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('relation source reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.actions.some((action) => action.type === 'add-relation-link'));
  record.actions.find((action) => action.type === 'add-relation-link').operands.source = 'fabricated-target';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('hierarchy parent reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.actions.some((action) => action.type === 'move-hierarchy'));
  record.actions.find((action) => action.type === 'move-hierarchy').operands.parent = 'fabricated-parent';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('expected hit target reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.actions.some((action) => action.type === 'hit-test'));
  record.actions.find((action) => action.type === 'hit-test').operands.expectedTarget = 'fabricated-target';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('expected hover target reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.actions.some((action) => action.type === 'hover-overlap-redraw-probe'));
  record.actions.find((action) => action.type === 'hover-overlap-redraw-probe').operands.sequence[0].expectedTopmost = 'fabricated-target';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('removed target cannot be consumed before replacement', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'DAT-008');
  const removeIndex = record.actions.findIndex((action) => action.type === 'remove');
  record.actions.splice(removeIndex + 1, 0, { type: 'query-target', operands: { target: { id: 'explicit-a' } } });
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('future dataset target cannot be consumed before load', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'LIF-003');
  const firstReplacement = record.actions.findIndex((action) => action.type === 'replaceDataset');
  record.actions.splice(firstReplacement, 0, { type: 'query-target', operands: { target: { id: 'item-z' } } });
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('displaced target cannot be consumed after dataset replacement', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'LIF-003');
  const firstReplacement = record.actions.findIndex((action) => action.type === 'replaceDataset');
  record.actions.splice(firstReplacement + 1, 0, { type: 'query-target', operands: { target: { id: 'item-a' } } });
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('produced group cannot be consumed before creation', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'CSM-031');
  record.actions.unshift({ type: 'query-target', operands: { target: { id: 'g' } } });
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('component target reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.actions.some((action) => action.type === 'setComponentVisibility'));
  record.actions.find((action) => action.type === 'setComponentVisibility').operands.componentId = 'fabricated-component';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('relation collection reference drift', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'SEL-009');
  record.actions.find((action) => action.type === 'select-relation-endpoints').operands.relations[0] = 'fabricated-relation';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('unresolved target reference', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'AST-003');
  record.actions.find((action) => action.type === 'startAssetRequest').operands.targetId = 'missing-image';
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('forward binding', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'UPD-001');
  const producerIndex = record.actions.findIndex((action) => action.operands.as === 'oldBar');
  const consumerIndex = record.actions.findIndex((action) => action.operands.targetRef === 'oldBar');
  const [consumer] = record.actions.splice(consumerIndex, 1);
  record.actions.splice(producerIndex, 0, consumer);
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('duplicate binding', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'UPD-001');
  const producer = record.actions.find((action) => action.operands.as === 'oldBar');
  record.actions.splice(record.actions.indexOf(producer) + 1, 0, structuredClone(producer));
  validateExecutionBindings(subject, profiles, actions);
});

expectReject('unacknowledged stale binding', () => {
  const subject = structuredClone(typed);
  const record = subject.cases.find((entry) => entry.id === 'UPD-001');
  const consumer = record.actions.find((action) => action.operands.targetRef === 'oldBar');
  delete consumer.operands.allowStale;
  delete consumer.operands.expectedCode;
  validateExecutionBindings(subject, profiles, actions);
});

console.log('Core v2 catalog static gates verified: canonical pass + 32 negative drift probes');

async function readJson(relativePath) {
  return JSON.parse(await readFile(`${root}${relativePath}`, 'utf8'));
}

function expectReject(label, callback) {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error(`Core v2 static gate failed to reject: ${label}`);
}
