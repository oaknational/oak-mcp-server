import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflows = join(import.meta.dirname, '../../.github/workflows');
const workflowFiles = readdirSync(workflows).filter((file) => file.endsWith('.yml'));

describe('workflows', () => {
  it.each(workflowFiles)('%s pins every action by a 40 character commit SHA', (file) => {
    const text = readFileSync(join(workflows, file), 'utf8');
    const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((match) => match[1] ?? '');
    for (const ref of uses) {
      expect(ref, `${file} uses ${ref}`).toMatch(/^(?:\.\/|[^@\s]+@[0-9a-f]{40}$)/);
    }
  });

  it.each(workflowFiles)(
    '%s grants no permissions at the top and declares them per job',
    (file) => {
      const workflow = parse(readFileSync(join(workflows, file), 'utf8')) as {
        permissions?: unknown;
        jobs: Record<string, { permissions?: unknown }>;
      };
      expect(workflow.permissions).toEqual({});
      for (const [name, job] of Object.entries(workflow.jobs)) {
        expect(job.permissions, `${file} job ${name}`).toBeDefined();
      }
    },
  );
});
