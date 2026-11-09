import { describe, expect, it } from 'vitest';

import { checkPrTitle, EXEMPT_AUTHORS } from './pr-title.ts';

const INVENTED_APP = 'example-release-app[bot]';
const fixes = '## Linear\n\nFixes MCP-1\n';

function check(
  title: string,
  body: string,
  author = 'a-person',
  exemptAuthors?: readonly string[],
): string {
  return checkPrTitle({
    title,
    body,
    author,
    ...(exemptAuthors === undefined ? {} : { exemptAuthors }),
  }).join('\n');
}

describe('pr-title', () => {
  it('passes a Linear id, a conventional summary and a closing keyword', () => {
    expect(check('MCP-1: feat(server): add tool', fixes)).toBe('');
  });

  it('refuses a title with no id or conventional type and names the fix', () => {
    const errors = check('update stuff', fixes);
    expect(errors).toContain("'MCP-123: type(scope): summary'");
    expect(errors).toContain('start with a Linear id');
  });

  it('refuses a conventional title that has no Linear id', () => {
    expect(check('feat(server): add tool', fixes)).toContain('start with a Linear id');
  });

  it('refuses References with no reason', () => {
    expect(check('MCP-1: feat(server): add tool', '## Linear\n\nReferences MCP-1\n')).toContain(
      "'References' needs a stated reason",
    );
  });

  it('refuses a body with only Refs and names the closing keywords', () => {
    expect(check('MCP-1: feat(server): add tool', '## Linear\n\nRefs: MCP-1\n')).toContain(
      'Fixes MCP-123',
    );
  });

  it('passes References with a stated reason', () => {
    const body = '## Linear\n\nReferences MCP-1, the parent issue this PR does not complete\n';
    expect(check('MCP-1: feat(server): add tool', body)).toBe('');
  });

  it('refuses a body with no Linear section', () => {
    expect(check('MCP-1: feat(server): add tool', '## Why\n\nBecause.\n')).toContain(
      "no '## Linear'",
    );
  });

  it('ignores the template placeholder inside an HTML comment', () => {
    expect(check('MCP-1: fix: x', '## Linear\n\n<!-- Fixes MCP-9 -->\n')).not.toBe('');
  });

  it('ignores a closing keyword hidden by a nested HTML comment', () => {
    expect(check('MCP-1: fix: x', '## Linear\n\n<!<!-- -->-- Fixes MCP-9 -->\n')).not.toBe('');
  });

  it('ignores a closing keyword after a nested opener inside one comment', () => {
    expect(check('MCP-1: fix: x', '## Linear\n\n<!-- <!-- Fixes MCP-1 -->\n')).not.toBe('');
  });

  it('counts a closing keyword that follows a closed comment', () => {
    expect(check('MCP-1: fix: x', '## Linear\n\n<!-- note -->\nFixes MCP-1\n')).toBe('');
  });

  it('ignores a closing keyword inside an unclosed comment', () => {
    expect(check('MCP-1: fix: x', '## Linear\n\n<!-- Fixes MCP-1\n')).not.toBe('');
  });

  it('ignores a section heading inside an unclosed comment', () => {
    expect(check('MCP-1: fix: x', '<!--\n## Linear\n\nFixes MCP-1\n')).toContain(
      "no '## Linear' section",
    );
  });

  it('keeps text around a closer that has no opener', () => {
    expect(check('MCP-1: fix: x', '## Linear\n\n--> Fixes MCP-1\n')).toBe('');
  });

  it.each(['dependabot[bot]', INVENTED_APP])(
    'exempts %s from the id and the Linear section',
    (author) => {
      expect(
        check('chore(deps): bump x from 1 to 2', '', author, [...EXEMPT_AUTHORS, INVENTED_APP]),
      ).toBe('');
    },
  );

  it('still requires a conventional title from an exempt author', () => {
    expect(check('bump x', '', 'dependabot[bot]')).toContain('Conventional Commits');
  });

  it('refuses a Dependabot-style title from a normal author', () => {
    expect(check('chore(deps): bump x from 1 to 2', '', 'a-person')).toContain(
      'start with a Linear id',
    );
  });

  it('strips nested comments at the 65,536 character body cap', () => {
    const pairs = Math.floor((65_536 - 30) / 8);
    const nested = '<!'.repeat(pairs) + '<!-- -->' + '-- -->'.repeat(pairs);
    expect(check('MCP-1: fix: x', `## Linear\nFixes MCP-1\n${nested}`)).toBe('');
  });
});
