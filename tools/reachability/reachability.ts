import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import ts from 'typescript';

export interface Gate {
  readonly file: string;
  readonly name: string;
}

export interface ReachabilityConfig {
  readonly tsconfig: string;
  readonly scope: string;
  readonly testOnly: readonly string[];
  readonly roots: readonly string[];
  readonly devRoots: readonly string[];
  readonly devGates: readonly Gate[];
  readonly anchors: Readonly<Record<string, string>>;
  readonly groups?: Readonly<Record<string, readonly string[]>>;
}

export const BUCKETS = [
  'called',
  'type-only',
  'loaded-not-called',
  'dev-only-ships',
  'dev-only-tooling',
  'unreachable',
] as const;
export type Bucket = (typeof BUCKETS)[number];

type Mode = 'prod' | 'dev' | 'type';

export interface Lines {
  readonly physical: number;
  readonly code: number;
}

export interface UnitRow {
  readonly name: string;
  readonly line: number;
  readonly lines: Lines;
  readonly modes: readonly Mode[];
}

export interface FileRow {
  readonly file: string;
  readonly bucket: Bucket;
  readonly lines: Lines;
  readonly importedByTests: number;
  readonly units: readonly UnitRow[];
}

export interface Analysis {
  readonly files: readonly FileRow[];
  readonly anchors: Readonly<Record<string, Bucket | 'missing'>>;
  readonly groups: Readonly<Record<string, readonly string[]>>;
}

interface Unit {
  readonly node: ts.Statement;
  readonly file: ts.SourceFile;
  readonly declaresValue: boolean;
  readonly modes: Set<Mode>;
}

function matches(file: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('/') ? file.startsWith(pattern) : file === pattern || file.endsWith(pattern),
  );
}

function codeLines(text: string, start: number, end: number): number {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard);
  scanner.setText(text, start, end - start);
  const seen = new Set<number>();
  let line = 0;
  let cursor = 0;
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    const tokenStart = scanner.getTokenStart();
    const tokenEnd = scanner.getTokenEnd();
    for (; cursor < tokenStart; cursor++) {
      if (text[cursor] === '\n') line++;
    }
    const isTrivia =
      kind === ts.SyntaxKind.WhitespaceTrivia ||
      kind === ts.SyntaxKind.NewLineTrivia ||
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia;
    let tokenLine = line;
    for (; cursor < tokenEnd; cursor++) {
      if (text[cursor] === '\n') line++;
    }
    if (!isTrivia) {
      for (; tokenLine <= line; tokenLine++) seen.add(tokenLine);
    }
  }
  return seen.size;
}

function physicalLines(text: string): number {
  const trimmed = text.replace(/^\n+/, '').replace(/\s+$/, '');
  return trimmed === '' ? 0 : trimmed.split('\n').length;
}

function linesOf(file: ts.SourceFile, start: number, end: number): Lines {
  return {
    physical: physicalLines(file.text.slice(start, end)),
    code: codeLines(file.text, start, end),
  };
}

function declaresValue(statement: ts.Statement): boolean {
  if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return false;
  if (ts.isExportDeclaration(statement)) return !statement.isTypeOnly;
  if (ts.isModuleDeclaration(statement)) return false;
  return true;
}

function isDeclaration(statement: ts.Statement): boolean {
  return (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isVariableStatement(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isExportAssignment(statement)
  );
}

function unitName(statement: ts.Statement): string {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map((d) => d.name.getText()).join(', ');
  }
  if (ts.isExportDeclaration(statement))
    return `export from ${statement.moduleSpecifier?.getText() ?? 'local'}`;
  if (ts.isExportAssignment(statement)) return 'export default';
  const name = ts.isDeclarationStatement(statement)
    ? ts.getNameOfDeclaration(statement)
    : undefined;
  return name?.getText() ?? ts.SyntaxKind[statement.kind];
}

function isTypePosition(node: ts.Node, unit: ts.Node): boolean {
  for (let current = node; current !== unit; current = current.parent) {
    if (ts.isExpressionWithTypeArguments(current)) {
      const clause = current.parent;
      const classExtends =
        ts.isHeritageClause(clause) &&
        clause.token === ts.SyntaxKind.ExtendsKeyword &&
        ts.isClassLike(clause.parent);
      if (classExtends) continue;
      return true;
    }
    if (ts.isTypeNode(current)) return true;
  }
  return false;
}

