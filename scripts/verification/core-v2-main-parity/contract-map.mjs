import { readFile } from 'node:fs/promises';

const PREFIX_RULES = Object.freeze({
  ACC: rule('accessibility-input', 'external-evidence', ['PAR-003', 'PAR-007'], 'verify:core-v2:release'),
  ANI: rule('animation-publication', 'main-partial', ['PAR-006', 'PAR-012'], 'verify:core-v2:browser'),
  AST: rule('asset-lifecycle', 'main-partial', ['PAR-001', 'PAR-008', 'PAR-013', 'PAR-016'], 'verify:core-v2:memory'),
  CSM: rule('consumer-journeys', 'consumer-seam', ['PAR-003', 'PAR-004', 'PAR-005', 'PAR-007', 'PAR-008', 'PAR-009', 'PAR-010', 'PAR-011', 'PAR-012', 'PAR-013', 'PAR-014', 'PAR-015', 'PAR-016'], 'verify:core-v2:packed-consumer'),
  DAT: rule('data-hierarchy', 'main-partial', ['DAT-002', 'DAT-003', 'DAT-004', 'PAR-001', 'PAR-009'], 'verify:core-v2-contract'),
  DET: rule('determinism', 'main-partial', ['LIF-002', 'PAR-005', 'PAR-008'], 'verify:core-v2:release'),
  ERR: rule('errors-atomicity', 'main-partial', ['LIF-001', 'LIF-002', 'PAR-005'], 'verify:core-v2:release'),
  EVT: rule('events-selection', 'main-partial', ['PAR-003', 'PAR-007', 'PAR-011'], 'verify:core-v2:browser'),
  HIS: rule('history', 'main-partial', ['PAR-005', 'PAR-007', 'PAR-008', 'PAR-009', 'PAR-013', 'PAR-014', 'PAR-015', 'PAR-016'], 'verify:core-v2:browser'),
  LAY: rule('layout-orientation', 'main-partial', ['LAY-004', 'LAY-005', 'PAR-001', 'PAR-002', 'PAR-009', 'PAR-013', 'PAR-014', 'PAR-016'], 'verify:core-v2:browser'),
  LIF: rule('lifecycle', 'main-partial', ['LIF-001', 'LIF-002', 'LIF-003', 'PAR-010'], 'verify:core-v2:memory'),
  MIG: rule('migration', 'consumer-seam', ['LIF-002', 'PAR-005'], 'verify:core-v2:packed-consumer'),
  OPS: rule('operations-diagnostics', 'consumer-seam', ['LIF-001', 'PAR-005'], 'verify:core-v2:release'),
  PIX: rule('pixijs-boundary', 'core-contract-extension', ['LIF-001', 'PAR-001', 'PAR-006'], 'verify:core-v2:browser'),
  PKG: rule('package', 'consumer-seam', [], 'verify:core-v2:packed-consumer'),
  PRF: rule('performance', 'external-evidence', ['PAR-004', 'PAR-006', 'PAR-012'], 'verify:core-v2:performance'),
  QRY: rule('query-targets', 'main-partial', ['LIF-002', 'PAR-004'], 'verify:core-v2:browser'),
  REN: rule('rendering', 'main-partial', ['REN-003', 'REN-008', 'REN-009', 'REN-011', 'PAR-001', 'PAR-006', 'PAR-008', 'PAR-009', 'PAR-013', 'PAR-014', 'PAR-015', 'PAR-016'], 'verify:core-v2:browser'),
  SEC: rule('security', 'external-evidence', ['PAR-008'], 'verify:core-v2:release'),
  SEL: rule('events-selection', 'main-partial', ['PAR-003', 'PAR-007', 'PAR-009', 'PAR-011'], 'verify:core-v2:browser'),
  TRN: rule('transformer', 'main-partial', ['PAR-007'], 'verify:core-v2:browser'),
  UPD: rule('updates', 'main-partial', ['PAR-005', 'PAR-007', 'PAR-008', 'PAR-009', 'PAR-013', 'PAR-014', 'PAR-015', 'PAR-016'], 'verify:core-v2:browser'),
  VIE: rule('viewport', 'main-partial', ['PAR-002', 'PAR-004', 'PAR-010', 'PAR-011'], 'verify:core-v2:browser'),
});

const DIRECT_SCENARIO_IDS = new Set([
  'LIF-001',
  'LIF-002',
  'LIF-003',
  'DAT-002',
  'DAT-003',
  'DAT-004',
  'REN-003',
  'REN-008',
  'REN-009',
  'LAY-004',
  'LAY-005',
  'REN-011',
]);

export async function buildCoreV2MainParityContractMap({
  manifestPath,
  typedCasesPath,
  availableScenarioIds,
}) {
  const [manifest, typedCases] = await Promise.all([
    readJson(manifestPath),
    readJson(typedCasesPath),
  ]);
  const actionsById = new Map(
    typedCases.cases.map((record) => [
      record.id,
      Object.freeze((record.actions ?? []).map((action) => action.type)),
    ]),
  );
  const available = new Set(availableScenarioIds);
  const records = manifest.cases.map((record) => {
    const prefix = record.id.split('-')[0];
    const configured = PREFIX_RULES[prefix];
    if (configured === undefined) {
      throw new Error(`missing main parity contract-map rule for ${record.id}`);
    }
    const probes = configured.probes.filter((id) => available.has(id));
    const comparisonMode = DIRECT_SCENARIO_IDS.has(record.id)
      ? 'direct-main-overlap'
      : configured.comparisonMode;
    return Object.freeze({
      id: record.id,
      caseType: record.caseType,
      suite: configured.suite,
      comparisonMode,
      actionTypes: actionsById.get(record.id) ?? Object.freeze([]),
      sharedParityProbeIds: Object.freeze(probes),
      independentGate: configured.independentGate,
      rationale: comparisonRationale(comparisonMode),
    });
  });
  const modeCounts = countBy(records, ({ comparisonMode }) => comparisonMode);
  const suiteCounts = countBy(records, ({ suite }) => suite);
  return Object.freeze({
    schemaRevision: 'core-v2-main-parity-contract-map/2026-07-29.1',
    contractRevision: manifest.contractRevision,
    expectedBlind: true,
    caseCount: records.length,
    mappedCaseCount: records.filter(({ comparisonMode }) => comparisonMode.length > 0).length,
    modeCounts: Object.freeze(modeCounts),
    suiteCounts: Object.freeze(suiteCounts),
    cases: Object.freeze(records),
  });
}

function rule(suite, comparisonMode, probes, independentGate) {
  return Object.freeze({
    suite,
    comparisonMode,
    probes: Object.freeze(probes),
    independentGate,
  });
}

function comparisonRationale(mode) {
  switch (mode) {
    case 'direct-main-overlap':
      return 'the first-tranche black-box harness runs the canonical case profile in both runtimes';
    case 'main-partial':
      return 'shared visible semantics run through explicit black-box probes; Core-only contract detail remains independently gated';
    case 'core-contract-extension':
      return 'the approved Core v2 boundary has no equivalent main public behavior and is verified independently';
    case 'consumer-seam':
      return 'the behavior crosses package/host ownership and is verified through the packed consumer plus shared visible probes';
    case 'external-evidence':
      return 'native hardware, assistive technology, security, or performance evidence cannot be inferred from canvas parity';
    default:
      throw new Error(`unknown comparison mode ${mode}`);
  }
}

function countBy(records, keyOf) {
  const counts = {};
  for (const record of records) {
    const key = keyOf(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) =>
    left.localeCompare(right),
  ));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
