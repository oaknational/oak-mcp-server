import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { format, resolveConfig } from 'prettier';

export type Json = null | boolean | number | string | readonly Json[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: Json;
}

const COLLECTION_NAMES = ['tools', 'resources', 'resourceTemplates', 'prompts'] as const;
type Collection = (typeof COLLECTION_NAMES)[number];
const COLLECTIONS: Readonly<Record<Collection, string>> = {
  tools: 'tool',
  resources: 'resource',
  resourceTemplates: 'resource template',
  prompts: 'prompt',
};

export type SurfaceSnapshot = { readonly server: JsonObject } & {
  readonly [C in Collection]: Readonly<Record<string, JsonObject>>;
};

export type Difference =
  | { readonly kind: 'added' | 'removed'; readonly collection: Collection; readonly id: string }
  | {
      readonly kind: 'changed';
      readonly collection: Collection;
      readonly id: string;
      readonly path: readonly string[];
      readonly before: Json | undefined;
      readonly after: Json | undefined;
    }
  | {
      readonly kind: 'server-changed';
      readonly path: readonly string[];
      readonly before: Json | undefined;
      readonly after: Json | undefined;
    };

export type DifferenceLocation =
  | Extract<Difference, { kind: 'added' | 'removed' }>
  | Omit<Extract<Difference, { kind: 'changed' }>, 'before' | 'after'>
  | Omit<Extract<Difference, { kind: 'server-changed' }>, 'before' | 'after'>;

export interface ExpectedDifference {
  readonly location: DifferenceLocation;
  readonly reason: string;
}

export const EXPECTED_DIFFERENCES: readonly ExpectedDifference[] = [
  {
    location: { kind: 'removed', collection: 'tools', id: 'oak-under-the-hood' },
    reason: 'the program deletes the under-the-hood tool, which describes OOCE',
  },
];

export interface SurfaceReport {
  readonly unexpected: readonly Difference[];
  readonly expectedPresent: readonly ExpectedDifference[];
  readonly expectedAbsent: readonly ExpectedDifference[];
}

const BASELINE_PATH = fileURLToPath(new URL('baseline.json', import.meta.url));

function isObjectNode(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArrayNode(value: Json | undefined): value is readonly Json[] {
  return Array.isArray(value);
}

function isJson(value: unknown): value is Json {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJson);
  }
  return typeof value === 'object' && Object.values(value).every(isJson);
}

function parseJsonObject(value: unknown, what: string): JsonObject {
  if (!isJson(value) || !isObjectNode(value)) {
    throw new Error(`${what} is not a JSON object`);
  }
  return value;
}

function toJsonObject(value: unknown, what: string): JsonObject {
  const roundTripped: unknown = JSON.parse(JSON.stringify(value));
  return parseJsonObject(roundTripped, what);
}

function normaliseText(text: string): string {
  return text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

const byKey = ([a]: readonly [string, unknown], [b]: readonly [string, unknown]) =>
  a < b ? -1 : a > b ? 1 : 0;

function normalise(value: Json): Json {
  if (typeof value === 'string') {
    return normaliseText(value);
  }
  if (isArrayNode(value)) {
    return value.map(normalise);
  }
  return isObjectNode(value) ? normaliseObject(value) : value;
}

function normaliseObject(value: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(value)
      .sort(byKey)
      .map(([key, child]) => [key, normalise(child)]),
  );
}

function normaliseCollection(
  entities: Readonly<Record<string, JsonObject>>,
): Record<string, JsonObject> {
  return Object.fromEntries(
    Object.entries(entities)
      .sort(byKey)
      .map(([id, entity]) => [id, normaliseObject(entity)]),
  );
}

export function normaliseSnapshot(snapshot: SurfaceSnapshot): SurfaceSnapshot {
  return {
    server: normaliseObject(snapshot.server),
    tools: normaliseCollection(snapshot.tools),
    resources: normaliseCollection(snapshot.resources),
    resourceTemplates: normaliseCollection(snapshot.resourceTemplates),
    prompts: normaliseCollection(snapshot.prompts),
  };
}

function keyBy(
  items: readonly unknown[],
  idField: string,
  collection: Collection,
): Record<string, JsonObject> {
  const keyed: Record<string, JsonObject> = {};
  for (const item of items) {
    const entity = toJsonObject(item, `a ${COLLECTIONS[collection]}`);
    const id = entity[idField];
    if (typeof id !== 'string') {
      throw new Error(`a ${COLLECTIONS[collection]} has no string ${idField}`);
    }
    if (id in keyed) {
      throw new Error(`the server lists ${COLLECTIONS[collection]} "${id}" twice`);
    }
    keyed[id] = entity;
  }
  return keyed;
}

