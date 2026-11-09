const HEADER = /^(?:[A-Z][A-Z0-9]*-\d+: )?(\w+)(?:\([^)]*\))?(!)?: /;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGES?\b/m;
const NON_RELEASING = new Set(['chore', 'docs', 'ci', 'test']);
const RELEASING = new Set(['feat', 'fix']);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)__tests__\//;

export function isRuntimeFile(path: string): boolean {
  return (
    /^(?:apps|packages)\//.test(path) &&
    !TEST_FILE.test(path) &&
    !path.endsWith('.md') &&
    !path.endsWith('/package.json')
  );
}

export function checkVersion(input: {
  title: string;
  body: string;
  changed: readonly string[];
}): string[] {
  const { title, body, changed } = input;
  const match = HEADER.exec(title);
  if (match === null) {
    return [];
  }
  const [, type = '', bang] = match;
  const errors: string[] = [];
  if (bang !== undefined) {
    errors.push(
      "The title uses '!' after the type. Only a person bumps the major version, by editing package.json in its own PR.",
    );
  }
  if (BREAKING_FOOTER.test(body)) {
    errors.push(
      'The body carries a BREAKING CHANGE footer. Only a person bumps the major version, by editing package.json in its own PR.',
    );
  }
  const runtime = changed.filter(isRuntimeFile);
  if (NON_RELEASING.has(type) && runtime.length > 0) {
    errors.push(
      `The type '${type}' does not release, but the diff changes runtime code (${runtime.slice(0, 3).join(', ')}). Use feat or fix.`,
    );
  }
  if (RELEASING.has(type) && runtime.length === 0) {
    errors.push(
      `The type '${type}' releases, but the diff changes no runtime code under apps/ or packages/. Use chore, docs, ci or test.`,
    );
  }
  return errors;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

if (import.meta.main) {
  const changed = (await readStdin()).split('\0').filter(Boolean);
  const title = process.env['PR_TITLE'] ?? '';
  const errors = checkVersion({ title, body: process.env['PR_BODY'] ?? '', changed });
  if (errors.length > 0) {
    process.stderr.write(
      [
        `version-check: refused. Title ${JSON.stringify(title)}`,
        ...errors.map((e) => `- ${e}`),
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  process.stdout.write('version-check: ok\n');
}
