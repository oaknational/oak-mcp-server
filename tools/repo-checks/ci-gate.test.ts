import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Job {
  needs?: string[];
  if?: string;
  steps?: { run?: string }[];
}

const workflow = parse(
  readFileSync(join(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8'),
) as {
  on: { pull_request: { types?: string[] } };
  jobs: Record<string, Job>;
};
const gate = workflow.jobs['ci-gate'];
const gateScript = gate?.steps?.[0]?.run ?? '';

function runGate(results: string): number | null {
  return spawnSync('bash', ['-c', gateScript], { env: { ...process.env, RESULTS: results } })
    .status;
}

describe('ci-gate', () => {
  it('reruns when the title or body is edited', () => {
    expect(workflow.on.pull_request.types).toContain('edited');
  });

  it('needs every other job in ci.yml', () => {
    const others = Object.keys(workflow.jobs).filter((name) => name !== 'ci-gate');
    expect([...(gate?.needs ?? [])].sort()).toEqual(others.sort());
  });

  it('runs even when a needed job fails or is skipped', () => {
    expect(gate?.if).toBe('always()');
  });

  it('passes only when every result is success', () => {
    expect(runGate('success,success,success')).toBe(0);
  });

  it.each(['success,failure', 'success,cancelled', 'success,skipped', 'skipped', 'future-result'])(
    'blocks on %s',
    (results) => {
      expect(runGate(results)).toBe(1);
    },
  );
});
