import { spawnSync } from 'node:child_process';

export function changedSinceMergeBase(base: string): string[] {
  if (base === '') {
    throw new Error('BASE_SHA is not set');
  }
  const result = spawnSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`], {
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git diff ${base}...HEAD failed`);
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}
