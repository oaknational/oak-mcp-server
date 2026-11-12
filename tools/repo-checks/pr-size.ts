import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

import { diffFromMergeBase } from './changed-files.ts';
import { section } from './pr-title.ts';

const BAND_ACCEPTABLE = 10;
const BAND_LIMIT = 20;
const INDIVISIBILITY_PROOFS = ['import cycle', 'unreviewable', 'tool-generated'] as const;

const IMPORTED_PATH = 'tools/import-from-ooce/imported.json';
const PROVENANCE_PATH = 'PROVENANCE.md';

export interface SizeResult {
  outcome: 'pass' | 'note' | 'fail';
  message: string;
}

export function evaluateSize(authored: number, body: string): SizeResult {
  if (authored <= BAND_ACCEPTABLE) {
    return {
      outcome: 'pass',
      message: `${String(authored)} authored files, within the ${String(BAND_ACCEPTABLE)} file band.`,
    };
  }
  if (authored <= BAND_LIMIT) {
    return {
      outcome: 'note',
      message: `${String(authored)} authored files, over the ${String(BAND_ACCEPTABLE)} file band. Passing. Say why the PR is not smaller in the '## Size' section.`,
    };
  }
  const size = section(body, 'Size')?.toLowerCase() ?? '';
  if (INDIVISIBILITY_PROOFS.some((proof) => size.includes(proof))) {
    return {
      outcome: 'note',
      message: `${String(authored)} authored files, over the ${String(BAND_LIMIT)} file limit. The '## Size' section names an indivisibility proof. The reviewer judges it.`,
    };
  }
  return {
    outcome: 'fail',
    message: `${String(authored)} authored files, over the ${String(BAND_LIMIT)} file limit. Split the PR, or add a '## Size' section that names one proof: ${INDIVISIBILITY_PROOFS.join(', ')}.`,
  };
}

export function countAuthored(input: {
  changed: readonly string[];
  importedHashes: Readonly<Record<string, string>>;
  hashAtHead: (path: string) => string | undefined;
  isExcludedByAttributes: (path: string) => boolean;
}): { authored: string[]; excluded: string[] } {
  const authored: string[] = [];
  const excluded: string[] = [];
  for (const path of input.changed) {
    const imported = input.importedHashes[path];
    const matchesImport = imported !== undefined && imported === input.hashAtHead(path);
    (matchesImport || input.isExcludedByAttributes(path) ? excluded : authored).push(path);
  }
  return { authored, excluded };
}

function git(args: string[], input?: string): { ok: boolean; stdout: Buffer } {
  const result = spawnSync('git', args, { input, maxBuffer: 256 * 1024 * 1024 });
  return { ok: result.status === 0, stdout: result.stdout };
}

const IMPORTED_VALUE = /^sha256:([0-9a-f]{64})$/;

export function parseImported(raw: string): Record<string, string> {
  const parsed: unknown = JSON.parse(raw);
  const files =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as { files?: unknown }).files
      : undefined;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) {
    throw new Error(`${IMPORTED_PATH} must be {"files": {"<path>": "sha256:<64 hex digits>"}}`);
  }
  const hashes: Record<string, string> = {};
  for (const [path, value] of Object.entries(files)) {
    const digest = typeof value === 'string' ? IMPORTED_VALUE.exec(value)?.[1] : undefined;
    if (digest === undefined) {
      throw new Error(
        `${IMPORTED_PATH} holds a value that is not "sha256:<64 lowercase hex digits>"`,
      );
    }
    hashes[path] = digest;
  }
  return hashes;
}

function vouchedImports(base: string, hashes: Record<string, string>): Record<string, string> {
  const provenance = git(['show', `${base}:${PROVENANCE_PATH}`]);
  const directories = provenance.ok
    ? [...provenance.stdout.toString('utf8').matchAll(/^### `([^`]+)`$/gm)].flatMap(([, dir]) =>
        dir === undefined ? [] : [`${dir}/`],
      )
    : [];
  const tree = git(['ls-tree', '-r', '--name-only', '-z', base]);
  if (!tree.ok) {
    throw new Error('git ls-tree failed');
  }
  const held = new Set(tree.stdout.toString('utf8').split('\0'));
  return Object.fromEntries(
    Object.entries(hashes).filter(
      ([path]) => held.has(path) && directories.some((dir) => path.startsWith(dir)),
    ),
  );
}

function markedPaths(base: string, paths: readonly string[]): Set<string> {
  if (paths.length === 0) {
    return new Set();
  }
  const { ok, stdout } = git(
    ['check-attr', `--source=${base}`, '--stdin', '-z', 'linguist-generated', 'oak-archival'],
    paths.join('\0') + '\0',
  );
  if (!ok) {
    throw new Error('git check-attr failed');
  }
  const fields = stdout.toString('utf8').split('\0');
  const marked = new Set<string>();
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const [path = '', , value = ''] = fields.slice(i, i + 3);
    if (value === 'set' || value === 'true') {
      marked.add(path);
    }
  }
  return marked;
}

function main(): void {
  const { mergeBase: base, changed } = diffFromMergeBase(process.env['BASE_SHA'] ?? '');
  const importedFile = git(['show', `${base}:${IMPORTED_PATH}`]);
  const importedHashes = importedFile.ok
    ? vouchedImports(base, parseImported(importedFile.stdout.toString('utf8')))
    : {};
  const marked = markedPaths(base, changed);
  const { authored, excluded } = countAuthored({
    changed,
    importedHashes,
    hashAtHead: (path) => {
      const blob = git(['show', `HEAD:${path}`]);
      return blob.ok ? createHash('sha256').update(blob.stdout).digest('hex') : undefined;
    },
    isExcludedByAttributes: (path) => marked.has(path),
  });
  const result = evaluateSize(authored.length, process.env['PR_BODY'] ?? '');
  const summary = `pr-size: ${result.message} Excluded as generated, archival or imported: ${String(excluded.length)}.\n`;
  process.stdout.write(summary);
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryFile !== undefined && summaryFile !== '') {
    appendFileSync(
      summaryFile,
      `### pr-size\n\n${summary}\n${authored.map((p) => `- \`${p}\``).join('\n')}\n`,
    );
  }
  if (result.outcome === 'fail') {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
