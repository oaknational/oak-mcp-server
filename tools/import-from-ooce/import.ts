import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseAllDocuments } from 'yaml';

type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type Sha40 = Brand<string, 'Sha40'>;
type RepoPath = Brand<string, 'RepoPath'>;
type OocePath = Brand<string, 'OocePath'>;

interface Drop {
  path: string;
  reason: string;
}
interface TextEdit {
  path: string;
  find: string;
  replace: string;
  wholeLine: boolean;
}
interface SourceSpec {
  from: OocePath;
  moves: Record<string, string>;
  drop: Drop[];
}
interface SuppliedFile {
  from: RepoPath;
  to: string;
}
interface PackageSpec {
  name: string;
  to: RepoPath;
  sources: SourceSpec[];
  drop: Drop[];
  edits: TextEdit[];
  supplied: SuppliedFile[];
  exports: Record<string, unknown>;
  removeDependencies: string[];
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
  list(dir: OocePath): OocePath[];
  read(path: OocePath): Buffer;
}

type PlannedFile = { path: RepoPath; bytes: Buffer } & (
  | { kind: 'copied'; source: OocePath }
  | { kind: 'modified'; source: OocePath }
  | { kind: 'supplied'; source: RepoPath }
);
interface PackagePlan {
  spec: PackageSpec;
  files: PlannedFile[];
  dropped: { source: OocePath; reason: string }[];
}
type LockedVersions = Map<string, Record<string, string>>;
export interface TestCount {
  tests: number;
  skipped: number;
}
type CountTests = (directory: string) => TestCount;

const MANIFEST_PATH = 'tools/import-from-ooce/manifest.json';
const IMPORTED_PATH = 'tools/import-from-ooce/imported.json';
const COUNTS_PATH = 'tools/import-from-ooce/expected-counts.json';
const PROVENANCE_PATH = 'PROVENANCE.md';
const PIN_PREFIX = 'Pinned OOCE import SHA: `';
const ENTRIES_HEADING = '## Entries';
const UNMANAGED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo']);
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

function fail(message: string): never {
  throw new Error(message);
}

function parseSha(value: string): Sha40 {
  return /^[0-9a-f]{40}$/.test(value) ? (value as Sha40) : fail(`not a 40 character SHA: ${value}`);
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

type Json = Record<string, unknown>;

function asRecord(value: unknown, where: string): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : fail(`${where} must be an object`);
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
  const record = asRecord(value, where);
  const reason = asString(record['reason'], `${where}.reason`);
  return reason.trim() === ''
    ? fail(`${where}.reason must explain the drop`)
    : { path: parsePath(asString(record['path'], `${where}.path`)), reason };
}

function parseEdit(value: unknown, where: string): TextEdit {
  const record = asRecord(value, where);
  const find = asString(record['find'], `${where}.find`);
  return find === ''
    ? fail(`${where}.find must not be empty`)
    : {
        path: parsePath(asString(record['path'], `${where}.path`)),
        find,
        replace: asString(record['replace'], `${where}.replace`),
        wholeLine: record['wholeLine'] === true,
      };
}

function parseSource(value: unknown, where: string): SourceSpec {
  const record = asRecord(value, where);
  const moves = asRecord(record['moves'] ?? {}, `${where}.moves`);
  return {
    from: oocePath(asString(record['from'], `${where}.from`)),
    moves: Object.fromEntries(
      Object.entries(moves).map(([from, to]) => [from, asString(to, `${where}.moves.${from}`)]),
    ),
    drop: asList(record['drop'], `${where}.drop`, parseDrop),
  };
}

