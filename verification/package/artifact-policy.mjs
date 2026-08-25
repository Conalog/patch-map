export const PACKAGE_NAME = '@conalog/patch-map';

const EXAMPLES = Object.freeze(['minimal', 'dashboard', 'editor', 'report']);

export const EXAMPLE_FILES = Object.freeze([
  'host-adapter.ts',
  ...EXAMPLES.map((name) => `${name}.ts`),
  'presentation.ts',
]);

export const PUBLIC_DOCS = Object.freeze([
  'docs/README.md',
  'docs/getting-started.md',
  'docs/api/data-and-targets.md',
  'docs/api/editor-workflows.md',
  'docs/api/mutations-and-history.md',
  'docs/api/pointer-and-selection.md',
  'docs/api/viewport-and-transform.md',
  'docs/api/presentation.md',
  'docs/api/assets-and-capture.md',
  'docs/api/text.md',
  'docs/integration/host.md',
  'docs/compatibility.md',
  'docs/assets/fonts.md',
  'docs/assets/fira-code-6.2-license.txt',
]);

const PUBLIC_EXAMPLES = Object.freeze(
  EXAMPLE_FILES.map((name) => `examples/${name}`),
);

const RESTRICTED_PACKAGE_PATHS = Object.freeze([
  /^docs\/engineering\//u,
  /^verification\//u,
  /^performance\//u,
  /^tests?\//u,
  /^fixtures?\//u,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/u,
]);

const PROHIBITED_PACKAGE_PATHS = Object.freeze({
  'source-map': Object.freeze([/\.map$/u]),
  'restricted-evidence': RESTRICTED_PACKAGE_PATHS,
  fixture: Object.freeze([/(?:^|\/)fixtures?(?:\/|$)/iu]),
  secret: Object.freeze([
    /(?:^|\/)\.env(?:\.|$)/iu,
    /(?:^|\/)(?:credentials?|secrets?)(?:\.|\/|$)/iu,
  ]),
  'dependency-bundle': Object.freeze([
    /(?:^|\/)node_modules(?:\/|$)/u,
    /(?:^|\/)vendor(?:\/|$)/iu,
    /(?:^|\/)dependency-bundle(?:\.|\/|$)/iu,
  ]),
});

export function projectPackedArtifactPolicy({ packRecord, files, sha256 }) {
  const sourceMaps = files.filter((file) => file.endsWith('.map'));
  const restrictedEvidence = files.filter((file) =>
    RESTRICTED_PACKAGE_PATHS.some((pattern) => pattern.test(file)));
  const missingDocs = PUBLIC_DOCS.filter((file) => !files.includes(file));
  const unexpectedDocs = files.filter((file) =>
    file.startsWith('docs/') && !PUBLIC_DOCS.includes(file));
  const missingExamples = PUBLIC_EXAMPLES.filter((file) => !files.includes(file));
  const prohibitedEntries = Object.entries(PROHIBITED_PACKAGE_PATHS)
    .flatMap(([category, patterns]) => files
      .filter((file) => patterns.some((pattern) => pattern.test(file)))
      .map((file) => Object.freeze({ category, path: file })))
    .filter((entry, index, entries) =>
      entries.findIndex((candidate) =>
        candidate.category === entry.category && candidate.path === entry.path) === index);
  return Object.freeze({
    sha256,
    filename: packRecord.filename,
    size: packRecord.size,
    unpackedSize: packRecord.unpackedSize,
    fileCount: files.length,
    sourceMapCount: sourceMaps.length,
    sourceMaps,
    restrictedEvidenceCount: restrictedEvidence.length,
    restrictedEvidence,
    publicDocs: PUBLIC_DOCS,
    publicExamples: PUBLIC_EXAMPLES,
    missingDocs,
    unexpectedDocs,
    missingExamples,
    prohibitedEntryCount: prohibitedEntries.length,
    prohibitedEntries: Object.freeze(prohibitedEntries),
  });
}

export function auditPackedHostAdapterSource(source) {
  const imports = [...source.matchAll(
    /import[\s\S]*?\sfrom\s+['"]([^'"]+)['"];?/gu,
  )].map((match) => match[1]);
  const restrictedImports = imports.filter((specifier) => specifier !== PACKAGE_NAME);
  const requiredDelegations = Object.freeze({
    load: '.data.replace(',
    lookup: '.targets.get(',
    'bulk-update': '.transaction(',
    selection: '.selection.set(',
    transform: '.transform.moveBy(',
    history: '.history.state',
    snapshot: '.debug.snapshot(',
    extract: '.capture.png(',
    destroy: '.destroy(',
  });
  const missingDelegations = Object.entries(requiredDelegations)
    .filter(([, marker]) => !source.includes(marker))
    .map(([capability]) => capability);
  const semanticReimplementationMarkers = [
    'CanvasRenderingContext2D',
    'WebGLRenderingContext',
    'requestAnimationFrame(',
    'createElement(\'canvas\')',
    'new PatchMapLogicalSceneIndex(',
    '.hitTest(',
    '.screenToWorld(',
  ];
  const semanticReimplementationMarkersFound = semanticReimplementationMarkers
    .filter((marker) => source.includes(marker));
  return Object.freeze({
    filename: 'examples/host-adapter.ts',
    imports: Object.freeze(imports),
    restrictedImportCount: restrictedImports.length,
    restrictedImports: Object.freeze(restrictedImports),
    missingDelegations: Object.freeze(missingDelegations),
    semanticReimplementationMarkersFound: Object.freeze(
      semanticReimplementationMarkersFound,
    ),
    adapterReimplementedEngineBehaviorCount:
      missingDelegations.length + semanticReimplementationMarkersFound.length,
  });
}
