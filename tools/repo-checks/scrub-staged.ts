import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const SKIPPED_FILES = new Set(['pnpm-lock.yaml']);

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function scrubListFile(): string | undefined {
  const toplevel = git('rev-parse', '--show-toplevel').trim();
  const commonDir = git('rev-parse', '--path-format=absolute', '--git-common-dir').trim();
  return [toplevel, dirname(commonDir)]
    .map((dir) => join(dir, 'CLAUDE.local.md'))
    .find((file) => existsSync(file));
}

function readScrubList(): string[] | undefined {
  const file = scrubListFile();
  if (file === undefined) {
    return undefined;
  }
  const terms: string[] = [];
  let inList = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('## ')) {
      inList = /^##\s+Scrub list/i.test(line);
    } else if (inList && /^\s*-\s/.test(line)) {
      for (const [, term] of line.matchAll(/`([^`]+)`/g)) {
        if (term !== undefined) {
          terms.push(term.toLowerCase());
        }
      }
    }
  }
  return terms;
}

function parseAddedLines(diff: string): { line: number; text: string }[] {
  const added: { line: number; text: string }[] = [];
  let line = 0;
  let inHunk = false;
  for (const row of diff.split('\n')) {
    if (row.startsWith('@@')) {
      inHunk = true;
      line = Number(/\+(\d+)/.exec(row)?.[1] ?? 0) - 1;
    } else if (inHunk && row.startsWith('+')) {
      line += 1;
      added.push({ line, text: row.slice(1) });
    } else if (inHunk && !row.startsWith('-') && !row.startsWith('\\')) {
      line += 1;
    }
  }
  return added;
}

const STAGED_FLAGS = ['--cached', '--no-renames', '--no-relative', '--diff-filter=ACMR'];

function stagedDiffs(files: string[]): string[] {
  const chunks = git(
    'diff',
    ...STAGED_FLAGS,
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--text',
    '-U0',
  )
    .split(/^diff --git /m)
    .slice(1);
  if (chunks.length !== files.length) {
    throw new Error('scrub-staged: staged diff does not match the staged file list');
  }
  return chunks;
}

const scrubList = readScrubList();
if (scrubList === undefined) {
  process.stderr.write(
    'scrub-staged: no CLAUDE.local.md scrub list found; checking email addresses only\n',
  );
}
const terms = scrubList ?? [];
const stagedFiles = git('diff', ...STAGED_FLAGS, '--name-only', '-z')
  .split('\0')
  .filter((file) => file !== '');
const diffs = stagedDiffs(stagedFiles);

const matchesTerm = (text: string): boolean => {
  const lowered = text.toLowerCase();
  return terms.some((term) => lowered.includes(term));
};

const findings: string[] = [];
let hiddenNames = 0;
stagedFiles.forEach((file, index) => {
  if (SKIPPED_FILES.has(file)) {
    return;
  }
  const nameMatches = matchesTerm(file);
  const label = nameMatches ? '(path hidden)' : file;
  if (nameMatches) {
    hiddenNames += 1;
  }
  for (const { line, text } of parseAddedLines(diffs[index] ?? '')) {
    if (EMAIL.test(text)) {
      findings.push(`${label}:${String(line)} contains an email address`);
    }
    if (matchesTerm(text)) {
      findings.push(`${label}:${String(line)} matches a pattern from the local scrub list`);
    }
  }
});
if (hiddenNames > 0) {
  findings.unshift(
    hiddenNames === 1
      ? 'a staged file name matches the scrub list'
      : `${String(hiddenNames)} staged file names match the scrub list`,
  );
}

if (findings.length > 0) {
  process.stderr.write(
    [
      'scrub-staged: refused, staged content holds personal or operator-local data.',
      ...findings.map((finding) => `  ${finding}`),
      'Remove the match from the staged change and stage it again.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