function parsePackage(value: unknown, where: string): PackageSpec {
  const record = asRecord(value, where);
  const sources = asList(record['sources'], `${where}.sources`, parseSource);
  if (sources.length === 0) {
    fail(`${where}.sources needs at least one source`);
  }
  return {
    name: asString(record['name'], `${where}.name`),
    to: repoPath(asString(record['to'], `${where}.to`)),
    sources,
    drop: asList(record['drop'], `${where}.drop`, parseDrop),
    edits: asList(record['edits'], `${where}.edits`, parseEdit),
    supplied: asList(record['supplied'], `${where}.supplied`, (item, at) => {
      const supplied = asRecord(item, at);
      return {
        from: repoPath(asString(supplied['from'], `${at}.from`)),
        to: parsePath(asString(supplied['to'], `${at}.to`)),
      };
    }),
    exports: asRecord(record['exports'] ?? {}, `${where}.exports`),
    removeDependencies: asList(
      record['removeDependencies'],
      `${where}.removeDependencies`,
      asString,
    ),
  };
}

export function parseManifest(raw: unknown): Manifest {
  const record = asRecord(raw, 'manifest');
  const scope = asRecord(record['scope'], 'manifest.scope');
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
      const rewrite = asRecord(item, at);
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
    out['exports'] = { ...asRecord(out['exports'], `${owner} exports`), ...spec.exports };
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

function movedPath(relative: string, moves: Record<string, string>): string | undefined {
  for (const [from, to] of Object.entries(moves)) {
    if (from.endsWith('/') ? relative.startsWith(from) : relative === from) {
      return from.endsWith('/') ? to + relative.slice(from.length) : to;
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
      const drop = drops.find((d) => d.path === relative);
      if (index > 0 && relative === 'package.json') {
        secondaryJson.push(asRecord(JSON.parse(source.read(file).toString('utf8')), file));
      }
      if (drop !== undefined) {
        used.add(drop.path);
        dropped.push({ source: file, reason: drop.reason });
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

function transformText(manifest: Manifest, spec: PackageSpec, item: Gathered, sha: Sha40): Buffer {
  if (item.destination === 'package.json' || !isText(item.bytes)) {
    return item.bytes;
  }
  let text = item.bytes.toString('utf8');
  for (const edit of [...manifest.edits, ...spec.edits]) {
    if (edit.path === item.destination) {
      text = applyEdit(text, edit, `${spec.to}/${item.destination}`);
    }
  }
  for (const rewrite of manifest.textRewrites) {
    text = replaceAll(text, rewrite.find, replaceAll(rewrite.replace, '{sha}', sha));
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
  repoRoot: string,
  locked: LockedVersions,
  sha: Sha40,
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
        : transformText(manifest, spec, item, sha);
    files.push({
      kind: bytes.equals(item.bytes) ? 'copied' : 'modified',
      path: repoPath(`${spec.to}/${item.destination}`),
      source: item.source,
      bytes,
    });
  }
  for (const edit of spec.edits) {
    if (!seen.has(edit.path)) {
      fail(`${spec.name} edits ${edit.path}, which it does not write`);
    }
  }
  for (const supplied of spec.supplied) {
    const path = repoPath(`${spec.to}/${supplied.to}`);
    if (seen.has(supplied.to)) {
      fail(`${spec.name} supplies ${supplied.to}, which is also imported`);
    }
    files.push({
      kind: 'supplied',
      path,
      source: supplied.from,
      bytes: readFileSync(join(repoRoot, supplied.from)),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { spec, files, dropped };
}

function describePackage(plan: PackagePlan, sha: Sha40): string {
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
  const supplied = listing('supplied');
  if (supplied.length > 0) {
    lines.push(`- Supplied from this repository: ${supplied.join(', ')}.`);
  }
  for (const drop of plan.dropped) {
    lines.push(`- Dropped \`${drop.source}\`. ${drop.reason}`);
  }
  return lines.join('\n');
}

function pinnedSha(provenance: string): Sha40 {
  const line = provenance.split('\n').find((l) => l.startsWith(PIN_PREFIX));
  return line === undefined
    ? fail(`${PROVENANCE_PATH} has no pinned SHA line`)
    : parseSha(line.slice(PIN_PREFIX.length).replace(/`.*$/, ''));
}

function renderProvenance(current: string, plans: PackagePlan[], sha: Sha40): string {
  const at = current.indexOf(`${ENTRIES_HEADING}\n`);
  const head = at === -1 ? `${current.trimEnd()}\n\n` : current.slice(0, at);
  const body = plans.map((plan) => describePackage(plan, sha)).join('\n\n');
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

function writeOutputs(
  root: string,
  outputs: Map<string, Buffer>,
  ownedDirectories: string[],
): ImportReport {
  const report: ImportReport = { written: [], removed: [] };
  for (const [path, bytes] of outputs) {
    const target = join(root, path);
    if (existsSync(target) && readFileSync(target).equals(bytes)) {
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    report.written.push(path);
  }
  for (const directory of ownedDirectories) {
    for (const file of walk(join(root, directory))) {
      const path = `${directory}/${file}`;
      if (!outputs.has(path)) {
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

function gitSource(repo: string, sha: Sha40): OoceSource {
  gitOutput(repo, ['cat-file', '-e', `${sha}^{commit}`]);
  return {
    list: (dir) =>
      gitOutput(repo, ['ls-tree', '-r', '-z', '--name-only', sha, '--', `${dir}/`])
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map(oocePath),
    read: (path) => gitOutput(repo, ['cat-file', 'blob', `${sha}:${path}`]),
  };
}

function vitestCount(directory: string): TestCount {
  const out = mkdtempSync(join(tmpdir(), 'import-counts-'));
  const outputFile = join(out, 'report.json');
  try {
    spawnSync('pnpm', ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${outputFile}`], {
      cwd: directory,
      stdio: 'ignore',
    });
    const report = asRecord(JSON.parse(readFileSync(outputFile, 'utf8')), `${directory} report`);
    const number = (key: string): number =>
      typeof report[key] === 'number' ? report[key] : fail(`${directory}: report lacks ${key}`);
    if (number('numFailedTests') > 0) {
      fail(`${directory}: ${String(number('numFailedTests'))} tests failed`);
    }
    return { tests: number('numTotalTests'), skipped: number('numPendingTests') };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

interface ImportInput {
  root: string;
  sha: Sha40;
  source: OoceSource;
  ooceRoot: string;
  countTests: CountTests;
}

export function runImport(input: ImportInput): ImportReport {
  const manifest = parseManifest(JSON.parse(readFileSync(join(input.root, MANIFEST_PATH), 'utf8')));
  const provenancePath = join(input.root, PROVENANCE_PATH);
  const provenance = readFileSync(provenancePath, 'utf8');
  if (pinnedSha(provenance) !== input.sha) {
    fail(`--sha differs from the pin in ${PROVENANCE_PATH}. Change the pin by editing that line.`);
  }
  const locked = lockedVersions(input.source);
  const plans = manifest.packages.map((spec) =>
    planPackage(manifest, spec, input.source, input.root, locked, input.sha),
  );
  const counts = new Map<string, TestCount>();
  for (const plan of plans) {
    const parts = plan.spec.sources.map((s) => input.countTests(join(input.ooceRoot, s.from)));
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
  const owned = plans.map((plan) => plan.spec.to as string);
  const report = writeOutputs(input.root, outputs, owned);
  const extras = new Map<string, Buffer>([
    [PROVENANCE_PATH, Buffer.from(renderProvenance(provenance, plans, input.sha))],
    [IMPORTED_PATH, renderImported(plans)],
    [COUNTS_PATH, renderCounts(manifest, input.sha, counts)],
  ]);
  const extraReport = writeOutputs(input.root, extras, []);
  report.written.push(...extraReport.written);
  return report;
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
    const got = countTests(join(root, spec.to));
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
  return at === -1 ? undefined : args[at + 1];
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
  const sha = parseSha(flag(args, '--sha') ?? pin);
  const head = gitOutput(ooceRoot, ['rev-parse', 'HEAD']).toString('utf8').trim();
  if (head !== sha) {
    fail(`${ooceRoot} is at ${head}. Check out ${sha} there and build its packages.`);
  }
  const report = runImport({
    root,
    sha,
    ooceRoot,
    source: gitSource(ooceRoot, sha),
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
