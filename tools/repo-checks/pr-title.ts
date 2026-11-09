export const RELEASE_APP_LOGIN = 'release-app-login-not-set[bot]';

export const EXEMPT_AUTHORS: readonly string[] = ['dependabot[bot]', RELEASE_APP_LOGIN];

const TYPES = 'feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert';
const CONVENTIONAL = new RegExp(`^(?:[A-Z][A-Z0-9]*-\\d+: )?(?:${TYPES})(?:\\([^)]+\\))?!?: \\S`);
const LINEAR_PREFIX = /^[A-Z][A-Z0-9]*-\d+: /;
const CLOSING = /\b(?:fixes|closes|resolves)\s+[A-Z][A-Z0-9]*-\d+/i;
const REFERENCES = /\breferences\s+[A-Z][A-Z0-9]*-\d+[ \t]*(.*)$/im;
const MIN_REASON_WORDS = 3;

export function section(body: string, heading: string): string | undefined {
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase(),
  );
  if (start === -1) {
    return undefined;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

function linearErrors(body: string): string[] {
  const linear = section(body, 'Linear');
  if (linear === undefined) {
    return ["The body has no '## Linear' section. Add it with 'Fixes MCP-123'."];
  }
  if (CLOSING.test(linear)) {
    return [];
  }
  const reason = REFERENCES.exec(linear)?.[1]?.replace(/^[\s:,.\-–—]+/, '');
  if (reason === undefined) {
    return [
      "The '## Linear' section must close the leaf with 'Fixes MCP-123' (or Closes, Resolves), or use 'References MCP-123' with a stated reason.",
    ];
  }
  if (reason.split(/\s+/).filter(Boolean).length < MIN_REASON_WORDS) {
    return [
      "'References' needs a stated reason after the id, for example 'References MCP-123, the parent issue this PR does not complete'. Use 'Fixes' if the PR delivers a leaf.",
    ];
  }
  return [];
}

function isExemptAuthor(
  author: string,
  exemptAuthors: readonly string[] = EXEMPT_AUTHORS,
): boolean {
  return exemptAuthors.includes(author);
}

export function checkPrTitle(input: {
  title: string;
  body: string;
  author: string;
  exemptAuthors?: readonly string[];
}): string[] {
  const { title, body, author, exemptAuthors = EXEMPT_AUTHORS } = input;
  const errors: string[] = [];
  if (!CONVENTIONAL.test(title)) {
    errors.push(
      "The title must read 'MCP-123: type(scope): summary', with a Conventional Commits type such as feat, fix, docs or chore.",
    );
  }
  if (isExemptAuthor(author, exemptAuthors)) {
    return errors;
  }
  if (!LINEAR_PREFIX.test(title)) {
    errors.push(
      "The title must start with a Linear id and a colon, as in 'MCP-123: feat(server): add tool'.",
    );
  }
  return [...errors, ...linearErrors(body)];
}

if (import.meta.main) {
  const errors = checkPrTitle({
    title: process.env['PR_TITLE'] ?? '',
    body: process.env['PR_BODY'] ?? '',
    author: process.env['PR_AUTHOR'] ?? '',
  });
  if (errors.length > 0) {
    process.stderr.write(
      [
        `pr-title: refused. Title ${JSON.stringify(process.env['PR_TITLE'] ?? '')}`,
        ...errors.map((e) => `- ${e}`),
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  process.stdout.write('pr-title: ok\n');
}
