import { describe, expect, it } from 'vitest';

import { compareRunToBaseline } from '../../src/mcp-conformance/baseline.js';
import { type McpjamCase, type McpjamReport } from '../../src/mcp-conformance/types.js';
import { cloneBaseline, loadBaseline, loadFixture } from './test-helpers/fixture-loader.js';
import { requireDefined } from './test-helpers/guards.js';

/** Rebuild a report with one case's status flipped, without type assertions. */
function withCaseStatus(
  report: McpjamReport,
  checkId: string,
  status: McpjamCase['status'],
): McpjamReport {
  return {
    ...report,
    groups: report.groups.map((group) => ({
      ...group,
      cases: group.cases.map((oneCase): McpjamCase =>
        oneCase.id === checkId ? { ...oneCase, status } : oneCase,
      ),
    })),
  };
}

// The observed 2026-07-26 alpha runs ARE the seeded baselines: a wrapper run
// reproducing the evidence runs verdicts pass with zero divergences.
describe('compareRunToBaseline — seeded baselines match their own evidence runs', () => {
  it('protocol unattended: the observed 401-posture run passes its baseline', () => {
    const outcome = compareRunToBaseline(
      loadFixture('protocol-unauth-alpha-2026-07-26.json'),
      loadBaseline('protocol-unattended.json'),
    );
    expect(outcome.divergences).toEqual([]);
    expect(outcome.verdict).toBe('pass');
  });

  it('oauth unattended: the observed headless DCR run (terminal consent failure) passes its baseline', () => {
    const outcome = compareRunToBaseline(
      loadFixture('oauth-dcr-headless-alpha-2026-07-26.json'),
      loadBaseline('oauth-dcr-unattended.json'),
    );
    expect(outcome.divergences).toEqual([]);
    expect(outcome.verdict).toBe('pass');
  });
});