async function collectPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<readonly [readonly T[], string | undefined]>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const [page, next] = await fetchPage(cursor);
    items.push(...page);
    cursor = next;
  } while (cursor !== undefined);
  return items;
}

const pageParams = (cursor: string | undefined) => (cursor === undefined ? {} : { cursor });

export async function captureSurface(client: Client): Promise<SurfaceSnapshot> {
  const capabilities = client.getServerCapabilities() ?? {};
  const implementation = client.getServerVersion();
  if (implementation === undefined) {
    throw new Error('the server sent no serverInfo');
  }
  const serverInfo = Object.fromEntries(
    Object.entries(implementation).filter(([key]) => key !== 'version'),
  );
  const tools = capabilities.tools
    ? await collectPages(async (cursor) => {
        const page = await client.listTools(pageParams(cursor));
        return [page.tools, page.nextCursor];
      })
    : [];
  const resources = capabilities.resources
    ? await collectPages(async (cursor) => {
        const page = await client.listResources(pageParams(cursor));
        return [page.resources, page.nextCursor];
      })
    : [];
  const resourceTemplates = capabilities.resources
    ? await collectPages(async (cursor) => {
        const page = await client.listResourceTemplates(pageParams(cursor));
        return [page.resourceTemplates, page.nextCursor];
      })
    : [];
  const prompts = capabilities.prompts
    ? await collectPages(async (cursor) => {
        const page = await client.listPrompts(pageParams(cursor));
        return [page.prompts, page.nextCursor];
      })
    : [];
  return normaliseSnapshot({
    server: toJsonObject(
      { serverInfo, capabilities, instructions: client.getInstructions() ?? null },
      'the server block',
    ),
    tools: keyBy(tools, 'name', 'tools'),
    resources: keyBy(resources, 'uri', 'resources'),
    resourceTemplates: keyBy(resourceTemplates, 'uriTemplate', 'resourceTemplates'),
    prompts: keyBy(prompts, 'name', 'prompts'),
  });
}

function* compareValues(
  before: Json | undefined,
  after: Json | undefined,
  path: readonly string[],
): Generator<{ path: readonly string[]; before: Json | undefined; after: Json | undefined }> {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }
  if (isObjectNode(before) && isObjectNode(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      yield* compareValues(before[key], after[key], [...path, key]);
    }
    return;
  }
  if (isArrayNode(before) && isArrayNode(after)) {
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
      yield* compareValues(before[index], after[index], [...path, String(index)]);
    }
    return;
  }
  yield { path, before, after };
}

export function diffSurfaces(baseline: SurfaceSnapshot, current: SurfaceSnapshot): Difference[] {
  const differences: Difference[] = [];
  for (const change of compareValues(baseline.server, current.server, [])) {
    differences.push({ kind: 'server-changed', ...change });
  }
  for (const collection of COLLECTION_NAMES) {
    const before = baseline[collection];
    const after = current[collection];
    const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const id of ids) {
      const beforeEntity = before[id];
      const afterEntity = after[id];
      if (beforeEntity === undefined) {
        differences.push({ kind: 'added', collection, id });
      } else if (afterEntity === undefined) {
        differences.push({ kind: 'removed', collection, id });
      } else {
        for (const change of compareValues(beforeEntity, afterEntity, [])) {
          differences.push({ kind: 'changed', collection, id, ...change });
        }
      }
    }
  }
  return differences;
}

function describeLocation(location: DifferenceLocation): string {
  switch (location.kind) {
    case 'added':
    case 'removed':
      return `${location.kind} ${COLLECTIONS[location.collection]} "${location.id}"`;
    case 'changed':
      return `changed ${COLLECTIONS[location.collection]} "${location.id}" field ${location.path.join('.')}`;
    case 'server-changed':
      return `changed server field ${location.path.join('.')}`;
  }
}

export function judgeDifferences(
  differences: readonly Difference[],
  expected: readonly ExpectedDifference[],
): SurfaceReport {
  const expectedByLocation = new Map(
    expected.map((entry) => [describeLocation(entry.location), entry]),
  );
  const seen = new Set(differences.map(describeLocation));
  return {
    unexpected: differences.filter((d) => !expectedByLocation.has(describeLocation(d))),
    expectedPresent: expected.filter((entry) => seen.has(describeLocation(entry.location))),
    expectedAbsent: expected.filter((entry) => !seen.has(describeLocation(entry.location))),
  };
}

