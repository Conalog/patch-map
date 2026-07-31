import { readdir, readFile, realpath } from 'node:fs/promises';
import {
  basename,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const HANDLER_DIRECT_IMPORT = '../value-atoms.mjs';
const FOLD_DIRECT_IMPORT = './value-atoms.mjs';
const VALUE_ATOMS_FILENAME = 'value-atoms.mjs';
const CONTROL_MODULE_FILENAMES = new Set([
  'action-registry.mjs',
  'catalog.mjs',
  'compare.mjs',
  'evidence.mjs',
  'materialize.mjs',
  'observe.mjs',
]);
const NODE_ONLY_GLOBALS = new Set([
  'Buffer',
  'Bun',
  'Deno',
  '__dirname',
  '__filename',
  'exports',
  'global',
  'module',
  'process',
  'require',
]);
const DYNAMIC_CODE_GLOBALS = new Set([
  'Function',
  'eval',
  'importScripts',
]);
const BROWSER_GLOBAL_ROOTS = new Set([
  'globalThis',
  'window',
]);
const ALLOWED_DOTTED_BROWSER_GLOBALS = new Set([
  'globalThis.Math',
  'globalThis.performance',
]);
const EXPECTED_VALUE_TOKENS = new Set([
  'approvedExpected',
  'expectedCase',
  'normalizedExpected',
]);
const EXPECTED_VALUE_FILE = /(?:^|[/_.-])(?:approved|normalized)[-_.]?expected(?:[/_.-]|$)/iu;

export class PatchMapVerifierImportFirewallError extends Error {
  constructor(code, chain, detail) {
    super(`${code}: ${detail}; chain=${chain.join(' -> ')}`);
    this.name = 'PatchMapVerifierImportFirewallError';
    this.code = code;
    this.chain = Object.freeze([...chain]);
  }
}

export async function assertCoreV2ContractImportFirewall(
  contractRoot = new URL('./', import.meta.url),
) {
  const root = await realpath(fileURLToPathOrResolve(contractRoot));
  const handlerDirectory = resolve(root, 'handlers');
  const [handlerEntries, rootEntries] = await Promise.all([
    readdir(handlerDirectory, { withFileTypes: true }),
    readdir(root, { withFileTypes: true }),
  ]);
  const handlerFiles = handlerEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => resolve(handlerDirectory, entry.name))
    .sort();
  const foldFiles = rootEntries
    .filter((entry) => entry.isFile() && /^fold-[a-z0-9-]+\.mjs$/u.test(entry.name))
    .map((entry) => resolve(root, entry.name))
    .sort();

  for (const entryFile of handlerFiles) {
    await assertVerifierEntryImportFirewall({ contractRoot: root, entryFile, role: 'handler' });
  }
  for (const entryFile of foldFiles) {
    await assertVerifierEntryImportFirewall({ contractRoot: root, entryFile, role: 'fold' });
  }
  if (rootEntries.some((entry) => entry.isFile() && entry.name === VALUE_ATOMS_FILENAME)) {
    const valueAtoms = resolve(root, VALUE_ATOMS_FILENAME);
    await visitModule({
      root,
      file: valueAtoms,
      chain: [VALUE_ATOMS_FILENAME],
      directSpecifier: '',
      valueAtoms,
      leaf: true,
      visited: new Set(),
    });
  }

  return Object.freeze({
    handlerCount: handlerFiles.length,
    foldCount: foldFiles.length,
  });
}

export async function assertVerifierEntryImportFirewall({
  contractRoot,
  entryFile,
  role,
}) {
  if (role !== 'handler' && role !== 'fold') {
    throw new TypeError('verifier import firewall role must be handler or fold');
  }
  const root = await realpath(fileURLToPathOrResolve(contractRoot));
  const entry = await realpath(fileURLToPathOrResolve(entryFile));
  assertWithinContractRoot(root, entry, [displayPath(root, entry)]);
  const expectedEntry = role === 'handler'
    ? relative(resolve(root, 'handlers'), entry).split(sep).length === 1 &&
      basename(entry).endsWith('.mjs')
    : relative(root, entry).split(sep).length === 1 &&
      /^fold-[a-z0-9-]+\.mjs$/u.test(basename(entry));
  if (!expectedEntry) {
    fail('INVALID_ENTRY', [displayPath(root, entry)], `${role} entry is outside its owned directory`);
  }

  const directSpecifier = role === 'handler'
    ? HANDLER_DIRECT_IMPORT
    : FOLD_DIRECT_IMPORT;
  const valueAtoms = resolve(root, VALUE_ATOMS_FILENAME);
  await visitModule({
    root,
    file: entry,
    chain: [displayPath(root, entry)],
    directSpecifier,
    valueAtoms,
    leaf: false,
    visited: new Set(),
  });
}