function topLevelStatement(node: ts.Node): ts.Statement {
  let current = node;
  while (!ts.isSourceFile(current.parent)) current = current.parent;
  return current as ts.Statement;
}

export function analyse(config: ReachabilityConfig, root: string): Analysis {
  const abs = (path: string): string => resolve(root, path);
  const rel = (path: string): string => relative(root, path);
  const tsconfigPath = abs(config.tsconfig);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );
  if (!parsed) throw new Error(`cannot read ${config.tsconfig}`);
  const extraRoots = config.devRoots.filter((p) => p.endsWith('.ts')).map(abs);
  const program = ts.createProgram({
    rootNames: [...new Set([...parsed.fileNames, ...extraRoots])],
    options: { ...parsed.options, noEmit: true, allowImportingTsExtensions: true },
  });
  const checker = program.getTypeChecker();

  const scope = `${config.scope.replace(/\/$/, '')}/`;
  const ownFiles = program
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile && !rel(file.fileName).startsWith('..'))
    .filter((file) => !file.fileName.includes('/node_modules/'));
  const isTest = (path: string): boolean =>
    /\.test\.[cm]?tsx?$/.test(path) || matches(path, config.testOnly);
  const inScope = (path: string): boolean => path.startsWith(scope) && !isTest(path);

  const units = new Map<ts.Statement, Unit>();
  const unitsByFile = new Map<string, Unit[]>();
  for (const file of ownFiles) {
    const list: Unit[] = [];
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) continue;
      const unit: Unit = {
        node: statement,
        file,
        declaresValue: declaresValue(statement),
        modes: new Set(),
      };
      units.set(statement, unit);
      list.push(unit);
    }
    unitsByFile.set(rel(file.fileName), list);
  }

  const gates = new Set<ts.Statement>();
  for (const gate of config.devGates) {
    const unit = unitsByFile.get(gate.file)?.find((u) => unitName(u.node) === gate.name);
    if (!unit) throw new Error(`dev gate ${gate.name} not found in ${gate.file}`);
    gates.add(unit.node);
  }

  const queue: Array<[Unit, Mode]> = [];
  const fileModes = new Map<ts.SourceFile, Set<Mode>>();
  const enqueue = (unit: Unit, mode: Mode): void => {
    let effective = mode;
    if (!unit.declaresValue) effective = 'type';
    else if (effective === 'prod' && gates.has(unit.node)) effective = 'dev';
    if (unit.modes.has(effective)) return;
    unit.modes.add(effective);
    queue.push([unit, effective]);
    const seen = fileModes.get(unit.file) ?? new Set<Mode>();
    fileModes.set(unit.file, seen);
    if (effective !== 'type' && !seen.has(effective)) {
      seen.add(effective);
      for (const sibling of unitsByFile.get(rel(unit.file.fileName)) ?? []) {
        if (!isDeclaration(sibling.node)) enqueue(sibling, effective);
      }
    }
  };
  const markDeclaration = (declaration: ts.Node, mode: Mode): void => {
    const unit = units.get(topLevelStatement(declaration));
    if (unit) enqueue(unit, mode);
  };

  const followSymbol = (start: ts.Symbol, mode: Mode): void => {
    let symbol: ts.Symbol | undefined = start;
    const seen = new Set<ts.Symbol>();
    while (symbol && symbol.flags & ts.SymbolFlags.Alias && !seen.has(symbol)) {
      seen.add(symbol);
      for (const declaration of symbol.declarations ?? []) {
        if (ts.isExportSpecifier(declaration) || ts.isNamespaceExport(declaration)) {
          markDeclaration(declaration, mode);
        }
      }
      symbol = checker.getImmediateAliasedSymbol(symbol);
    }
    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isSourceFile(declaration)) continue;
      markDeclaration(declaration, mode);
    }
  };

  const visit = (unit: Unit, mode: Mode): void => {
    if (ts.isExportDeclaration(unit.node)) return;
    const walk = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const refMode = mode === 'type' || isTypePosition(node, unit.node) ? 'type' : mode;
        const parent = node.parent;
        const symbol =
          ts.isShorthandPropertyAssignment(parent) && parent.name === node
            ? checker.getShorthandAssignmentValueSymbol(parent)
            : checker.getSymbolAtLocation(node);
        if (symbol) followSymbol(symbol, refMode);
      }
      ts.forEachChild(node, walk);
    };
    walk(unit.node);
  };

  const seed = (paths: readonly string[], mode: Mode): void => {
    for (const [file, list] of unitsByFile) {
      if (matches(file, paths) && !isTest(file)) {
        for (const unit of list) enqueue(unit, mode);
      }
    }
  };
  seed(config.roots, 'prod');
  for (let next = queue.shift(); next; next = queue.shift()) visit(...next);
  seed(config.devRoots, 'dev');
  for (let next = queue.shift(); next; next = queue.shift()) visit(...next);

  const importTarget = (specifier: ts.Expression): string | undefined => {
    const symbol = checker.getSymbolAtLocation(specifier);
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    return declaration && ts.isSourceFile(declaration) ? rel(declaration.fileName) : undefined;
  };
  const runtimeImports = (file: ts.SourceFile): string[] =>
    file.statements.flatMap((statement) => {
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        const bindings = clause?.namedBindings;
        const allTypes =
          clause?.phaseModifier === ts.SyntaxKind.TypeKeyword ||
          (clause !== undefined &&
            !clause.name &&
            bindings !== undefined &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((element) => element.isTypeOnly));
        if (allTypes) return [];
        return [importTarget(statement.moduleSpecifier)].filter((t) => t !== undefined);
      }
      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
        return [importTarget(statement.moduleSpecifier)].filter((t) => t !== undefined);
      }
      return [];
    });
  const byPath = new Map(ownFiles.map((file) => [rel(file.fileName), file]));
  const loaded = new Set<string>();
  const pending = [...byPath.keys()].filter((path) => matches(path, config.roots));
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (loaded.has(path)) continue;
    loaded.add(path);
    const file = byPath.get(path);
    if (file) pending.push(...runtimeImports(file));
  }

  const testImports = new Map<string, number>();
  for (const [path, file] of byPath) {
    if (!isTest(path)) continue;
    const targets = new Set(
      file.statements.flatMap((statement) =>
        ts.isImportDeclaration(statement) ? [importTarget(statement.moduleSpecifier)] : [],
      ),
    );
    for (const target of targets) {
      if (target) testImports.set(target, (testImports.get(target) ?? 0) + 1);
    }
  }

  const files: FileRow[] = [...unitsByFile.entries()]
    .filter(([path]) => inScope(path))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, list]) => {
      const file = byPath.get(path);
      if (!file) throw new Error(`missing source for ${path}`);
      const has = (mode: Mode): boolean => list.some((unit) => unit.modes.has(mode));
      const bucket: Bucket = has('prod')
        ? 'called'
        : has('dev')
          ? loaded.has(path)
            ? 'dev-only-ships'
            : 'dev-only-tooling'
          : has('type')
            ? 'type-only'
            : loaded.has(path) && list.some((unit) => unit.declaresValue)
              ? 'loaded-not-called'
              : 'unreachable';
      return {
        file: path,
        bucket,
        lines: {
          physical: file.text.split('\n').length - 1,
          code: codeLines(file.text, 0, file.text.length),
        },
        importedByTests: testImports.get(path) ?? 0,
        units: list.map((unit) => ({
          name: unitName(unit.node),
          line: file.getLineAndCharacterOfPosition(unit.node.getStart()).line + 1,
          lines: linesOf(file, unit.node.getFullStart(), unit.node.getEnd()),
          modes: [...unit.modes].sort(),
        })),
      };
    });

  const anchors = Object.fromEntries(
    Object.entries(config.anchors).map(([label, path]): [string, Bucket | 'missing'] => [
      label,
      files.find((row) => row.file === path)?.bucket ?? 'missing',
    ]),
  );
  const groups = Object.fromEntries(
    Object.entries(config.groups ?? {}).map(([label, patterns]) => [
      label,
      files.filter((row) => matches(row.file, patterns)).map((row) => row.file),
    ]),
  );
  return { files, anchors, groups };
}

