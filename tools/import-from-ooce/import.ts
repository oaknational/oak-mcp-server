import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseAllDocuments } from 'yaml';

type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type Sha40 = Brand<string, 'Sha40'>;
type RepoPath = Brand<string, 'RepoPath'>;
type OocePath = Brand<string, 'OocePath'>;
type PackageDir = Brand<string, 'PackageDir'>;
type PackageFile = Brand<string, 'PackageFile'>;
type SuppliedSource = Brand<string, 'SuppliedSource'>;
type PackageName = Brand<string, 'PackageName'>;
/** A `./` path inside the package, as package.json `exports` needs. */
type ExportTarget = Brand<string, 'ExportTarget'>;
type Exports = Record<string, ExportTarget | Record<string, ExportTarget> | null>;
type DependencySection = (typeof DEPENDENCY_SECTIONS)[number];

interface Drop {
  path: PackageFile;
  reason: string;
}
interface TextEdit {
  path: PackageFile;
  find: string;
  replace: string;
  wholeLine: boolean;
  reason: string | undefined;
}
interface Move {
  from: string;
  to: PackageFile;
  directory: boolean;
}
interface SourceSpec {
  from: OocePath;
  moves: Move[];
  drop: Drop[];
  pick: boolean;
}
interface SuppliedFile {
  from: SuppliedSource;
  to: PackageFile;
}
interface PackageSpec {
  name: PackageName;
  to: PackageDir;
  sources: SourceSpec[];
  drop: Drop[];
  edits: TextEdit[];
  keepText: Drop[];
  supplied: SuppliedFile[];
  exports: Exports;
  removeDependencies: string[];
  addDependencies: Partial<Record<DependencySection, Record<string, string>>>;
  scripts: Record<string, string | null>;
  fields: Record<string, unknown>;
}
interface Manifest {
  scope: { from: string; to: string };
  repository: string;
  dropEverywhere: Drop[];
  removeScripts: string[];
  removeDependencies: string[];
  textRewrites: { find: string; replace: string }[];
  edits: TextEdit[];
  packages: PackageSpec[];
}

export interface OoceSource {
  sha: Sha40;
  list(dir: OocePath): OocePath[];
  read(path: OocePath): Buffer;
}

type PlannedFile = { path: RepoPath; bytes: Buffer } & (
  | { kind: 'copied'; source: OocePath }
  | { kind: 'modified'; source: OocePath }
  | { kind: 'supplied'; source: SuppliedSource }
);
interface PackagePlan {
  spec: PackageSpec;
  files: PlannedFile[];
  dropped: { source: string; reason: string; files: number }[];
}
type LockedVersions = Map<string, Record<string, string>>;
type SuppliedContents = ReadonlyMap<SuppliedSource, Buffer>;
export interface TestCount {
  tests: number;
  skipped: number;
}
interface CountFilter {
  exclude: readonly string[];
  include: readonly string[];
}
type CountTests = (directory: string, filter: CountFilter) => TestCount;

const MANIFEST_PATH = 'tools/import-from-ooce/manifest.json';
const IMPORTED_PATH = 'tools/import-from-ooce/imported.json';
const COUNTS_PATH = 'tools/import-from-ooce/expected-counts.json';
const SUPPLIED_PREFIX = 'tools/import-from-ooce/supplied/';
const PACKAGE_ROOTS = new Set(['packages', 'apps']);
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PROVENANCE_PATH = 'PROVENANCE.md';
const PIN_PREFIX = 'Pinned OOCE import SHA: `';
const ENTRIES_HEADING = '## Entries';
const UNMANAGED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo']);
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
const MANAGED_FIELDS = new Set([
  'name',
  'scripts',
  'exports',
  'repository',
  'bugs',
  'homepage',
  'author',
  'contributors',
  ...DEPENDENCY_SECTIONS,
]);

function fail(message: string): never {
  throw new Error(message);
}

function parseSha(value: string): Sha40 {
  return /^[0-9a-f]{40}$/.test(value) ? (value as Sha40) : fail(`not a 40 character SHA: ${value}`);
}

export function resolveSha(requested: string | undefined, pin: Sha40): Sha40 {
  if (requested !== undefined && parseSha(requested) !== pin) {
    fail(
      `--sha ${requested} differs from the pin ${pin} in ${PROVENANCE_PATH}. Change the pin by editing that line.`,
    );
  }
  return pin;
}

function parsePath(value: string): string {
  const segments = value.split('/');
  const bad = value === '' || value.startsWith('/') || value.includes('\\');
  return bad || segments.some((s) => s === '..' || s === '' || s === '.')
    ? fail(`not a clean relative path: ${value}`)
    : value;
}

function repoPath(value: string): RepoPath {
  return parsePath(value) as RepoPath;
}

export function oocePath(value: string): OocePath {
  return parsePath(value) as OocePath;
}

function packageFile(value: string): PackageFile {
  return parsePath(value) as PackageFile;
}