async function visitModule({
  root,
  file,
  chain,
  directSpecifier,
  valueAtoms,
  leaf,
  visited,
}) {
  const physicalFile = await realpath(file);
  assertWithinContractRoot(root, physicalFile, chain);
  if (visited.has(physicalFile)) fail('IMPORT_CYCLE', chain, 'recursive module import cycle');
  visited.add(physicalFile);

  const source = await readFile(physicalFile, 'utf8');
  const tokens = tokenize(source);
  assertExpectedBlindSource(tokens, chain);
  assertSourceGlobalPolicy(tokens, chain, leaf);
  const links = collectModuleLinks(tokens, chain);

  for (const link of links) {
    if (link.specifier === null) {
      fail('NON_LITERAL_IMPORT', chain, `${link.kind} must use a literal module specifier`);
    }
    const target = await resolveRelativeImport(root, physicalFile, link.specifier, chain);
    const nextChain = [...chain, displayPath(root, target)];
    assertAllowedTarget(root, target, link.specifier, nextChain);
    if (leaf) {
      fail('LEAF_IMPORT', nextChain, `${VALUE_ATOMS_FILENAME} must remain import-free`);
    }
    if (link.kind !== 'import' || link.specifier !== directSpecifier || target !== valueAtoms) {
      fail(
        'DIRECT_IMPORT_NOT_ALLOWED',
        nextChain,
        `only ${JSON.stringify(directSpecifier)} may be imported directly`,
      );
    }
    await visitModule({
      root,
      file: target,
      chain: nextChain,
      directSpecifier,
      valueAtoms,
      leaf: true,
      visited,
    });
  }

  visited.delete(physicalFile);
}

async function resolveRelativeImport(root, importer, specifier, chain) {
  if (specifier.startsWith('node:')) {
    fail('NODE_IMPORT', chain, `Node import ${JSON.stringify(specifier)} is forbidden`);
  }
  if (isAbsoluteSpecifier(specifier)) {
    fail('ABSOLUTE_IMPORT', chain, `absolute import ${JSON.stringify(specifier)} is forbidden`);
  }
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    fail('BARE_IMPORT', chain, `bare import ${JSON.stringify(specifier)} is forbidden`);
  }
  const target = resolve(importer, '..', specifier);
  assertWithinContractRoot(root, target, [...chain, specifier]);
  try {
    const physicalTarget = await realpath(target);
    assertWithinContractRoot(root, physicalTarget, [...chain, specifier]);
    return physicalTarget;
  } catch (error) {
    if (error instanceof PatchMapVerifierImportFirewallError) throw error;
    fail('UNREADABLE_IMPORT', [...chain, specifier], 'relative import must resolve to a file');
  }
}

function assertAllowedTarget(root, target, specifier, chain) {
  const name = basename(target);
  const rootRelative = relative(root, target);
  if (EXPECTED_VALUE_FILE.test(specifier) || EXPECTED_VALUE_FILE.test(rootRelative)) {
    fail('EXPECTED_VALUE_FILE', chain, 'normalized or approved expected files are forbidden');
  }
  if (CONTROL_MODULE_FILENAMES.has(name)) {
    fail('CONTROL_MODULE_IMPORT', chain, `${name} is outside the expected-blind leaf boundary`);
  }
  if (rootRelative.startsWith(`handlers${sep}`) || /^fold-[a-z0-9-]+\.mjs$/u.test(name)) {
    fail('HANDLER_FOLD_IMPORT', chain, 'handlers and folds may not import each other');
  }
  if (!name.endsWith('.mjs')) {
    fail('NON_ESM_IMPORT', chain, 'verifier value imports must resolve to committed .mjs files');
  }
}

