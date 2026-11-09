import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const SKIPPED_FILES = new Set(['pnpm-lock.yaml']);

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function readScrubList(root: string): string[] {
  const file = join(root, 'CLAUDE.local.md');
  if (!existsSync(file)) {
    return [];
  }
  const terms: string[] = [];
  let inList = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('## ')) {
      inList = /^##\s+Scrub list/i.test(line);
    } else if (inList) {
      const term = /^\s*-\s+`([^`]+)`/.exec(line)?.[1];
      if (term !== undefined) {
        terms.push(term.toLowerCase());
      }
    }
  }
  return terms;
}

function addedLines(diff: string): { file: string; line: number; text: string }[] {
  const added: { file: string; line: number; text: string }[] = [];
  let file = '';
  let line = 0;
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ ')) {
      file = row.startsWith('+++ b/') ? row.slice(6) : '';
    } else if (row.startsWith('@@')) {
      line = Number(/\+(\d+)/.exec(row)?.[1] ?? 0) - 1;
    } else if (row.startsWith('+')) {
      line += 1;
      added.push({ file, line, text: row.slice(1) });
    } else if (!row.startsWith('-') && !row.startsWith('\\')) {
      line += 1;
    }
  }
  return added;
}

const root = git('rev-parse', '--show-toplevel').trim();
const terms = readScrubList(root);
const diff = git('diff', '--cached', '--no-color', '--no-ext-diff', '-U0', '--diff-filter=ACMR');

const findings: string[] = [];
for (const { file, line, text } of addedLines(diff)) {
  if (file === '' || SKIPPED_FILES.has(file)) {
    continue;
  }
  const lowered = text.toLowerCase();
  if (EMAIL.test(text)) {
    findings.push(`${file}:${String(line)} contains an email address`);
  }
  if (terms.some((term) => lowered.includes(term))) {
    findings.push(`${file}:${String(line)} matches a pattern from the local scrub list`);
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