function packageDir(value: string, where: string): PackageDir {
  const [root, name, ...rest] = value.split('/');
  return root !== undefined &&
    PACKAGE_ROOTS.has(root) &&
    name !== undefined &&
    NAME_PATTERN.test(name) &&
    rest.length === 0
    ? (value as PackageDir)
    : fail(`${where} must be packages/<name> or apps/<name>, not ${value}`);
}

function suppliedSource(value: string, where: string): SuppliedSource {
  return value.startsWith(SUPPLIED_PREFIX) && parsePath(value) === value
    ? (value as SuppliedSource)
    : fail(`${where} must be a file under ${SUPPLIED_PREFIX}, not ${value}`);
}

function packageNameSegment(value: string, where: string): PackageName {
  return NAME_PATTERN.test(value)
    ? (value as PackageName)
    : fail(`${where} must match ${String(NAME_PATTERN)}, not ${value}`);
}

function dotPath(value: string, where: string): string {
  if (!value.startsWith('./')) {
    fail(`${where} must be a ./ path inside the package, not ${value}`);
  }
  parsePath(value.slice(2));
  return value;
}

function exportTarget(value: unknown, where: string): ExportTarget {
  return dotPath(asString(value, where), where) as ExportTarget;
}

function parseExports(value: unknown, where: string): Exports {
  const record = asRecord(value ?? {}, where);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      const at = `${where}.${key}`;
      if (key !== '.') {
        dotPath(key, `${at} key`);
      }
      return [
        key,
        entry === null
          ? null
          : typeof entry === 'string'
            ? exportTarget(entry, at)
            : Object.fromEntries(
                Object.entries(asRecord(entry, at)).map(([condition, target]) => [
                  condition,
                  exportTarget(target, `${at}.${condition}`),
                ]),
              ),
      ];
    }),
  );
}

type Json = Record<string, unknown>;

function asRecord(value: unknown, where: string, keys?: readonly string[]): Json {
  const record =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Json)
      : fail(`${where} must be an object`);
  const unknown = keys === undefined ? [] : Object.keys(record).filter((k) => !keys.includes(k));
  return unknown.length === 0 ? record : fail(`${where} has an unknown key: ${unknown.join(', ')}`);
}

function asString(value: unknown, where: string): string {
  return typeof value === 'string' ? value : fail(`${where} must be a string`);
}

function asList<T>(value: unknown, where: string, parse: (item: unknown, at: string) => T): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value)
    ? value.map((item, i) => parse(item, `${where}[${String(i)}]`))
    : fail(`${where} must be an array`);
}

function parseDrop(value: unknown, where: string): Drop {
  const record = asRecord(value, where, ['path', 'reason']);
  const reason = asString(record['reason'], `${where}.reason`);
  const path = asString(record['path'], `${where}.path`);
  const directory = path.endsWith('/');
  packageFile(directory ? path.slice(0, -1) : path);
  return reason.trim() === ''
    ? fail(`${where}.reason must explain the drop`)
    : { path: path as PackageFile, reason };
}

function dropMatches(drop: Drop, relative: string): boolean {
  return drop.path.endsWith('/') ? relative.startsWith(drop.path) : drop.path === relative;
}

function parseEdit(value: unknown, where: string): TextEdit {
  const record = asRecord(value, where, ['path', 'find', 'replace', 'wholeLine', 'reason']);
  const find = asString(record['find'], `${where}.find`);
  const reason =
    record['reason'] === undefined ? undefined : asString(record['reason'], `${where}.reason`);
  if (find === '') {
    fail(`${where}.find must not be empty`);
  }
  if (reason?.trim() === '') {
    fail(`${where}.reason must explain the edit`);
  }
  return {
    path: packageFile(asString(record['path'], `${where}.path`)),
    find,
    replace: asString(record['replace'], `${where}.replace`),
    wholeLine: record['wholeLine'] === true,
    reason,
  };
}

function parseMove(from: string, to: unknown, where: string): Move {
  const target = asString(to, where);
  const directory = from.endsWith('/');
  if (target.endsWith('/') !== directory) {
    fail(`${where}: a directory move needs a trailing slash on both sides`);
  }
  const strip = (path: string): string => (directory ? path.slice(0, -1) : path);
  return { from: parsePath(strip(from)), to: packageFile(strip(target)), directory };
}

function parseSource(value: unknown, where: string): SourceSpec {
  const record = asRecord(value, where, ['from', 'moves', 'drop', 'pick']);
  const moves = asRecord(record['moves'] ?? {}, `${where}.moves`);
  const pick = record['pick'] ?? false;
  if (typeof pick !== 'boolean') {
    fail(`${where}.pick must be true or false`);
  }
  return {
    from: oocePath(asString(record['from'], `${where}.from`)),
    moves: Object.entries(moves).map(([from, to]) => parseMove(from, to, `${where}.moves.${from}`)),
    drop: asList(record['drop'], `${where}.drop`, parseDrop),
    pick,
  };
}