describe('compareRunToBaseline — every divergence class is a named, loud failure', () => {
  const report = loadFixture('protocol-unauth-alpha-2026-07-26.json');
  const baseline = loadBaseline('protocol-unattended.json');

  it('a removed expected skip fails loudly as novel-check, naming the check (the acceptance leg)', () => {
    const broken = cloneBaseline(baseline);
    delete broken.expected['ping'];
    const outcome = compareRunToBaseline(report, broken);
    expect(outcome.verdict).toBe('fail');
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'novel-check', checkId: 'ping' }),
    ]);
  });

  it('a baseline check absent from the run fails as missing-check', () => {
    const withPhantom = cloneBaseline(baseline);
    withPhantom.expected['phantom-check'] = { status: 'pass' };
    const outcome = compareRunToBaseline(report, withPhantom);
    expect(outcome.verdict).toBe('fail');
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'missing-check', checkId: 'phantom-check' }),
    ]);
  });

  it('an expected pass that failed reports unexpected-failure with the observed error', () => {
    const expectingPass = cloneBaseline(baseline);
    expectingPass.expected['server-initialize'] = { status: 'pass' };
    const outcome = compareRunToBaseline(report, expectingPass);
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'unexpected-failure', checkId: 'server-initialize' }),
    ]);
    expect(outcome.divergences[0]?.message).toContain('Unauthorized');
  });

  it('an expected skip that failed reports unexpected-failure (skips never mask failures)', () => {
    const expectingSkip = cloneBaseline(baseline);
    expectingSkip.expected['server-initialize'] = {
      status: 'skip',
      reasonIncludes: 'irrelevant — the observed FAILURE outranks any skip-reason comparison',
    };
    const outcome = compareRunToBaseline(report, expectingSkip);
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'unexpected-failure', checkId: 'server-initialize' }),
    ]);
  });

  it('an expected failure whose error text moved reports failure-shape-mismatch', () => {
    const wrongShape = cloneBaseline(baseline);
    wrongShape.expected['server-initialize'] = {
      status: 'fail',
      errorIncludes: 'a fragment the real error does not contain',
    };
    const outcome = compareRunToBaseline(report, wrongShape);
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'failure-shape-mismatch', checkId: 'server-initialize' }),
    ]);
  });

  it('an expected failure that passed reports unexpected-pass (a healed check is loud)', () => {
    const oauthReport = loadFixture('oauth-dcr-headless-alpha-2026-07-26.json');
    const expectingFail = cloneBaseline(loadBaseline('oauth-dcr-unattended.json'));
    expectingFail.expected['request_without_token'] = {
      status: 'fail',
      errorIncludes: 'anything',
    };
    const outcome = compareRunToBaseline(oauthReport, expectingFail);
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'unexpected-pass', checkId: 'request_without_token' }),
    ]);
  });

  it('an expected failure that skipped reports new-skip', () => {
    const expectingFail = cloneBaseline(baseline);
    expectingFail.expected['ping'] = { status: 'fail', errorIncludes: 'anything' };
    const outcome = compareRunToBaseline(report, expectingFail);
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'new-skip', checkId: 'ping' }),
    ]);
  });

  it('an expected pass that skipped reports new-skip', () => {
    const oauthReport = withCaseStatus(
      loadFixture('oauth-dcr-headless-alpha-2026-07-26.json'),
      'request_without_token',
      'skipped',
    );
    const outcome = compareRunToBaseline(oauthReport, loadBaseline('oauth-dcr-unattended.json'));
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'new-skip', checkId: 'request_without_token' }),
    ]);
  });

  it('an expected skip that passed reports vanished-skip (the ticket-named drift)', () => {
    const mutatedReport = withCaseStatus(report, 'ping', 'passed');
    const outcome = compareRunToBaseline(mutatedReport, baseline);
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'vanished-skip', checkId: 'ping' }),
    ]);
  });

  it('an expected skip whose observed reason lost the pinned fragment reports skip-reason-mismatch', () => {
    const rePinned = cloneBaseline(baseline);
    rePinned.expected['ping'] = {
      status: 'skip',
      reasonIncludes: 'a fragment the observed skip reason never contains',
    };
    const outcome = compareRunToBaseline(report, rePinned);
    expect(outcome.verdict).toBe('fail');
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'skip-reason-mismatch', checkId: 'ping' }),
    ]);
  });

  it('a duplicated check id across groups is a duplicate-check divergence, never last-wins', () => {
    const first = requireDefined(report.groups[0], 'first fixture group');
    const pingCase = requireDefined(
      first.cases.find((c) => c.id === 'ping'),
      'fixture ping case',
    );
    const duplicated: McpjamReport = {
      ...report,
      groups: [
        ...report.groups,
        { ...first, id: 'mcp-2', cases: [{ ...pingCase, status: 'passed' }] },
      ],
    };
    const outcome = compareRunToBaseline(duplicated, baseline);
    expect(outcome.verdict).toBe('fail');
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'duplicate-check', checkId: 'ping' }),
    ]);
  });

  it('a novel passed check named after a prototype member is novel-check, never silently matched', () => {
    const first = requireDefined(report.groups[0], 'first fixture group');
    const pingCase = requireDefined(
      first.cases.find((c) => c.id === 'ping'),
      'fixture ping case',
    );
    const withPrototypeId: McpjamReport = {
      ...report,
      groups: [
        ...report.groups,
        { ...first, id: 'mcp-proto', cases: [{ ...pingCase, id: 'toString', status: 'passed' }] },
      ],
    };
    const outcome = compareRunToBaseline(withPrototypeId, baseline);
    expect(outcome.verdict).toBe('fail');
    expect(outcome.divergences).toEqual([
      expect.objectContaining({ kind: 'novel-check', checkId: 'toString' }),
    ]);
  });

  it('multiple divergences are all reported, not first-only', () => {
    const doubly = cloneBaseline(baseline);
    delete doubly.expected['ping'];
    doubly.expected['phantom-check'] = { status: 'pass' };
    const outcome = compareRunToBaseline(report, doubly);
    expect(outcome.verdict).toBe('fail');
    expect(outcome.divergences).toHaveLength(2);
    const kinds = outcome.divergences.map((d) => d.kind);
    expect(kinds).toContain('missing-check');
    expect(kinds).toContain('novel-check');
  });
});

// The retained apps-suite observation seeds the future attended baseline
// (MCP-125/176); until then it is load-bearing as a boundary-schema pin.
describe('retained apps-suite observation', () => {
  it('parses cleanly through the strict report schema', () => {
    const report = loadFixture('apps-unauth-alpha-2026-07-26.json');
    expect(report.groups[0]?.cases.map((c) => c.id)).toContain('ui-tools-present');
  });
});
