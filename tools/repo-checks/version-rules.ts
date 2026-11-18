import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  diffSurfaces,
  parseBaseline,
  type Json,
  type JsonObject,
  type SurfaceSnapshot,
} from '../surface-diff/surface-diff.ts';
import { diffFromMergeBase } from './changed-files.ts';

const HEADER = /^(?:[A-Z][A-Z0-9]*-\d+: )?(\w+)(?:\([^)]*\))?(!)?: /;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGES?\b/m;
export const RELEASE_BY_TYPE = {
  feat: 'minor',
  fix: 'patch',
  chore: false,
  docs: false,
  ci: false,
  test: false,
} as const;
const types = Object.entries(RELEASE_BY_TYPE);
const NON_RELEASING = new Set(types.filter(([, release]) => !release).map(([type]) => type));
const RELEASING = new Set(types.filter(([, release]) => release).map(([type]) => type));
const BREAKING_SECTION = /^##\s+Breaking change\s*$/im;
const SERVED_SURFACE = 'apps/server/served-surface.json';
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|e2e-tests)\//;
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;

export function isRuntimeFile(path: string): boolean {
  return (
    /^(?:apps|packages)\//.test(path) &&
    !TEST_FILE.test(path) &&
    !path.endsWith('.md') &&
    !path.endsWith('/package.json') &&
    path !== SERVED_SURFACE
  );
}

const printer = ts.createPrinter({ removeComments: true });
const COMPILER_DIRECTIVE_COMMENT = /@jsx|[#@]__[A-Z_]+__|^\/\/\/\s*</;

function isJSDocNode(node: ts.Node): boolean {
  return node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;
}

interface Directive {
  readonly tokensBefore: number;
  readonly attachment: 'trailing' | 'leading';
  readonly text: string;
}

function directivesByTokenOffset(file: ts.SourceFile): Directive[] {
  const text = file.getFullText();
  const found: Directive[] = [];
  let tokens = 0;
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(file).filter((child) => !isJSDocNode(child));
    if (children.length > 0) {
      children.forEach(visit);
      return;
    }
    const attached = [
      ['trailing', ts.getTrailingCommentRanges(text, node.pos)],
      ['leading', ts.getLeadingCommentRanges(text, node.pos)],
    ] as const;
    for (const [attachment, ranges] of attached) {
      for (const range of ranges ?? []) {
        const comment = text.slice(range.pos, range.end);
        if (COMPILER_DIRECTIVE_COMMENT.test(comment)) {
          found.push({ tokensBefore: tokens, attachment, text: comment });
        }
      }
    }
    tokens += 1;
  };
  visit(file);
  return found;
}

function fingerprint(path: string, text: string): string {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  return JSON.stringify([printer.printFile(file), directivesByTokenOffset(file)]);
}

export function changesCode(
  path: string,
  before: string | undefined,
  after: string | undefined,
): boolean {
  if (before === undefined || after === undefined || !SCRIPT_FILE.test(path)) {
    return before !== after;
  }
  return fingerprint(path, before) !== fingerprint(path, after);
}

export interface SurfaceChange {
  readonly before: SurfaceSnapshot;
  readonly after: SurfaceSnapshot;
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
  if (change === undefined) {
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
  const { toolsChanged, breaking } = classifySurfaceChange(surface);
  if (RELEASING.has(type) && runtime.length === 0 && !toolsChanged) {
    errors.push(
      `The type '${type}' releases, but the diff changes no runtime code under apps/ or packages/ and no served tool in ${SERVED_SURFACE}. Use chore, docs, ci or test.`,
    );
  }
  if (toolsChanged && !RELEASING.has(type)) {
    errors.push(
      `The diff changes the served tools in ${SERVED_SURFACE}, so the type '${type}' must release. Use feat or fix.`,
    );
  }
  if (breaking.length > 0 && !BREAKING_SECTION.test(body)) {
    errors.push(
      `The diff ${breaking.join('; ')}. A breaking change to the served tools needs a '## Breaking change' section in the PR body.`,
    );
  }
  return errors;
}

function showAt(sha: string, path: string): string | undefined {
  const result = spawnSync('git', ['show', `${sha}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : undefined;
}

function readServedSurfaceAt(sha: string): SurfaceSnapshot {
  const text = showAt(sha, SERVED_SURFACE);
  if (text === undefined) {
    throw new Error(
      `cannot read ${SERVED_SURFACE} at the merge base ${sha}. Rebase onto main so the base has it.`,
    );
  }
  return parseBaseline(text);
}

if (import.meta.main) {
  const { mergeBase, changed } = diffFromMergeBase(process.env['BASE_SHA'] ?? '');
  const title = process.env['PR_TITLE'] ?? '';
  const surface: SurfaceChange = {
    before: readServedSurfaceAt(mergeBase),
    after: parseBaseline(readFileSync(SERVED_SURFACE, 'utf8')),
  };
  const codeChanged = changed.filter(
    (path) =>
      !isRuntimeFile(path) || changesCode(path, showAt(mergeBase, path), showAt('HEAD', path)),
  );
  const errors = checkVersion({
    title,
    body: process.env['PR_BODY'] ?? '',
    changed: codeChanged,
    surface,
  });
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