function parseAddDependencies(value: unknown, where: string): PackageSpec['addDependencies'] {
  const record = asRecord(value ?? {}, where, DEPENDENCY_SECTIONS);
  return Object.fromEntries(
    Object.entries(record).map(([section, entries]) => [
      section,
      Object.fromEntries(
        Object.entries(asRecord(entries, `${where}.${section}`)).map(([name, range]) => [
          name,
          asString(range, `${where}.${section}.${name}`),
        ]),
      ),
    ]),
  );
}

function parseScripts(value: unknown, where: string): PackageSpec['scripts'] {
  return Object.fromEntries(
    Object.entries(asRecord(value ?? {}, where)).map(([name, command]) => [
      name,
      command === null ? null : asString(command, `${where}.${name}`),
    ]),
  );
}

function parseFields(value: unknown, where: string): PackageSpec['fields'] {
  const record = asRecord(value ?? {}, where);
  const managed = Object.keys(record).filter((key) => MANAGED_FIELDS.has(key));
  return managed.length === 0
    ? record
    : fail(`${where} fields cannot set ${managed.join(', ')}, which the tool manages`);
}

function parseSupplied(value: unknown, where: string): SuppliedFile {
  const record = asRecord(value, where, ['from', 'to']);
  return {
    from: suppliedSource(asString(record['from'], `${where}.from`), `${where}.from`),
    to: packageFile(asString(record['to'], `${where}.to`)),
  };
}

function parsePackage(value: unknown, where: string): PackageSpec {
  const record = asRecord(value, where, [
    'name',
    'to',
    'sources',
    'drop',
    'edits',
    'keepText',
    'supplied',
    'exports',
    'removeDependencies',
    'addDependencies',
    'scripts',
    'fields',
  ]);
  const sources = asList(record['sources'], `${where}.sources`, parseSource);
  if (sources.length === 0) {
    fail(`${where}.sources needs at least one source`);
  }
  if (sources[0]?.pick === true) {
    fail(`${where}.sources[0] is the package's own source and cannot pick`);
  }
  return {
    name: packageNameSegment(asString(record['name'], `${where}.name`), `${where}.name`),
    to: packageDir(asString(record['to'], `${where}.to`), `${where}.to`),
    sources,
    drop: asList(record['drop'], `${where}.drop`, parseDrop),
    edits: asList(record['edits'], `${where}.edits`, parseEdit),
    keepText: asList(record['keepText'], `${where}.keepText`, parseDrop),
    supplied: asList(record['supplied'], `${where}.supplied`, parseSupplied),
    exports: parseExports(record['exports'], `${where}.exports`),
    removeDependencies: asList(
      record['removeDependencies'],
      `${where}.removeDependencies`,
      asString,
    ),
    addDependencies: parseAddDependencies(record['addDependencies'], `${where}.addDependencies`),
    scripts: parseScripts(record['scripts'], `${where}.scripts`),
    fields: parseFields(record['fields'], `${where}.fields`),
  };
}

export function parseManifest(raw: unknown): Manifest {
  const record = asRecord(raw, 'manifest', [
    'scope',
    'repository',
    'dropEverywhere',
    'removeScripts',
    'removeDependencies',
    'textRewrites',
    'edits',
    'packages',
  ]);
  const scope = asRecord(record['scope'], 'manifest.scope', ['from', 'to']);
  const manifest: Manifest = {
    scope: {
      from: asString(scope['from'], 'manifest.scope.from'),
      to: asString(scope['to'], 'manifest.scope.to'),
    },
    repository: asString(record['repository'], 'manifest.repository'),
    dropEverywhere: asList(record['dropEverywhere'], 'manifest.dropEverywhere', parseDrop),
    removeScripts: asList(record['removeScripts'], 'manifest.removeScripts', asString),
    removeDependencies: asList(
      record['removeDependencies'],
      'manifest.removeDependencies',
      asString,
    ),
    textRewrites: asList(record['textRewrites'], 'manifest.textRewrites', (item, at) => {
      const rewrite = asRecord(item, at, ['find', 'replace']);
      return {
        find: asString(rewrite['find'], `${at}.find`),
        replace: asString(rewrite['replace'], `${at}.replace`),
      };
    }),
    edits: asList(record['edits'], 'manifest.edits', parseEdit),
    packages: asList(record['packages'], 'manifest.packages', parsePackage),
  };
  const destinations = manifest.packages.map((p) => p.to);
  if (new Set(destinations).size !== destinations.length) {
    fail('two manifest packages share a destination');
  }
  return manifest;
}

function isText(bytes: Buffer): boolean {
  return !bytes.subarray(0, 8192).includes(0);
}

function replaceAll(text: string, find: string, replace: string): string {
  return text.split(find).join(replace);
}