function assertWithinContractRoot(root, target, chain) {
  const rootRelative = relative(root, target);
  if (
    rootRelative === '..' ||
    rootRelative.startsWith(`..${sep}`) ||
    isAbsolute(rootRelative)
  ) {
    fail('OUTSIDE_CONTRACT_ROOT', chain, 'import leaves core-v2-contract');
  }
}

function assertExpectedBlindSource(tokens, chain) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === 'identifier' && EXPECTED_VALUE_TOKENS.has(token.value)) {
      fail('EXPECTED_VALUE_TOKEN', chain, `forbidden token ${JSON.stringify(token.value)}`);
    }
    if (token.kind === 'string') {
      const value = readStaticStringRun(tokens, index);
      if (EXPECTED_VALUE_FILE.test(value)) {
        fail('EXPECTED_VALUE_FILE', chain, `forbidden expected path ${JSON.stringify(value)}`);
      }
    }
  }
}

function readStaticStringRun(tokens, start) {
  let value = tokens[start].value;
  let index = start + 1;
  while (index < tokens.length) {
    if (tokens[index].kind === 'string') {
      value += tokens[index].value;
      index += 1;
      continue;
    }
    if (tokens[index].value === '+' && tokens[index + 1]?.kind === 'string') {
      value += tokens[index + 1].value;
      index += 2;
      continue;
    }
    break;
  }
  return value;
}

function assertSourceGlobalPolicy(tokens, chain, leaf) {
  const sourceName = chain.at(-1) ?? 'verifier source';
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === 'identifier' && NODE_ONLY_GLOBALS.has(token.value)) {
      fail('NODE_GLOBAL', chain, `${sourceName} uses Node-only global ${token.value}`);
    }
    if (token.kind === 'identifier' && DYNAMIC_CODE_GLOBALS.has(token.value)) {
      fail(
        'DYNAMIC_CODE_GLOBAL',
        chain,
        `${sourceName} uses dynamic code global ${token.value}`,
      );
    }
    if (leaf && token.kind === 'string' && token.escaped) {
      fail('ESCAPED_STRING', chain, `${VALUE_ATOMS_FILENAME} uses an escaped string token`);
    }
    if (isDynamicConstructorAccess(tokens, index)) {
      fail(
        'DYNAMIC_CONSTRUCTOR_ACCESS',
        chain,
        `${sourceName} uses dynamic constructor access`,
      );
    }
    const dottedRoot = token.kind === 'identifier' && (
      BROWSER_GLOBAL_ROOTS.has(token.value) ||
      (leaf && token.value === 'self')
    );
    if (!dottedRoot) continue;
    if (isComputedGlobalAccess(tokens, index)) {
      fail(
        'COMPUTED_GLOBAL_ACCESS',
        chain,
        `${sourceName} uses computed access from ${token.value}`,
      );
    }
    if (tokens[index + 1]?.value !== '.') {
      fail(
        'GLOBAL_ROOT_ESCAPE',
        chain,
        `${sourceName} passes or aliases browser global root ${token.value}`,
      );
    }
    const property = tokens[index + 2];
    const propertyName = property?.kind === 'identifier' ? property.value : '';
    if (NODE_ONLY_GLOBALS.has(propertyName) || DYNAMIC_CODE_GLOBALS.has(propertyName)) continue;
    if (!ALLOWED_DOTTED_BROWSER_GLOBALS.has(`${token.value}.${propertyName}`)) {
      fail(
        'GLOBAL_PROPERTY_NOT_ALLOWED',
        chain,
        `${sourceName} uses non-allowlisted browser global property ${token.value}.${propertyName}`,
      );
    }
  }
}

function isDynamicConstructorAccess(tokens, index) {
  const constructor = tokens[index];
  if (
    constructor?.kind !== 'identifier' ||
    constructor.value !== 'constructor' ||
    tokens[index - 1]?.value !== '.'
  ) {
    return false;
  }
  if (tokens[index + 1]?.value === '(') return true;
  if (
    tokens[index + 1]?.value === '?' &&
    tokens[index + 2]?.value === '.' &&
    tokens[index + 3]?.value === '('
  ) {
    return true;
  }
  return tokens[index + 1]?.value === '.' &&
    tokens[index + 2]?.kind === 'identifier' &&
    tokens[index + 2].value === 'constructor';
}

