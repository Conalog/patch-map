import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareObservations, compareRuns, contractFingerprint, qualify } from './compare.mjs';
import { verifyApiBindings } from './api-bindings.mjs';
import { inventoryPublicApi } from './inventory.mjs';
import { collectPackageFailures } from '../../packages/javascript/verification/package/evidence.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };
const requireTrue = (value, message) => { if (!value) fail(message); };
const isSha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const portable = (root, path) => relative(root, path.startsWith('file://') ? fileURLToPath(path) : resolve(root, path)).split('\\').join('/');

export function analyzerSelectsProbe(root, analyzer, file) {
  if (!Array.isArray(analyzer.command)) return false;
  const at = analyzer.command.indexOf('analyze');
  if (at < 0) return false;
  const cwd = resolve(root, analyzer.workingDirectory ?? '.');
  const targets = analyzer.command.slice(at + 1).filter((argument) => !argument.startsWith('-'));
  const selected = targets.length === 0 ? [cwd] : targets.map((target) => resolve(cwd, target));
  return selected.some((target) => resolve(root, file) === target || resolve(root, file).startsWith(`${target}/`));
}

export function validateNativeIdentity(root, input, observed, artifactReceipt, log) {
  const receiptDirectory = dirname(resolve(root, input.artifactReceipt.path));
  requireTrue(artifactReceipt.sha256 === input.artifact.sha256 &&
    resolve(root, artifactReceipt.path) === resolve(root, input.artifact.path) &&
    resolve(receiptDirectory, artifactReceipt.report) === resolve(root, input.report.path) &&
    resolve(receiptDirectory, artifactReceipt.sourceManifest) === resolve(root, input.sourceSnapshot.path), 'Native artifact/report/source receipt mismatch');
  requireTrue(input.revision === observed.revision && typeof input.revision === 'string' && input.revision.length > 0,
    'Native build/report revision mismatch');
  const markers = log.split(/\r?\n/u).filter((line) => line.startsWith('PATCHMAP_NATIVE_CONTRACT ')).map((line) => line.slice('PATCHMAP_NATIVE_CONTRACT '.length).trim());
  requireTrue(markers.length === 1 && resolve(root, markers[0]) === resolve(root, input.report.path) &&
    (log.includes('All tests passed!') || log.includes('All tests passed.')), 'Native execution log does not identify the successful report');
}

/** Pin evidence inputs. A later snapshot verifies current state; it must not be
 * represented as a historical pre-run capture. Native build snapshots are separate. */
