import { mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  buildCatalog,
  canonicalSha256,
  catalogActionSchemaPath,
  catalogExpectedPath,
  catalogFixturePath,
  catalogObservationSchemaPath,
  catalogProfilePath,
  catalogReviewPath,
  catalogTypedCasePath,
  root,
  serialized,
  sha256,
} from './patch-map-catalog-lib.mjs';

const acknowledgement = '--acknowledge-independent-analysis-owner-review';
if (!process.argv.includes(acknowledgement)) {
  throw new Error(`Refusing to approve catalog without ${acknowledgement}`);
}

const reviewerArgument = process.argv.find((value) => value.startsWith('--reviewer='));
const reviewerRole = reviewerArgument?.slice('--reviewer='.length);
if (reviewerRole !== 'analysis-owner') throw new Error('Reviewer must be analysis-owner');

const reviewArguments = process.argv.filter((value) => value.startsWith('--review-report='));
const reviewReports = await Promise.all(reviewArguments.map(async (argument) => {
  const specification = argument.slice('--review-report='.length);
  const separator = specification.indexOf(':');
  if (separator <= 0) throw new Error(`Invalid review report argument: ${specification}`);
  const domain = specification.slice(0, separator);
  const path = specification.slice(separator + 1);
  if (!['data-rendering', 'interaction-history', 'release-dsl'].includes(domain)) {
    throw new Error(`Unknown review domain: ${domain}`);
  }
  const bytes = await readFile(path);
  const text = bytes.toString('utf8');
  if (!/^Verdict:\s*PASS\s*$/m.test(text)) throw new Error(`${domain} review report is not PASS`);
  if (/\/Users\/|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:api[_-]?key|secret|token)\s*[:=]/i.test(text)) {
    throw new Error(`${domain} review report contains a non-portable path or secret-like marker`);
  }
  const reportPath = `evidence/reviews/catalog-review-${domain}.md`;
  return { domain, reportPath, bytes, sha256: sha256(bytes) };
}));
if (reviewReports.length !== 3 || new Set(reviewReports.map((entry) => entry.domain)).size !== 3) {
  throw new Error('Exactly one independent report is required for data-rendering, interaction-history, and release-dsl');
}

const fixtures = JSON.parse(await readFile(`${root}${catalogFixturePath}`, 'utf8'));
const expected = JSON.parse(await readFile(`${root}${catalogExpectedPath}`, 'utf8'));
const generated = await buildCatalog({
  reviewRegistryOverride: { document: null, sha256: null, byId: new Map() },
});
if (serialized(fixtures) !== serialized(generated.fixtures) || serialized(expected) !== serialized(generated.expected)) {
  throw new Error('Refusing to approve catalog with generated fixture/expected drift');
}
const profileBytes = await readFile(`${root}${catalogProfilePath}`);
const typedCaseBytes = await readFile(`${root}${catalogTypedCasePath}`);
const actionSchemaBytes = await readFile(`${root}${catalogActionSchemaPath}`);
const observationSchemaBytes = await readFile(`${root}${catalogObservationSchemaPath}`);
if (fixtures.cases.length === 0 || fixtures.cases.length !== expected.cases.length) {
  throw new Error('Expected a non-empty, paired fixture and expected catalog');
}

const reviews = fixtures.cases.map((fixture, index) => {
  const normalized = expected.cases[index];
  if (fixture.id !== normalized.id) throw new Error(`Pair mismatch at ${index}`);
  return {
    id: fixture.id,
    contractRevision: fixtures.contractRevision,
    fixtureSha256: canonicalSha256(fixture),
    expectedRecordSha256: canonicalSha256(normalized),
    profileFileSha256: sha256(profileBytes),
    typedCaseFileSha256: sha256(typedCaseBytes),
    actionSchemaFileSha256: sha256(actionSchemaBytes),
    observationSchemaFileSha256: sha256(observationSchemaBytes),
    reviewerRole,
    reviewedAt: '2026-08-25',
  };
});

const registry = {
  $schema: 'patch-map-catalog-review-registry/1',
  contractRevision: fixtures.contractRevision,
  rule: 'Generation never approves semantics; each digest is recorded only after independent analysis-owner review.',
  reviewEvidence: reviewReports
    .map(({ domain, reportPath, sha256: reportSha256 }) => ({ domain, reportPath, sha256: reportSha256 }))
    .sort((left, right) => left.domain.localeCompare(right.domain)),
  reviews,
};
const registryBytes = serialized(registry);
const approvedCandidate = await buildCatalog({
  reviewRegistryOverride: {
    document: registry,
    sha256: sha256(Buffer.from(registryBytes)),
    byId: new Map(reviews.map((record) => [record.id, record])),
  },
});
if (approvedCandidate.manifest.reviewSummary.contractApproved !== reviews.length) {
  throw new Error('Refusing to record a review registry that does not approve the full catalog');
}
await mkdir(`${root}contracts/patch-map/evidence/reviews`, { recursive: true });
for (const report of reviewReports) {
  await writeFile(`${root}contracts/patch-map/${report.reportPath}`, report.bytes);
}
await writeFile(`${root}${catalogReviewPath}`, registryBytes);
console.log(`Recorded ${reviews.length} independent analysis-owner catalog reviews`);