function isComputedGlobalAccess(tokens, index) {
  if (tokens[index + 1]?.value === '[') return true;
  return tokens[index + 1]?.value === '?' &&
    tokens[index + 2]?.value === '.' &&
    tokens[index + 3]?.value === '[';
}

function collectModuleLinks(tokens, chain) {
  const links = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== 'identifier') continue;
    if (token.value === 'import') {
      const next = tokens[index + 1];
      if (next?.value === '.') continue;
      if (next?.value === '(') {
        const specifier = tokens[index + 2];
        links.push({
          kind: 'dynamic-import',
          specifier: specifier?.kind === 'string' && !specifier.escaped
            ? specifier.value
            : null,
        });
        continue;
      }
      if (next?.kind === 'string') {
        links.push({ kind: 'import', specifier: next.escaped ? null : next.value });
        continue;
      }
      const fromIndex = findDeclarationToken(tokens, index + 1, 'from');
      const specifier = fromIndex === -1 ? undefined : tokens[fromIndex + 1];
      if (specifier?.kind !== 'string' || specifier.escaped) {
        fail('MALFORMED_IMPORT', chain, 'static import must have one literal specifier');
      }
      links.push({ kind: 'import', specifier: specifier.value });
      continue;
    }
    if (token.value === 'export') {
      const next = tokens[index + 1];
      if (next?.value !== '*' && next?.value !== '{') continue;
      const fromIndex = findDeclarationToken(tokens, index + 1, 'from');
      if (fromIndex === -1) continue;
      const specifier = tokens[fromIndex + 1];
      links.push({
        kind: 'export-from',
        specifier: specifier?.kind === 'string' && !specifier.escaped
          ? specifier.value
          : null,
      });
      continue;
    }
    if (token.value === 'require' && tokens[index + 1]?.value === '(') {
      const specifier = tokens[index + 2];
      links.push({
        kind: 'require',
        specifier: specifier?.kind === 'string' && !specifier.escaped
          ? specifier.value
          : null,
      });
    }
  }
  return links;
}

function findDeclarationToken(tokens, startIndex, value) {
  for (let index = startIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === ';') return -1;
    if (tokens[index].kind === 'identifier' && tokens[index].value === value) return index;
  }
  return -1;
}

function tokenize(source) {
  return tokenizeRange(source, 0, false).tokens;
}

function tokenizeRange(source, start, stopAtClosingBrace) {
  const tokens = [];
  let index = start;
  let braceDepth = 0;
  while (index < source.length) {
    const value = source[index];
    const next = source[index + 1];
    if (/\s/u.test(value)) {
      index += 1;
      continue;
    }
    if (value === '/' && next === '/') {
      index = skipLineComment(source, index + 2);
      continue;
    }
    if (value === '/' && next === '*') {
      index = skipBlockComment(source, index + 2);
      continue;
    }
    if (value === '"' || value === "'") {
      const token = readStringToken(source, index, value);
      tokens.push(token);
      index = token.end;
      continue;
    }
    if (value === '`') {
      const template = readTemplate(source, index + 1);
      tokens.push(...template.tokens);
      index = template.end;
      continue;
    }
    const identifier = readIdentifierToken(source, index);
    if (identifier !== null) {
      tokens.push(identifier);
      index = identifier.end;
      continue;
    }
    if (stopAtClosingBrace && value === '}' && braceDepth === 0) {
      return { tokens, end: index + 1 };
    }
    if (stopAtClosingBrace && value === '{') braceDepth += 1;
    if (stopAtClosingBrace && value === '}') braceDepth -= 1;
    tokens.push({ kind: 'punctuator', value });
    index += 1;
  }
  return { tokens, end: source.length };
}

function readStringToken(source, start, quote) {
  let containsEscape = false;
  let value = '';
  let index = start + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      const escape = readStringEscape(source, index);
      containsEscape = true;
      value += escape.value;
      index = escape.end;
      continue;
    }
    if (character === quote) {
      return { kind: 'string', value, escaped: containsEscape, end: index + 1 };
    }
    value += character;
    index += 1;
  }
  return { kind: 'string', value, escaped: true, end: source.length };
}

