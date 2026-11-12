import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Job {
  needs?: string[];
  if?: string;
  steps?: { run?: string; env?: Record<string, string> }[];
}

const workflow = parse(
  readFileSync(join(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8'),
) as {
  on: { pull_request: { types?: string[] } };
  concurrency: { 'cancel-in-progress': string };
  jobs: Record<string, Job>;
};
const gate = workflow.jobs['ci-gate'];
const gateScript = gate?.steps?.[0]?.run ?? '';
const needCount = String(gate?.needs?.length);
const allSuccess = Array.from({ length: Number(needCount) }, () => 'success').join(',');

function runGate(results: string, count = needCount): number | null {
  return spawnSync('bash', ['-c', gateScript], {
    env: { ...process.env, RESULTS: results, NEED_COUNT: count },
  }).status;
}

describe('ci-gate', () => {
  it('reruns when the title or body is edited', () => {
    expect(workflow.on.pull_request.types).toContain('edited');
  });

  it('cancels an in-progress run only when a new head commit arrives', () => {
    expect(workflow.concurrency['cancel-in-progress']).toBe(
      "${{ github.event.action == 'synchronize' }}",
    );
  });

  it('needs every other job in ci.yml', () => {
    const others = Object.keys(workflow.jobs).filter((name) => name !== 'ci-gate');
    expect([...(gate?.needs ?? [])].sort()).toEqual(others.sort());
  });

  it('runs when a needed job fails or is skipped, but not in a cancelled run', () => {
    expect(gate?.if).toBe('${{ !cancelled() }}');
  });

  it('declares an expected result count equal to its needs', () => {
    expect(gate?.steps?.[0]?.env?.['NEED_COUNT']).toBe(needCount);
  });

  it('passes only when every result is success', () => {
    expect(runGate(allSuccess)).toBe(0);
  });

  it.each(['failure', 'cancelled', 'skipped', 'future-result'])('blocks on one %s', (result) => {
    expect(runGate(allSuccess.replace('success', result))).toBe(1);
  });

  it.each(['', 'success', allSuccess.slice(0, -'success,'.length)])(
    'blocks when %j holds fewer results than needs',
    (results) => {
      expect(runGate(results)).toBe(1);
    },
  );

  it('blocks when there are more results than needs', () => {
    expect(runGate(`${allSuccess},success`)).toBe(1);
  });
});
