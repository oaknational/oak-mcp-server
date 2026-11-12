import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  diffSurfaces,
  parseBaseline,
  type Json,
  type JsonObject,
  type SurfaceSnapshot,
} from '../surface-diff/surface-diff.ts';

const HEADER = /^(?:[A-Z][A-Z0-9]*-\d+: )?(\w+)(?:\([^)]*\))?(!)?: /;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGES?\b/m;
const NON_RELEASING = new Set(['chore', 'docs', 'ci', 'test']);
const RELEASING = new Set(['feat', 'fix']);
const BREAKING_SECTION = /^##\s+Breaking change\s*$/im;
const BASELINE = 'tools/surface-diff/baseline.json';
const SERVED_SURFACE = 'apps/server/served-surface.json';
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)__tests__\//;

export function isRuntimeFile(path: string): boolean {
  return (
    /^(?:apps|packages)\//.test(path) &&
    !TEST_FILE.test(path) &&
    !path.endsWith('.md') &&
    !path.endsWith('/package.json') &&
    path !== SERVED_SURFACE
  );
}

export interface SurfaceChange {
  readonly before: SurfaceSnapshot | undefined;
  readonly after: SurfaceSnapshot | undefined;
}

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredParams(tool: JsonObject): Set<string> {
  const schema = tool['inputSchema'];
  const required = isObject(schema) ? schema['required'] : undefined;
  const names: readonly Json[] = Array.isArray(required) ? required : [];
  return new Set(names.filter((name) => typeof name === 'string'));
}

function classifySurfaceChange(change: SurfaceChange | undefined): {
  toolsChanged: boolean;
  breaking: string[];
} {
  if (change?.before === undefined || change.after === undefined) {
    return { toolsChanged: false, breaking: [] };
  }
  const { before, after } = change;
  const toolDifferences = diffSurfaces(before, after).filter(
    (d) => d.kind !== 'server-changed' && d.collection === 'tools',
  );
  const breaking: string[] = [];
  for (const difference of toolDifferences) {
    if (difference.kind === 'removed') {
      breaking.push(`removes or renames tool "${difference.id}"`);
    }
  }
  for (const [name, tool] of Object.entries(after.tools)) {
    const previous = before.tools[name];
    if (previous === undefined) {
      continue;
    }
    const wasRequired = requiredParams(previous);
    const added = [...requiredParams(tool)].filter((param) => !wasRequired.has(param));
    if (added.length > 0) {
      breaking.push(`makes ${added.join(', ')} required on tool "${name}"`);
    }
    if (
      previous['outputSchema'] !== undefined &&
      JSON.stringify(previous['outputSchema']) !== JSON.stringify(tool['outputSchema'])
    ) {
      breaking.push(`changes the output shape of tool "${name}"`);
    }
  }
  return { toolsChanged: toolDifferences.length > 0, breaking };
}

export function checkVersion(input: {
  title: string;
  body: string;
  changed: readonly string[];
  surface?: SurfaceChange;
}): string[] {
  const { title, body, changed, surface } = input;
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
  const { toolsChanged, breaking } = classifySurfaceChange(surface);
  if (toolsChanged && !RELEASING.has(type)) {
    errors.push(
      `The diff changes the served tools in ${BASELINE}, so the type '${type}' must release. Use feat or fix.`,
    );
  }
  if (breaking.length > 0 && !BREAKING_SECTION.test(body)) {
    errors.push(
      `The diff ${breaking.join('; ')}. A breaking change to the served tools needs a '## Breaking change' section in the PR body.`,
    );
  }
  return errors;
}

function readBaselineAt(baseSha: string | undefined): SurfaceSnapshot | undefined {
  if (baseSha === undefined || baseSha === '') {
    return undefined;
  }
  let text: string;
  try {
    text = execFileSync('git', ['show', `${baseSha}:${BASELINE}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
  return parseBaseline(text);
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
  const surface: SurfaceChange = {
    before: readBaselineAt(process.env['BASE_SHA']),
    after: parseBaseline(readFileSync(BASELINE, 'utf8')),
  };
  const errors = checkVersion({ title, body: process.env['PR_BODY'] ?? '', changed, surface });
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
