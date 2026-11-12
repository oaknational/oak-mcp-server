import { spawnSync } from 'node:child_process';

function git(args: string[]): string {
  const result = spawnSync('git', args, { maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed`);
  }
  return result.stdout.toString('utf8');
}

export function diffFromMergeBase(base: string): { mergeBase: string; changed: string[] } {
  if (base === '') {
    throw new Error('BASE_SHA is not set');
  }
  const mergeBase = git(['merge-base', base, 'HEAD']).trim();
  const changed = git(['diff', '--name-only', '--no-renames', '-z', mergeBase, 'HEAD'])
    .split('\0')
    .filter(Boolean);
  return { mergeBase, changed };
}
