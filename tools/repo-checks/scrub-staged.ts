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

function addedLines(file: string): { line: number; text: string }[] {
  const diff = git(
    'diff',
    '--cached',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    '--text',
    '-U0',
    '--',
    `:(top,literal)${file}`,
  );
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

const scrubList = readScrubList();
if (scrubList === undefined) {
  process.stderr.write(
    'scrub-staged: no CLAUDE.local.md scrub list found; checking email addresses only\n',
  );
}
const terms = scrubList ?? [];
const staged = git('diff', '--cached', '--name-only', '-z', '--no-renames', '--diff-filter=ACMR')
  .split('\0')
  .filter((file) => file !== '' && !SKIPPED_FILES.has(file));

const matchesTerm = (text: string): boolean => {
  const lowered = text.toLowerCase();
  return terms.some((term) => lowered.includes(term));
};

const findings: string[] = [];
for (const file of staged) {
  const nameMatches = matchesTerm(file);
  const label = nameMatches ? '(path hidden)' : file;
  if (nameMatches) {
    findings.push('a staged file name matches the scrub list');
  }
  for (const { line, text } of addedLines(file)) {
    if (EMAIL.test(text)) {
      findings.push(`${label}:${String(line)} contains an email address`);
    }
    if (matchesTerm(text)) {
      findings.push(`${label}:${String(line)} matches a pattern from the local scrub list`);
    }
  }
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