function sum(rows: readonly { lines: Lines }[]): Lines {
  return rows.reduce(
    (total, row) => ({
      physical: total.physical + row.lines.physical,
      code: total.code + row.lines.code,
    }),
    { physical: 0, code: 0 },
  );
}

export function deadUnitsInReachableFiles(
  analysis: Analysis,
): Array<{ file: string; unit: UnitRow }> {
  return analysis.files
    .filter((row) => row.bucket !== 'unreachable')
    .flatMap((row) =>
      row.units.filter((unit) => unit.modes.length === 0).map((unit) => ({ file: row.file, unit })),
    );
}

export function devOnlyUnitsInCalledFiles(
  analysis: Analysis,
): Array<{ file: string; unit: UnitRow }> {
  return analysis.files
    .filter((row) => row.bucket === 'called')
    .flatMap((row) =>
      row.units
        .filter((unit) => unit.modes.includes('dev') && !unit.modes.includes('prod'))
        .map((unit) => ({ file: row.file, unit })),
    );
}

function row(...cells: ReadonlyArray<string | number>): string {
  return `| ${cells.map(String).join(' | ')} |`;
}

export function formatSummary(analysis: Analysis, top = 15): string {
  const out: string[] = [];
  out.push('| Bucket | Files | Physical lines | Code lines |', '| -- | --: | --: | --: |');
  for (const bucket of BUCKETS) {
    const rows = analysis.files.filter((file) => file.bucket === bucket);
    const total = sum(rows);
    out.push(row(bucket, rows.length, total.physical, total.code));
  }
  const all = sum(analysis.files);
  out.push(row('total', analysis.files.length, all.physical, all.code), '');

  out.push('Entry anchors:', '');
  for (const [label, bucket] of Object.entries(analysis.anchors)) out.push(`- ${label}: ${bucket}`);
  out.push('');

  if (Object.keys(analysis.groups).length > 0) {
    out.push(
      '| Group | Files | Physical lines | Code lines | Buckets |',
      '| -- | --: | --: | --: | -- |',
    );
    for (const [label, members] of Object.entries(analysis.groups)) {
      const rows = analysis.files.filter((file) => members.includes(file.file));
      const total = sum(rows);
      const buckets = [...new Set(rows.map((file) => file.bucket))].sort().join(', ');
      out.push(row(label, rows.length, total.physical, total.code, buckets));
    }
    out.push('');
  }

  for (const bucket of BUCKETS) {
    const rows = analysis.files
      .filter((file) => file.bucket === bucket)
      .sort((a, b) => b.lines.code - a.lines.code)
      .slice(0, bucket === 'called' ? top : undefined);
    if (rows.length === 0) continue;
    out.push(
      bucket === 'called' ? `Largest ${String(top)} called files:` : `${bucket} files:`,
      '',
      '| File | Physical | Code | Test files importing it |',
      '| -- | --: | --: | --: |',
    );
    for (const file of rows) {
      out.push(row(file.file, file.lines.physical, file.lines.code, file.importedByTests));
    }
    out.push('');
  }

  const listUnits = (title: string, list: Array<{ file: string; unit: UnitRow }>): void => {
    const total = sum(list.map(({ unit }) => unit));
    out.push(
      `${title}: ${String(list.length)} declarations, ${String(total.physical)} physical lines, ${String(total.code)} code lines. Largest ${String(top)}:`,
      '',
      '| File:line | Declaration | Physical | Code |',
      '| -- | -- | --: | --: |',
    );
    for (const { file, unit } of [...list]
      .sort((a, b) => b.unit.lines.code - a.unit.lines.code)
      .slice(0, top)) {
      out.push(
        row(`${file}:${String(unit.line)}`, unit.name, unit.lines.physical, unit.lines.code),
      );
    }
    out.push('');
  };
  listUnits('Dead declarations in reachable files', deadUnitsInReachableFiles(analysis));
  listUnits('Dev-only declarations in called files', devOnlyUnitsInCalledFiles(analysis));
  return out.join('\n');
}

const REPO_ROOT = resolve(import.meta.dirname, '../..');

function main(): void {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', default: 'tools/reachability/apps-server.json' },
      json: { type: 'string' },
      top: { type: 'string', default: '15' },
    },
  });
  const configPath = resolve(values.config);
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as ReachabilityConfig;
  const analysis = analyse(config, REPO_ROOT);
  if (values.json) writeFileSync(values.json, `${JSON.stringify(analysis, null, 2)}\n`);
  process.stdout.write(`${formatSummary(analysis, Number(values.top))}\n`);
  if (Object.values(analysis.anchors).some((bucket) => bucket !== 'called')) {
    process.stderr.write('An entry anchor is not in the called bucket.\n');
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
