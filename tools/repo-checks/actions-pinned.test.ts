import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '../../');
const listed = spawnSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.yml', '*.yaml'],
  { cwd: root, encoding: 'utf8' },
);
const yamlFiles = listed.stdout.split('\0').filter(Boolean);
const workflowFiles = yamlFiles.filter((file) => file.startsWith('.github/workflows/'));
const actionFiles = yamlFiles.filter((file) => /^action\.ya?ml$/.test(basename(file)));
const usingActions = [...workflowFiles, ...actionFiles];

describe('workflow and action files', () => {
  it('are found', () => {
    expect(listed.status).toBe(0);
    expect(workflowFiles).toContain('.github/workflows/ci.yml');
  });

  it.each(usingActions)('%s pins every action by a 40 character commit SHA', (file) => {
    const text = readFileSync(join(root, file), 'utf8');
    const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((match) => match[1] ?? '');
    for (const ref of uses) {
      expect(ref, `${file} uses ${ref}`).toMatch(/^(?:\.\/|[^@\s]+@[0-9a-f]{40}$)/);
    }
  });

  it.each(workflowFiles)(
    '%s grants no permissions at the top and declares them per job',
    (file) => {
      const workflow = parse(readFileSync(join(root, file), 'utf8')) as {
        permissions?: unknown;
        jobs: Record<string, { permissions?: unknown }>;
      };
      expect(workflow.permissions).toEqual({});
      for (const [name, job] of Object.entries(workflow.jobs)) {
        expect(job.permissions, `${file} job ${name}`).toBeDefined();
      }
    },
  );

  it.each(workflowFiles)('%s runs steps under bash with pipefail', (file) => {
    const workflow = parse(readFileSync(join(root, file), 'utf8')) as {
      defaults?: { run?: { shell?: unknown } };
    };
    expect(workflow.defaults?.run?.shell).toBe('bash');
  });

  it.each(workflowFiles)(
    '%s hands the npm shellcheck wrapper a pinned binary so it never downloads one',
    (file) => {
      const workflow = parse(readFileSync(join(root, file), 'utf8')) as {
        jobs: Record<string, { steps?: { run?: string; env?: Record<string, unknown> }[] }>;
      };
      for (const [name, job] of Object.entries(workflow.jobs)) {
        for (const { run = '', env } of job.steps ?? []) {
          if (/pnpm (?:lint:workflows|exec shellcheck)/.test(run)) {
            expect(env?.SHELLCHECKJS_BIN, `${file} job ${name}: ${run}`).toBeTruthy();
          }
        }
      }
    },
  );
});