function readIdentifierToken(source, start) {
  const first = readIdentifierCharacter(source, start, true);
  if (first === null) return null;
  let value = first.value;
  let escaped = first.escaped;
  let index = first.end;
  while (index < source.length) {
    const next = readIdentifierCharacter(source, index, false);
    if (next === null) break;
    value += next.value;
    escaped ||= next.escaped;
    index = next.end;
  }
  return { kind: 'identifier', value, escaped, end: index };
}

function readIdentifierCharacter(source, index, start) {
  const character = source[index];
  const allowed = start ? /[A-Za-z_$]/u : /[A-Za-z0-9_$]/u;
  if (allowed.test(character)) {
    return { value: character, escaped: false, end: index + 1 };
  }
  const escape = readUnicodeEscape(source, index);
  if (escape === null || !allowed.test(escape.value)) return null;
  return { value: escape.value, escaped: true, end: escape.end };
}

function readStringEscape(source, start) {
  const unicode = readUnicodeEscape(source, start);
  if (unicode !== null) return unicode;
  if (source[start + 1] === 'x') {
    const digits = source.slice(start + 2, start + 4);
    if (/^[0-9A-Fa-f]{2}$/u.test(digits)) {
      return { value: String.fromCodePoint(Number.parseInt(digits, 16)), end: start + 4 };
    }
  }
  const character = source[start + 1];
  const simple = {
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
  };
  return {
    value: character === '\n' || character === '\r' ? '' : (simple[character] ?? character ?? ''),
    end: Math.min(start + 2, source.length),
  };
}

function readUnicodeEscape(source, start) {
  if (source[start] !== '\\' || source[start + 1] !== 'u') return null;
  if (source[start + 2] === '{') {
    const close = source.indexOf('}', start + 3);
    if (close === -1) return null;
    const digits = source.slice(start + 3, close);
    if (!/^[0-9A-Fa-f]{1,6}$/u.test(digits)) return null;
    const codePoint = Number.parseInt(digits, 16);
    if (codePoint > 0x10ffff) return null;
    return { value: String.fromCodePoint(codePoint), end: close + 1 };
  }
  const digits = source.slice(start + 2, start + 6);
  if (!/^[0-9A-Fa-f]{4}$/u.test(digits)) return null;
  return { value: String.fromCodePoint(Number.parseInt(digits, 16)), end: start + 6 };
}

function skipLineComment(source, start) {
  const end = source.indexOf('\n', start);
  return end === -1 ? source.length : end + 1;
}

function skipBlockComment(source, start) {
  const end = source.indexOf('*/', start);
  return end === -1 ? source.length : end + 2;
}

function readTemplate(source, start) {
  const tokens = [];
  let value = '';
  let containsEscape = false;
  let index = start;
  const pushStringToken = () => {
    if (value.length > 0 || containsEscape) {
      tokens.push({ kind: 'string', value, escaped: containsEscape });
    }
    value = '';
    containsEscape = false;
  };
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      const escape = readStringEscape(source, index);
      containsEscape = true;
      value += escape.value;
      index = escape.end;
      continue;
    }
    if (character === '`') {
      pushStringToken();
      return { tokens, end: index + 1 };
    }
    if (character === '$' && source[index + 1] === '{') {
      pushStringToken();
      const expression = tokenizeRange(source, index + 2, true);
      tokens.push(...expression.tokens);
      index = expression.end;
      continue;
    }
    value += character;
    index += 1;
  }
  pushStringToken();
  return { tokens, end: source.length };
}

function isAbsoluteSpecifier(specifier) {
  return isAbsolute(specifier) ||
    /^[A-Za-z]:[\\/]/u.test(specifier) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(specifier);
}

function fileURLToPathOrResolve(value) {
  return value instanceof URL ? fileURLToPath(value) : resolve(value);
}

function displayPath(root, file) {
  const rootRelative = relative(root, file);
  return rootRelative.length === 0 ? '.' : rootRelative.split(sep).join('/');
}

function fail(code, chain, detail) {
  throw new PatchMapVerifierImportFirewallError(code, chain, detail);
}