export async function snapshotSources(root) {
  const files = {};
  async function visit(path) {
    for (const entry of (await readdir(resolve(root, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = `${path}/${entry.name}`;
      if (entry.isSymbolicLink()) fail(`Source snapshot rejects symlink: ${child}`);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) files[child] = sha(await readFile(resolve(root, child)));
    }
  }
  for (const path of ['packages/javascript/src', 'packages/javascript/tests', 'docs', 'packages/flutter/lib', 'packages/flutter/assets', 'packages/flutter/test',
    'packages/flutter/example/lib', 'packages/flutter/example/integration_test', 'packages/flutter/example/test_driver',
    'conformance', 'verification/conformance', 'verification/flutter', 'packages/javascript/verification/package']) {
    try { await visit(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const path of ['package.json', 'package-lock.json', '.nvmrc', 'verification/package.json', 'verification/tsconfig.json', 'verification/eslint.config.js', 'packages/javascript/package.json', 'packages/javascript/tsconfig.json', 'packages/javascript/tsconfig.build.json', 'packages/javascript/vite.config.ts', 'packages/flutter/pubspec.yaml', 'packages/flutter/pubspec.lock']) {
    try { files[path] = sha(await readFile(resolve(root, path))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  return { schemaRevision: 'patch-map-evidence-source-snapshot/1', files: sorted, fingerprint: sha(JSON.stringify(sorted)) };
}

export function parseVitestReport(root, report) {
  requireTrue(report?.success === true && report.numTotalTests > 0 && report.numFailedTests === 0 && report.numFailedTestSuites === 0, 'npm unit report failed, empty or incomplete');
  const tests = [];
  for (const suite of report.testResults ?? []) {
    requireTrue(suite.status === 'passed', `npm suite did not pass: ${suite.name}`);
    for (const test of suite.assertionResults ?? []) {
      if (['pending', 'todo', 'skipped', 'disabled'].includes(test.status)) {
        tests.push({ file: portable(root, suite.name), test: test.title, fullName: test.fullName, skipped: true }); continue;
      }
      requireTrue(test.status === 'passed', `npm test did not pass: ${test.fullName}`);
      tests.push({ file: portable(root, suite.name), test: test.title, fullName: test.fullName });
    }
  }
  requireTrue(tests.filter((test) => !test.skipped).length === report.numPassedTests, 'npm passing test count does not match the machine report');
  return tests;
}

export function parseDartReport(root, text) {
  const events = text.trim().split(/\r?\n/u).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
  requireTrue(events.at(-1)?.type === 'done' && events.at(-1)?.success === true, 'Dart machine report is failed or incomplete');
  const starts = new Map(), groups = new Map(), finished = new Set(), tests = [];
  for (const event of events) {
    if (event.type === 'error') fail(`Dart machine error: ${event.error}`);
    if (event.type === 'group') groups.set(event.group.id, event.group.name);
    if (event.type === 'testStart') {
      requireTrue(!starts.has(event.test.id), 'Duplicate Dart test start');
      starts.set(event.test.id, event.test);
    }
    if (event.type === 'testDone') {
      requireTrue(event.result === 'success', `Dart test failed: ${event.testID}`);
      requireTrue(starts.has(event.testID) && !finished.has(event.testID), 'Unknown/duplicate Dart test completion');
      finished.add(event.testID);
      if (event.hidden) continue;
      const test = starts.get(event.testID);
      const group = (test.groupIDs ?? []).map((id) => groups.get(id)).filter(Boolean).sort((a, b) => b.length - a.length)[0];
      const title = group && test.name.startsWith(`${group} `) ? test.name.slice(group.length + 1) : test.name;
      tests.push({ file: portable(root, test.root_url ?? test.url), test: title, fullName: test.name, ...(event.skipped ? { skipped: true } : {}) });
    }
  }
  requireTrue(tests.length > 0 && starts.size === finished.size, 'Dart report has no tests or unfinished tests');
  return tests;
}

/** Config references are explicit and hash pinned. Assertions come from actual
 * machine observations; neither a static locator nor a reviewer label is a run. */
export async function collectEvidence(root, config) {
  requireTrue(config?.schemaRevision === 'patch-map-evidence-inputs/1', 'Invalid evidence input schema');
  const inputs = [];
  async function readRef(ref, asJson = true) {
    requireTrue(typeof ref?.path === 'string' && isSha(ref.sha256), 'Every evidence input needs path and SHA-256');
    const bytes = await readFile(resolve(root, ref.path));
    requireTrue(sha(bytes) === ref.sha256, `Evidence SHA mismatch: ${ref.path}`);
    inputs.push({ path: ref.path, sha256: ref.sha256 });
    return asJson === 'hash' ? ref.sha256 : asJson ? JSON.parse(bytes.toString('utf8')) : bytes.toString('utf8');
  }
  const manifest = await json(resolve(root, 'conformance/manifest.json'));
  const inventory = await json(resolve(root, 'conformance/public-api.json'));
  compareObservations(inventory, inventoryPublicApi(root), '$.actualPublicApi');
  const fingerprint = await contractFingerprint(root);
  requireTrue(config.contractFingerprint === fingerprint, 'Evidence contract fingerprint is stale');
  const snapshot = await readRef(config.sourceSnapshot);
  compareObservations(snapshot, await snapshotSources(root), '$.sourceSnapshot');
  function receipt(record, label) {
    requireTrue(record?.exitCode === 0 && record.sourceFingerprint === snapshot.fingerprint && record.contractFingerprint === fingerprint,
      `${label}: missing successful command receipt or stale source/contract fingerprint`);
  }
  const units = {};
  for (const runtime of ['npm', 'dart']) {
    const records = Array.isArray(config.unit?.[runtime]) ? config.unit[runtime] : [config.unit?.[runtime]];
    const latest = new Map();
    for (const record of records) {
      receipt(record, `${runtime} tests`);
      const tests = runtime === 'npm' ? parseVitestReport(root, await readRef(record.report)) : parseDartReport(root, await readRef(record.report, false));
      for (const test of tests) latest.set(`${test.file}#${test.fullName}`, test);
    }
    units[runtime] = [...latest.values()];
  }
  let textCaseIds;
  function testWitness(witness) {
    if (witness.runtime === 'dart' && witness.file === 'packages/flutter/test/text/layout_test.dart' && witness.test === 'shared npm text observation:') {
      requireTrue(Array.isArray(textCaseIds) && textCaseIds.length > 0, 'Parameterized text witness needs the verified full text case list');
      return textCaseIds.map((id) => testWitness({ ...witness, test: `shared npm text observation: ${id}` })).join('; ');
    }
    const matches = units[witness.runtime]?.filter((test) => test.file === witness.file && (test.test === witness.test || test.fullName === witness.test)) ?? [];
    requireTrue(matches.length === 1 && !matches[0].skipped, `Missing, skipped or ambiguous executed test: ${witness.runtime}/${witness.file}#${witness.test}`);
    return `${witness.file}#${matches[0].fullName}`;
  }

  const probeFiles = new Set();
  for (const analyzer of config.analyzers ?? []) {
    receipt(analyzer, 'Dart analyzer');
    const log = await readRef(analyzer.log, false);
    requireTrue(log.includes('No issues found!') && !/\berror\s+[•-]|\d+ issues found/iu.test(log), 'Analyzer log does not establish success');
    requireTrue(Array.isArray(analyzer.probes) && analyzer.probes.length > 0 && Array.isArray(analyzer.command), 'Analyzer needs explicit argv and probe list');
    for (const file of analyzer.probes) {
      requireTrue(analyzerSelectsProbe(root, analyzer, file), `Analyzer command did not select probe: ${file}`);
      probeFiles.add(file);
    }
  }
  const bindings = new Map();
  for (const path of config.bindings ?? []) {
    const document = await json(resolve(root, path));
    await verifyApiBindings(root, inventory, document);
    for (const binding of document.bindings) {
      requireTrue(!bindings.has(binding.id), `Duplicate API binding across files: ${binding.id}`);
      requireTrue(binding.pendingAssertions.length === 0, `Pending API assertions: ${binding.id}`);
      requireTrue(probeFiles.has(binding.probe.file), `No successful analyzer receipt for ${binding.id}`);
      bindings.set(binding.id, binding);
    }
  }
  const missing = inventory.filter((entry) => !bindings.has(entry.id)).map((entry) => entry.id);
  requireTrue(missing.length === 0, `Unmapped public API entries (${missing.length}): ${missing.join(', ')}`);

  receipt(config.traces?.npm, 'npm public trace'); receipt(config.traces?.dart, 'Dart public trace');
  const npmTrace = await readRef(config.traces.npm.report), dartTrace = await readRef(config.traces.dart.report);
  requireTrue(npmTrace.runtime === 'npm' && dartTrace.runtime === 'dart', 'Public trace runtime identity mismatch');
  compareRuns(npmTrace, dartTrace, manifest.fixtures);
  const traces = new Map();
  for (const row of npmTrace.observations) {
    requireTrue(Array.isArray(row.failures) && row.failures.length === 0, `Trace fixture has failures: ${row.fixtureId}`);
    const fixture = await json(resolve(root, `conformance/fixtures/${row.fixtureId}.json`));
    compareObservations((row.steps ?? []).map((step) => step.commandId), fixture.commands.map((command) => command.id), `$.${row.fixtureId}.commands`);
    requireTrue(row.initial && typeof row.initial === 'object', `Missing initial public observation: ${row.fixtureId}`);
    traces.set(row.fixtureId, row);
  }
  const oracles = new Map();
  for (const oracle of config.oracles ?? []) {
    receipt(oracle, `oracle ${oracle.id}`);
    requireTrue(['model', 'text'].includes(oracle.id) && !oracles.has(oracle.id), 'Unknown/duplicate oracle kind');
    requireTrue(oracle.expected === `conformance/${oracle.id}/expected.json` && oracle.cases === `conformance/${oracle.id}/cases.json` &&
      oracle.runner.file === `verification/conformance/run-${oracle.id}.mjs`, 'Oracle must compare its owning pinned cases and expected observations');
    const actual = await readRef(oracle.report);
    const expected = await json(resolve(root, oracle.expected));
    compareObservations(actual, expected, `$.${oracle.id}`);
    requireTrue(Array.isArray(actual) && actual.length > 0, `Empty ${oracle.id} oracle`);
    const cases = await json(resolve(root, oracle.cases));
    compareObservations(actual.map((item) => item.id), cases.map((item) => item.id), `$.${oracle.id}.caseIds`);
    if (oracle.id === 'text') textCaseIds = cases.map((item) => item.id);
    const runner = await readFile(resolve(root, oracle.runner.file), 'utf8');
    requireTrue(oracle.runner.test && runner.includes(oracle.runner.test), 'Missing oracle assertion source');
    oracles.set(oracle.id, oracle);
  }
  requireTrue(oracles.has('model') && oracles.has('text'), 'Model and text oracle command evidence is required');

  function executed(witness) {
    requireTrue(typeof witness.assertion === 'string' && witness.assertion.length > 0, 'Empty witness assertion');
    if (witness.file.startsWith('conformance/fixtures/')) {
      const id = witness.file.slice('conformance/fixtures/'.length, -'.json'.length);
      const match = /^"id": "([^"]+)"$/u.exec(witness.test);
      const trace = traces.get(id);
      requireTrue(trace && (witness.test === 'initial' || match && trace.steps.some((step) => step.commandId === match[1])), `Missing exact trace command witness: ${witness.file}#${witness.test}`);
      return `${witness.file}#${witness.test} exact npm/Dart comparison`;
    }
    if (witness.file.startsWith('verification/conformance/run-')) {
      const oracle = [...oracles.values()].find((item) => item.runner.file === witness.file && item.runner.test === witness.test);
      requireTrue(oracle && witness.runtime === 'npm', `Missing exact oracle runner evidence: ${witness.file}#${witness.test}`);
      return `${witness.file} exact pinned ${oracle.id} observations`;
    }
    return testWitness(witness);
  }

  const indexDocument = await json(resolve(root, 'conformance/witnesses.json'));
  const caseIndex = new Map();
  for (const item of indexDocument.cases) {
    requireTrue(!caseIndex.has(item.id), `Duplicate semantic case: ${item.id}`);
    caseIndex.set(item.id, item);
  }
  const semantic = { npm: [], dart: [] };
  for (const requirement of manifest.requirements) {
    const assertions = { npm: [], dart: [] };
    for (const id of requirement.cases) {
      const item = caseIndex.get(id);
      requireTrue(item && Array.isArray(item.assertions) && item.assertions.length > 0, `Missing semantic case: ${id}`);
      if (item.kind === 'shared-fixture') {
        const trace = traces.get(id);
        requireTrue(trace, `Missing compared fixture: ${id}`);
        for (const runtime of ['npm', 'dart']) assertions[runtime].push(...item.assertions.map((value) => `${id}: ${value}`));
      } else if (item.kind === 'focused-test') {
        const ref = testWitness(item);
        assertions[item.runtime].push(...item.assertions.map((value) => `${ref}: ${value}`));
      } else fail(`Unknown semantic witness kind: ${item.kind}`);
    }
    for (const runtime of ['npm', 'dart']) {
      requireTrue(assertions[runtime].length > 0, `${requirement.id}: no ${runtime} executed semantic witness`);
      semantic[runtime].push({ id: requirement.id, outcome: 'passed', assertions: assertions[runtime], scope: 'Finite named observations selected by the owning semantic manifest; not exhaustive input-space proof.' });
    }
  }

  const installed = {};
  for (const runtime of ['npm', 'dart']) {
    const input = config.installed?.[runtime]; receipt(input, `${runtime} installed consumer`);
    const report = await readRef(input.report);
    await readRef(input.artifact, 'hash');
    const expectedSha = runtime === 'npm' ? report.provenance?.packedPackageSha256 : report.artifactSha256;
    requireTrue(expectedSha === input.artifact.sha256, `${runtime} installed report does not identify the supplied artifact`);
    if (runtime === 'npm') {
      requireTrue(report.status === 'pass' && Array.isArray(report.failures) && report.failures.length === 0, 'npm installed consumer did not pass');
      const failures = collectPackageFailures({ ...report, packageArtifact: report.artifact, productionAliasProbe: report.packageBoundary?.production });
      requireTrue(failures.length === 0, `npm installed consumer observations fail: ${failures.join('; ')}`);
    } else {
      requireTrue(report.installedConsumer === true && report.contractFingerprint === fingerprint && report.stages?.length >= 3 && report.stages.every((stage) => stage.status === 0), 'Dart installed consumer incomplete or stale');
      for (const stage of report.stages) {
        await readRef({ path: resolve(dirname(resolve(root, input.report.path)), stage.log), sha256: stage.logSha256 }, false);
      }
      const testStage = report.stages.find((stage) => stage.name === 'test');
      requireTrue(testStage, 'Dart installed test stage absent');
      const installedTests = parseDartReport(root, await readFile(resolve(dirname(resolve(root, input.report.path)), testStage.log), 'utf8'));
      requireTrue(Array.isArray(report.assertions) && report.assertions.length > 0 && report.assertions.every((name) => installedTests.some((test) => !test.skipped && (test.test === name || test.fullName === name))), 'Dart installed assertions did not execute');
    }
    installed[runtime] = { artifactSha256: expectedSha, installedConsumer: true };
  }

  const platforms = {};
  for (const platform of manifest.requiredPlatforms ?? []) {
    const input = config.platforms?.[platform]; receipt(input, `${platform} platform`);
    const report = await readRef(input.report);
    await readRef(input.artifact, 'hash');
    const observed = report.nativeContract;
    requireTrue(observed?.completed === true && observed.platform === platform && Array.isArray(observed.assertions) && observed.assertions.length > 0, `${platform}: native contract report incomplete`);
    const artifactReceipt = await readRef(input.artifactReceipt);
    const log = await readRef(input.log, false);
    validateNativeIdentity(root, input, observed, artifactReceipt, log);
    const nativeSources = await readRef(input.sourceSnapshot);
    const nativeFiles = nativeSources.files ?? nativeSources;
    for (const [file, digest] of Object.entries(nativeFiles)) requireTrue(snapshot.files[file] === digest, `${platform}: built source differs: ${file}`);
    requireTrue(Object.keys(nativeFiles).some((file) => file.endsWith('native_contract_test.dart')) &&
      Object.keys(nativeFiles).some((file) => file.endsWith('native_contract_driver.dart')) &&
      Object.keys(nativeFiles).some((file) => file.startsWith('packages/flutter/lib/')), `${platform}: incomplete build-source receipt`);
    for (const file of Object.keys(snapshot.files).filter((file) => file.startsWith('packages/javascript/src/') || file.startsWith('packages/flutter/lib/') || file.startsWith('packages/flutter/assets/'))) {
      requireTrue(nativeFiles[file] === snapshot.files[file], `${platform}: built source receipt omitted ${file}`);
    }
    if (input.producerVerification) {
      const producer = await readRef(input.producerVerification);
      requireTrue(producer.phase === 'after-run-verification' && producer.unchangedSinceNativeRuns === true, 'Native producer check must state its actual later verification phase');
      const requiredProducer = ['packages/flutter/example/lib/shared_fixtures.dart', 'packages/flutter/example/integration_test/native_contract_test.dart', 'packages/flutter/example/test_driver/native_contract_driver.dart'];
      for (const file of requiredProducer) requireTrue(producer.sourceHashes?.[file] === snapshot.files[file], `${platform}: missing/current native producer check: ${file}`);
    } else requireTrue(nativeFiles['packages/flutter/example/lib/shared_fixtures.dart'] === snapshot.files['packages/flutter/example/lib/shared_fixtures.dart'], `${platform}: native fixture producer is absent from build snapshot`);
    const categories = {};
    for (const category of ['rendering', 'input', 'lifecycle', 'assets', 'accessibility', 'capture']) {
      const refs = input.assertions?.[category];
      requireTrue(Array.isArray(refs) && refs.length > 0 && refs.every((value) => observed.assertions.includes(value)), `${platform}/${category}: exact observed assertions missing`);
      categories[category] = true;
    }
    platforms[platform] = { outcome: 'passed', ...categories, artifactSha256: input.artifact.sha256, scope: observed.scope, observedAssertions: input.assertions };
  }
  const runtimes = {};
  for (const runtime of ['npm', 'dart']) {
    const witnesses = [...semantic[runtime]];
    for (const binding of bindings.values()) {
      const assertions = binding.witnesses.filter((item) => item.runtime === runtime).map((item) => `${executed(item)}: ${item.assertion}`);
      requireTrue(assertions.length > 0, `${binding.id}: no ${runtime} executed binding witness`);
      witnesses.push({ id: binding.id, outcome: 'passed', assertions,
        shapeSha256: binding.shapeSha256, probe: binding.probe, scope: binding.scope });
    }
    runtimes[runtime] = { ...installed[runtime], witnesses };
  }
  const evidence = { schemaRevision: manifest.schemaRevision, contractFingerprint: fingerprint,
    provenance: { sourceFingerprint: snapshot.fingerprint, sourceSnapshotPhase: config.sourceSnapshotPhase,
      unitCounts: Object.fromEntries(Object.entries(units).map(([runtime, tests]) => [runtime, { passed: tests.filter((test) => !test.skipped).length, unreferencedSkipped: tests.filter((test) => test.skipped).length }])), inputs,
      scope: 'Qualification covers the reviewed finite declaration bindings and observed assertions recorded here. It does not claim exhaustive behavior across every possible input or pixel-identical backends.' },
    runtimes, platforms };
  const result = qualify(manifest, inventory, evidence, fingerprint);
  requireTrue(result.qualified, `Existing qualification gate rejected collected evidence: ${result.failures.join('; ')}`);
  return { evidence, qualification: result };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [argument, output] = process.argv.slice(2);
  if (argument === '--snapshot') {
    requireTrue(output, 'usage: collect-evidence.mjs --snapshot <source-snapshot.json>');
    await writeFile(resolve(output), `${JSON.stringify(await snapshotSources(process.cwd()), null, 2)}\n`);
  } else {
    requireTrue(argument && output, 'usage: collect-evidence.mjs <input-config.json> <qualification-envelope.json>');
    try {
      const result = await collectEvidence(process.cwd(), await json(resolve(argument)));
      await writeFile(resolve(output), `${JSON.stringify(result.evidence, null, 2)}\n`);
      console.log(JSON.stringify(result.qualification, null, 2));
    } catch (error) {
      await writeFile(resolve(output), `${JSON.stringify({ qualified: false, failures: [error.message] }, null, 2)}\n`);
      console.error(error.message); process.exitCode = 1;
    }
  }
}