function rewriteUnlessAfterParentDir(text: string, find: string, replace: string): string {
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(?<!\\.\\./)${escaped}`, 'g'), () => replace);
}

function applyEdit(text: string, edit: TextEdit, where: string): string {
  if (!text.includes(edit.find)) {
    fail(`edit matched nothing in ${where}: ${JSON.stringify(edit.find)}`);
  }
  if (!edit.wholeLine) {
    return replaceAll(text, edit.find, edit.replace);
  }
  return text
    .split('\n')
    .flatMap((line) =>
      line.includes(edit.find) ? (edit.replace === '' ? [] : [edit.replace]) : [line],
    )
    .join('\n');
}

function destinationPackageNames(manifest: Manifest): Set<string> {
  return new Set(manifest.packages.map((p) => packageName(manifest, p)));
}

function packageName(manifest: Manifest, spec: PackageSpec): string {
  return renameScope(manifest, `${manifest.scope.from}${spec.name}`);
}

function renameScope(manifest: Manifest, name: string): string {
  return name.startsWith(manifest.scope.from)
    ? manifest.scope.to + name.slice(manifest.scope.from.length)
    : name;
}

function mergeSection(into: Json, from: Json, section: string, owner: string): void {
  const target = asRecord(into[section] ?? {}, `${owner} ${section}`);
  for (const [name, range] of Object.entries(from)) {
    const existing = target[name];
    if (existing !== undefined && existing !== range) {
      fail(
        `${owner} ${section}: ${name} is ${JSON.stringify(existing)} and ${JSON.stringify(range)}`,
      );
    }
    target[name] = range;
  }
  into[section] = Object.fromEntries(Object.entries(target).sort(([a], [b]) => a.localeCompare(b)));
}

function lockedVersions(source: OoceSource): LockedVersions {
  const documents = parseAllDocuments(source.read(oocePath('pnpm-lock.yaml')).toString('utf8'))
    .map((document) => document.toJS() as unknown)
    .filter((value) => typeof value === 'object' && value !== null && 'importers' in value);
  const lock = asRecord(documents.at(-1), 'pnpm-lock.yaml importers document');
  const locked: LockedVersions = new Map();
  for (const [importer, entry] of Object.entries(asRecord(lock['importers'], 'importers'))) {
    const dependencies = asRecord(asRecord(entry, importer)['dependencies'] ?? {}, importer);
    locked.set(
      importer,
      Object.fromEntries(
        Object.entries(dependencies).map(([name, resolved]) => [
          name,
          asString(asRecord(resolved, name)['version'], `${importer} ${name}`).replace(/\(.*$/, ''),
        ]),
      ),
    );
  }
  return locked;
}

function transformPackageJson(
  manifest: Manifest,
  spec: PackageSpec,
  primary: Json,
  secondaries: Json[],
  pins: Record<string, string>,
): Json {
  const out: Json = structuredClone(primary);
  const owner = spec.name;
  const removed = new Set([...manifest.removeDependencies, ...spec.removeDependencies]);
  const selfNames = new Set(
    [primary, ...secondaries].map((json) => asString(json['name'], `${owner} name`)),
  );
  for (const secondary of secondaries) {
    for (const section of DEPENDENCY_SECTIONS) {
      if (secondary[section] !== undefined) {
        mergeSection(out, asRecord(secondary[section], `${owner} ${section}`), section, owner);
      }
    }
  }
  const dependencies = asRecord(out['dependencies'] ?? {}, `${owner} dependencies`);
  for (const name of Object.keys(dependencies)) {
    const pinned = pins[name];
    if (pinned !== undefined && !String(dependencies[name]).startsWith('workspace:')) {
      dependencies[name] = pinned;
    }
  }
  delete out['author'];
  delete out['contributors'];
  out['name'] = packageName(manifest, spec);
  const scripts = asRecord(out['scripts'] ?? {}, `${owner} scripts`);
  for (const script of manifest.removeScripts) {
    Reflect.deleteProperty(scripts, script);
  }
  for (const [script, command] of Object.entries(spec.scripts)) {
    if (command === null) {
      Reflect.deleteProperty(scripts, script);
    } else {
      scripts[script] = command;
    }
  }
  if (out['scripts'] !== undefined || Object.keys(scripts).length > 0) {
    out['scripts'] = scripts;
  }
  for (const [field, value] of Object.entries(spec.fields)) {
    if (value === null) {
      Reflect.deleteProperty(out, field);
    } else {
      out[field] = value;
    }
  }
  for (const [section, entries] of Object.entries(spec.addDependencies)) {
    mergeSection(out, entries, section, owner);
  }
  const moved = destinationPackageNames(manifest);
  for (const section of DEPENDENCY_SECTIONS) {
    if (out[section] === undefined) {
      continue;
    }
    const kept: Json = {};
    for (const [name, range] of Object.entries(asRecord(out[section], `${owner} ${section}`))) {
      if (removed.has(name) || selfNames.has(name)) {
        continue;
      }
      const renamed = renameScope(manifest, name);
      if (String(range).startsWith('workspace:') && !moved.has(renamed)) {
        fail(
          `${owner} ${section}: ${name} is a workspace reference to a package that is not moved`,
        );
      }
      kept[renamed] = range;
    }
    out[section] = kept;
  }
  if (Object.keys(spec.exports).length > 0) {
    const merged = { ...asRecord(out['exports'], `${owner} exports`), ...spec.exports };
    out['exports'] = Object.fromEntries(
      Object.entries(merged).filter(([, target]) => target !== null),
    );
  }
  if (out['repository'] !== undefined) {
    out['repository'] = { type: 'git', url: `git+${manifest.repository}.git`, directory: spec.to };
  }
  if (out['bugs'] !== undefined) {
    out['bugs'] = { url: `${manifest.repository}/issues` };
  }
  if (out['homepage'] !== undefined) {
    out['homepage'] = `${manifest.repository}/tree/main/${spec.to}#readme`;
  }
  return out;
}