const CONTEXT = 40;

function showChange(before: Json | undefined, after: Json | undefined): readonly [string, string] {
  if (typeof before !== 'string' || typeof after !== 'string') {
    const show = (value: Json | undefined) =>
      value === undefined ? '(absent)' : JSON.stringify(value);
    return [show(before), show(after)];
  }
  let start = 0;
  while (start < before.length && before[start] === after[start]) {
    start += 1;
  }
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end += 1;
  }
  const from = Math.max(0, start - CONTEXT);
  const excerpt = (text: string) => {
    const to = Math.min(text.length, text.length - end + CONTEXT);
    const head = from > 0 ? '…' : '';
    const tail = to < text.length ? '…' : '';
    return `${head}${JSON.stringify(text.slice(from, to))}${tail}`;
  };
  return [excerpt(before), excerpt(after)];
}

function describeDifference(difference: Difference): string[] {
  const headline = describeLocation(difference);
  if (difference.kind !== 'changed' && difference.kind !== 'server-changed') {
    return [headline];
  }
  const [before, after] = showChange(difference.before, difference.after);
  return [headline, `    before: ${before}`, `    after:  ${after}`];
}

export function formatReport(report: SurfaceReport): string {
  const lines =
    report.unexpected.length === 0
      ? ['surface identical']
      : [
          `surface differs: ${String(report.unexpected.length)} unexpected ${report.unexpected.length === 1 ? 'difference' : 'differences'}`,
          ...report.unexpected.flatMap((d) => describeDifference(d).map((line) => `  ${line}`)),
        ];
  for (const entry of report.expectedPresent) {
    lines.push(`expected difference: ${describeLocation(entry.location)} (${entry.reason})`);
  }
  for (const entry of report.expectedAbsent) {
    lines.push(`expected difference not present: ${describeLocation(entry.location)}`);
  }
  return `${lines.join('\n')}\n`;
}

function parseCollection(surface: JsonObject, collection: Collection): Record<string, JsonObject> {
  const entities = parseJsonObject(surface[collection], `the baseline field "${collection}"`);
  return Object.fromEntries(
    Object.entries(entities).map(([id, entity]) => [
      id,
      parseJsonObject(entity, `baseline ${COLLECTIONS[collection]} "${id}"`),
    ]),
  );
}

export function parseBaseline(text: string): SurfaceSnapshot {
  const baseline = parseJsonObject(JSON.parse(text), 'the baseline');
  const surface = parseJsonObject(baseline.surface, 'the baseline field "surface"');
  return normaliseSnapshot({
    server: parseJsonObject(surface.server, 'the baseline field "server"'),
    tools: parseCollection(surface, 'tools'),
    resources: parseCollection(surface, 'resources'),
    resourceTemplates: parseCollection(surface, 'resourceTemplates'),
    prompts: parseCollection(surface, 'prompts'),
  });
}

async function captureTarget(target: URL): Promise<SurfaceSnapshot> {
  const client = new Client({ name: 'oak-surface-diff', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(target));
  try {
    return await captureSurface(client);
  } finally {
    await client.close();
  }
}

async function writeBaseline(snapshot: SurfaceSnapshot, source: string): Promise<void> {
  const text = JSON.stringify({ source, surface: snapshot });
  const options = (await resolveConfig(BASELINE_PATH)) ?? {};
  writeFileSync(BASELINE_PATH, await format(text, { ...options, filepath: BASELINE_PATH }));
}

async function main(argv: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: { target: { type: 'string' }, 'write-baseline': { type: 'string' } },
    strict: true,
  });
  if (values.target === undefined) {
    process.stderr.write(
      'surface-diff: pass --target <url> of a running MCP endpoint, for example http://localhost:3333/mcp.\n',
    );
    return 2;
  }
  const current = await captureTarget(new URL(values.target));
  const source = values['write-baseline'];
  if (source !== undefined) {
    await writeBaseline(current, source);
    process.stdout.write(`wrote ${relative(process.cwd(), BASELINE_PATH)} from ${source}\n`);
    return 0;
  }
  const baseline = parseBaseline(readFileSync(BASELINE_PATH, 'utf8'));
  const report = judgeDifferences(diffSurfaces(baseline, current), EXPECTED_DIFFERENCES);
  process.stdout.write(formatReport(report));
  return report.unexpected.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `surface-diff: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
