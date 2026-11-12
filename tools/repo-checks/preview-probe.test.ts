import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  run?: string;
  env?: Record<string, string>;
}

const workflow = parse(
  readFileSync(join(import.meta.dirname, '../../.github/workflows/preview-probe.yml'), 'utf8'),
) as {
  on: Record<string, unknown>;
  jobs: Record<string, { name?: string; if?: string; permissions?: unknown; steps?: Step[] }>;
};
const job = workflow.jobs['preview-probe'];
const probeStep = job?.steps?.find((step) => step.run?.includes('tools/preview-probe/probe.ts'));

describe('preview-probe workflow', () => {
  it('triggers only on deployment_status', () => {
    expect(Object.keys(workflow.on)).toEqual(['deployment_status']);
  });

  it('reports a check run named preview-probe', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['preview-probe']);
    expect(job?.name).toBe('preview-probe');
  });

  it('runs only for successful Vercel preview deployments of the server', () => {
    const condition = job?.if ?? '';
    expect(condition).toContain("github.event.deployment_status.state == 'success'");
    expect(condition).toContain("github.event.deployment.creator.login == 'vercel[bot]'");
    expect(condition).toContain("startsWith(github.event.deployment.environment, 'Preview')");
    expect(condition).toContain(
      "contains(github.event.deployment.environment, 'oak-mcp-server-function')",
    );
  });

  it('reads the URL from the deployment event payload', () => {
    expect(probeStep?.env?.['PREVIEW_URL']).toBe(
      '${{ github.event.deployment_status.environment_url }}',
    );
  });

  it('cannot write statuses, checks or code', () => {
    expect(job?.permissions).toEqual({ contents: 'read' });
  });
});