function movedPath(relative: string, moves: Move[]): string | undefined {
  for (const move of moves) {
    if (move.directory && relative.startsWith(`${move.from}/`)) {
      return `${move.to}${relative.slice(move.from.length)}`;
    }
    if (!move.directory && relative === move.from) {
      return move.to;
    }
  }
  return undefined;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface Gathered {
  destination: string;
  source: OocePath;
  bytes: Buffer;
}

function gather(
  manifest: Manifest,
  spec: PackageSpec,
  source: OoceSource,
): { gathered: Gathered[]; dropped: PackagePlan['dropped']; secondaryJson: Json[] } {
  const gathered: Gathered[] = [];
  const dropped: PackagePlan['dropped'] = [];
  const secondaryJson: Json[] = [];
  spec.sources.forEach((src, index) => {
    const drops = [...manifest.dropEverywhere, ...(index === 0 ? spec.drop : src.drop)];
    const used = new Set<string>();
    for (const file of source.list(src.from)) {
      const relative = file.slice(src.from.length + 1);
      if (src.pick && movedPath(relative, src.moves) === undefined) {
        continue;
      }
      const drop = drops.find((d) => dropMatches(d, relative));
      if (index > 0 && relative === 'package.json') {
        secondaryJson.push(asRecord(JSON.parse(source.read(file).toString('utf8')), file));
      }
      if (drop !== undefined) {
        used.add(drop.path);
        const directory = `${src.from}/${drop.path}`;
        const grouped = dropped.find((d) => d.source === directory);
        if (grouped !== undefined) {
          grouped.files += 1;
        } else {
          dropped.push({
            source: drop.path.endsWith('/') ? directory : file,
            reason: drop.reason,
            files: 1,
          });
        }
        continue;
      }
      const destination = index === 0 ? relative : movedPath(relative, src.moves);
      if (destination === undefined) {
        fail(`${file} is neither moved nor dropped in ${spec.name}`);
      }
      gathered.push({ destination, source: file, bytes: source.read(file) });
    }
    const own = index === 0 ? spec.drop : src.drop;
    const unused = own.filter((d) => !used.has(d.path) && d.path !== 'package.json');
    if (unused.length > 0) {
      fail(`${spec.name} drops a file the source lacks: ${unused.map((d) => d.path).join(', ')}`);
    }
  });
  return { gathered, dropped, secondaryJson };
}

function transformText(
  manifest: Manifest,
  spec: PackageSpec,
  item: Gathered,
  sha: Sha40,
  matched: Set<TextEdit>,
): Buffer {
  if (item.destination === 'package.json' || !isText(item.bytes)) {
    return item.bytes;
  }
  let text = item.bytes.toString('utf8');
  for (const edit of manifest.edits) {
    if (edit.path === item.destination && text.includes(edit.find)) {
      matched.add(edit);
      text = applyEdit(text, edit, `${spec.to}/${item.destination}`);
    }
  }
  for (const edit of spec.edits) {
    if (edit.path === item.destination) {
      text = applyEdit(text, edit, `${spec.to}/${item.destination}`);
    }
  }
  const rewrites = spec.keepText.some((keep) => keep.path === item.destination)
    ? []
    : manifest.textRewrites;
  for (const rewrite of rewrites) {
    text = rewriteUnlessAfterParentDir(
      text,
      rewrite.find,
      replaceAll(rewrite.replace, '{sha}', sha),
    );
  }
  if (manifest.scope.from !== manifest.scope.to) {
    text = replaceAll(text, manifest.scope.from, manifest.scope.to);
  }
  return Buffer.from(text);
}

function planPackage(
  manifest: Manifest,
  spec: PackageSpec,
  source: OoceSource,
  supplied: SuppliedContents,
  locked: LockedVersions,
  sha: Sha40,
  matched: Set<TextEdit>,
): PackagePlan {
  const { gathered, dropped, secondaryJson } = gather(manifest, spec, source);
  const pins: Record<string, string> = {};
  for (const src of spec.sources) {
    Object.assign(pins, locked.get(src.from));
  }
  const seen = new Set<string>();
  const files: PlannedFile[] = [];
  for (const item of gathered) {
    if (seen.has(item.destination)) {
      fail(`${spec.name} writes ${item.destination} twice`);
    }
    seen.add(item.destination);
    const bytes =
      item.destination === 'package.json'
        ? Buffer.from(
            `${JSON.stringify(
              transformPackageJson(
                manifest,
                spec,
                asRecord(JSON.parse(item.bytes.toString('utf8')), `${spec.name} package.json`),
                secondaryJson,
                pins,
              ),
              null,
              2,
            )}\n`,
          )
        : transformText(manifest, spec, item, sha, matched);
    files.push({
      kind: bytes.equals(item.bytes) ? 'copied' : 'modified',
      path: repoPath(`${spec.to}/${item.destination}`),
      source: item.source,
      bytes,
    });
  }
  for (const edit of [...spec.edits, ...spec.keepText]) {
    if (!seen.has(edit.path)) {
      fail(`${spec.name} edits ${edit.path}, which it does not write`);
    }
  }
  for (const file of spec.supplied) {
    if (seen.has(file.to)) {
      fail(`${spec.name} supplies ${file.to}, which is also imported`);
    }
    files.push({
      kind: 'supplied',
      path: repoPath(`${spec.to}/${file.to}`),
      source: file.from,
      bytes: supplied.get(file.from) ?? fail(`${file.from} was not read`),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { spec, files, dropped };
}

function describePackage(manifest: Manifest, plan: PackagePlan, sha: Sha40): string {
  const prefix = `${plan.spec.to}/`;
  const listing = (kind: PlannedFile['kind']): string[] =>
    plan.files.filter((f) => f.kind === kind).map((f) => `\`${f.path.slice(prefix.length)}\``);
  const lines = [
    `### \`${plan.spec.to}\``,
    '',
    `- Source: ${plan.spec.sources.map((s) => `\`${s.from}\``).join(', ')} at \`${sha}\`.`,
    `- Copied unchanged: ${String(listing('copied').length)} files.`,
  ];
  const modified = listing('modified');
  if (modified.length > 0) {
    lines.push(`- Modified by the tool: ${modified.join(', ')}.`);
  }
  const written = new Set(plan.files.map((f) => f.path.slice(prefix.length)));
  const reasons = [...manifest.edits, ...plan.spec.edits].flatMap((edit) =>
    edit.reason === undefined || !written.has(edit.path)
      ? []
      : [`- Modified \`${edit.path}\`. ${edit.reason}`],
  );
  lines.push(...[...new Set(reasons)].sort());
  for (const keep of plan.spec.keepText) {
    lines.push(`- Kept OOCE's relative paths in \`${keep.path}\`. ${keep.reason}`);
  }
  const supplied = listing('supplied');
  if (supplied.length > 0) {
    lines.push(`- Supplied from this repository: ${supplied.join(', ')}.`);
  }
  for (const drop of plan.dropped) {
    lines.push(
      drop.files === 1
        ? `- Dropped \`${drop.source}\`. ${drop.reason}`
        : `- Dropped \`${drop.source}\` (${String(drop.files)} files). ${drop.reason}`,
    );
  }
  return lines.join('\n');
}

function pinnedSha(provenance: string): Sha40 {
  const line = provenance.split('\n').find((l) => l.startsWith(PIN_PREFIX));
  return line === undefined
    ? fail(`${PROVENANCE_PATH} has no pinned SHA line`)
    : parseSha(line.slice(PIN_PREFIX.length).replace(/`.*$/, ''));
}

function renderProvenance(
  current: string,
  manifest: Manifest,
  plans: PackagePlan[],
  sha: Sha40,
): string {
  const at = current.indexOf(`${ENTRIES_HEADING}\n`);
  const head = at === -1 ? `${current.trimEnd()}\n\n` : current.slice(0, at);
  const body = plans.map((plan) => describePackage(manifest, plan, sha)).join('\n\n');
  return `${head}${ENTRIES_HEADING}\n\n${body === '' ? 'None yet.' : body}\n`;
}

function json(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function renderImported(plans: PackagePlan[]): Buffer {
  const entries = plans
    .flatMap((plan) => plan.files)
    .filter((file) => file.kind === 'copied')
    .map((file): [string, string] => [file.path, `sha256:${sha256(file.bytes)}`])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return json({ files: Object.fromEntries(entries) });
}

function renderCounts(manifest: Manifest, sha: Sha40, counts: Map<string, TestCount>): Buffer {
  const packages: Record<string, TestCount> = {};
  for (const spec of manifest.packages) {
    packages[packageName(manifest, spec)] =
      counts.get(spec.name) ?? fail(`no test count for ${spec.name}`);
  }
  return json({ sha, packages });
}

function walk(root: string, relative = ''): string[] {
  const here = join(root, relative);
  if (!existsSync(here)) {
    return [];
  }
  return readdirSync(here, { withFileTypes: true }).flatMap((entry) => {
    const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      return UNMANAGED_DIRECTORIES.has(entry.name) ? [] : walk(root, child);
    }
    return [child];
  });
}

interface ImportReport {
  written: string[];
  removed: string[];
}

function refuseSymlinks(root: string, path: string): void {
  const segments = path.split('/');
  for (let depth = 1; depth <= segments.length; depth++) {
    const prefix = segments.slice(0, depth).join('/');
    const stat = lstatSync(join(root, prefix), { throwIfNoEntry: false });
    if (stat === undefined) {
      return;
    }
    if (stat.isSymbolicLink()) {
      fail(`${prefix} is a symlink. The import tool never writes or deletes through one.`);
    }
  }
}

function writeOutputs(
  root: string,
  outputs: Map<string, Buffer>,
  ownedDirectories: PackageDir[],
): ImportReport {
  const report: ImportReport = { written: [], removed: [] };
  for (const path of [...outputs.keys(), ...ownedDirectories]) {
    refuseSymlinks(root, path);
  }
  for (const [path, bytes] of outputs) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    const fd = openSync(target, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW);
    try {
      if (readFileSync(fd).equals(bytes)) {
        continue;
      }
      ftruncateSync(fd, 0);
      writeSync(fd, bytes, 0, bytes.length, 0);
    } finally {
      closeSync(fd);
    }
    report.written.push(path);
  }
  for (const directory of ownedDirectories) {
    for (const file of walk(join(root, directory))) {
      const path = `${directory}/${file}`;
      if (!outputs.has(path)) {
        refuseSymlinks(root, path);
        rmSync(join(root, path));
        report.removed.push(path);
      }
    }
  }
  return report;
}

function gitOutput(repo: string, args: string[]): Buffer {
  const result = spawnSync('git', ['-C', repo, ...args], { maxBuffer: 256 * 1024 * 1024 });
  return result.status === 0
    ? result.stdout
    : fail(`git ${args.join(' ')} failed: ${result.stderr.toString('utf8').trim()}`);
}

export function openOoce(repo: string, sha: Sha40): OoceSource {
  const head = gitOutput(repo, ['rev-parse', 'HEAD']).toString('utf8').trim();
  if (head !== sha) {
    fail(`${repo} is at ${head}. Check out ${sha} there and build its packages.`);
  }
  const dirty = gitOutput(repo, ['status', '--porcelain']).toString('utf8').trim();
  if (dirty !== '') {
    fail(`${repo} has uncommitted changes. Import from a clean checkout:\n${dirty}`);
  }
  return {
    sha,
    list: (dir) =>
      gitOutput(repo, ['ls-tree', '-r', '-z', sha, '--', `${dir}/`])
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map((entry) => {
          const [meta = '', path = ''] = entry.split('\t');
          const [mode, type] = meta.split(' ');
          if (mode === '120000') {
            fail(`${path} is a symlink in OOCE. The import tool copies only regular files.`);
          }
          return type === 'blob'
            ? oocePath(path)
            : fail(`${path} is a ${String(type)}, not a file`);
        }),
    read: (path) => gitOutput(repo, ['cat-file', 'blob', `${sha}:${path}`]),
  };
}

interface VitestRun {
  status: number | null;
  output: string;
  report: string | undefined;
}

export function countFromVitestRun(directory: string, run: VitestRun): TestCount {
  const output = run.output.trimEnd().split('\n').slice(-60).join('\n');
  if (run.report === undefined) {
    return fail(`${directory}: vitest wrote no report. Its output:\n${output}`);
  }
  const report = asRecord(JSON.parse(run.report), `${directory} report`);
  const number = (key: string): number =>
    typeof report[key] === 'number' ? report[key] : fail(`${directory}: report lacks ${key}`);
  const failedFiles = number('numFailedTestSuites');
  const failedTests = number('numFailedTests');
  if (failedFiles > 0 || failedTests > 0) {
    const messages = asList(report['testResults'], `${directory} testResults`, (item, at) =>
      asRecord(item, at),
    )
      .filter((result) => result['status'] === 'failed')
      .map((result) => `${String(result['name'])}: ${String(result['message'])}`);
    fail(
      `${directory}: ${String(failedFiles)} test files failed and ${String(failedTests)} tests failed. Build OOCE's packages first.\n${[...messages, output].join('\n')}`,
    );
  }
  if (report['success'] !== true || run.status !== 0) {
    fail(`${directory}: the vitest run did not pass. Vitest output:\n${output}`);
  }
  return { tests: number('numTotalTests'), skipped: number('numPendingTests') };
}

function vitestCount(directory: string, { exclude, include }: CountFilter): TestCount {
  const out = mkdtempSync(join(tmpdir(), 'import-counts-'));
  const outputFile = join(out, 'report.json');
  try {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--reporter=json',
        '--passWithNoTests',
        `--outputFile=${outputFile}`,
        ...exclude.map((path) => `--exclude=${path}`),
        ...include,
      ],
      { cwd: directory, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    return countFromVitestRun(directory, {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      report: existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : undefined,
    });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function readSupplied(root: string, manifest: Manifest): SuppliedContents {
  const paths = manifest.packages.flatMap((spec) => spec.supplied.map((file) => file.from));
  return new Map(
    paths.map((path) => {
      refuseSymlinks(root, path);
      return [path, readFileSync(join(root, path))];
    }),
  );
}

interface ImportInput {
  root: string;
  source: OoceSource;
  ooceRoot: string;
  countTests: CountTests;
}

export function runImport(input: ImportInput): ImportReport {
  const manifest = parseManifest(JSON.parse(readFileSync(join(input.root, MANIFEST_PATH), 'utf8')));
  const provenance = readFileSync(join(input.root, PROVENANCE_PATH), 'utf8');
  const sha = pinnedSha(provenance);
  if (input.source.sha !== sha) {
    fail(`the OOCE source is at ${input.source.sha}, not the pin ${sha}`);
  }
  const locked = lockedVersions(input.source);
  const supplied = readSupplied(input.root, manifest);
  const matched = new Set<TextEdit>();
  const plans = manifest.packages.map((spec) =>
    planPackage(manifest, spec, input.source, supplied, locked, sha, matched),
  );
  const unmatched = manifest.edits.filter((edit) => !matched.has(edit));
  if (unmatched.length > 0) {
    fail(
      `manifest edit matched nothing in any package: ${unmatched.map((e) => `${e.path} ${JSON.stringify(e.find)}`).join(', ')}`,
    );
  }
  const counts = new Map<string, TestCount>();
  for (const plan of plans) {
    const parts = plan.spec.sources.map((s, index) =>
      input.countTests(
        join(input.ooceRoot, s.from),
        sourceCountFilter(manifest, plan.spec, s, index),
      ),
    );
    counts.set(plan.spec.name, {
      tests: parts.reduce((sum, p) => sum + p.tests, 0),
      skipped: parts.reduce((sum, p) => sum + p.skipped, 0),
    });
  }
  const outputs = new Map<string, Buffer>();
  for (const plan of plans) {
    for (const file of plan.files) {
      outputs.set(file.path, file.bytes);
    }
  }
  const owned = plans.map((plan) => plan.spec.to);
  const report = writeOutputs(input.root, outputs, owned);
  const extras = new Map<string, Buffer>([
    [PROVENANCE_PATH, Buffer.from(renderProvenance(provenance, manifest, plans, sha))],
    [IMPORTED_PATH, renderImported(plans)],
    [COUNTS_PATH, renderCounts(manifest, sha, counts)],
  ]);
  const extraReport = writeOutputs(input.root, extras, []);
  report.written.push(...extraReport.written);
  return report;
}

function sourceCountFilter(
  manifest: Manifest,
  spec: PackageSpec,
  src: SourceSpec,
  index: number,
): CountFilter {
  const drops = [...manifest.dropEverywhere, ...(index === 0 ? spec.drop : src.drop)];
  return {
    exclude: drops.map((d) => (d.path.endsWith('/') ? `${d.path}**` : d.path)),
    include: src.pick ? src.moves.map((m) => (m.directory ? `${m.from}/` : m.from)) : [],
  };
}

export function checkCounts(root: string, countTests: CountTests): string[] {
  const manifest = parseManifest(JSON.parse(readFileSync(join(root, MANIFEST_PATH), 'utf8')));
  const expected = asRecord(
    asRecord(JSON.parse(readFileSync(join(root, COUNTS_PATH), 'utf8')), COUNTS_PATH)['packages'],
    `${COUNTS_PATH} packages`,
  );
  const lines: string[] = [];
  let ok = true;
  for (const spec of manifest.packages) {
    const name = packageName(manifest, spec);
    const want = asRecord(expected[name] ?? fail(`${COUNTS_PATH} lacks ${name}`), name);
    const got = countTests(join(root, spec.to), {
      exclude: spec.supplied.map((file) => file.to),
      include: [],
    });
    const match = want['tests'] === got.tests && want['skipped'] === got.skipped;
    ok &&= match;
    lines.push(
      `${name}: ${String(got.tests)} tests, ${String(got.skipped)} skipped, expected ${String(want['tests'])} and ${String(want['skipped'])}. ${match ? 'match' : 'MISMATCH'}`,
    );
  }
  return ok ? lines : fail(lines.join('\n'));
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) {
    return undefined;
  }
  const value = args[at + 1];
  return value === undefined || value.startsWith('--') ? fail(`${name} needs a value`) : value;
}

function main(): void {
  const args = process.argv.slice(2);
  const root = process.cwd();
  if (args.includes('--check-counts')) {
    process.stdout.write(`${checkCounts(root, vitestCount).join('\n')}\n`);
    return;
  }
  const ooceRoot = flag(args, '--ooce') ?? process.env['OOCE_CHECKOUT'];
  if (ooceRoot === undefined) {
    fail('usage: import --sha <sha> --ooce <path to an OOCE checkout at that SHA>');
  }
  const pin = pinnedSha(readFileSync(join(root, PROVENANCE_PATH), 'utf8'));
  const sha = resolveSha(flag(args, '--sha'), pin);
  const report = runImport({
    root,
    ooceRoot,
    source: openOoce(ooceRoot, sha),
    countTests: vitestCount,
  });
  const changed = report.written.length + report.removed.length;
  process.stdout.write(
    changed === 0
      ? 'no changes\n'
      : `wrote ${String(report.written.length)} files, removed ${String(report.removed.length)}\n`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
