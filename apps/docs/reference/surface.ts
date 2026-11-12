import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  PromptEntry,
  Reference,
  ResourceEntry,
  ResourceTemplateEntry,
  ToolAnnotations,
  ToolEntry,
} from './types.ts';

export const SERVED_SURFACE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'server',
  'served-surface.json',
);

type Fields = Readonly<Record<string, unknown>>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fail(where: string, problem: string): never {
  throw new Error(`served-surface.json is malformed: ${where} ${problem}`);
}

function list(source: Fields, key: string): readonly Fields[] {
  const value = source[key];
  if (!Array.isArray(value)) fail(key, 'is not an array');
  return value.map((item: unknown, index) =>
    isFields(item) ? item : fail(`${key}[${String(index)}]`, 'is not an object'),
  );
}

function collection(surface: Fields, key: string, id: string): readonly Fields[] {
  const value = surface[key];
  if (!isFields(value)) fail(key, 'is not an object keyed by id');
  return Object.entries(value).map(([entryId, entry]) => {
    if (!isFields(entry)) fail(`${key}.${entryId}`, 'is not an object');
    if (entry[id] !== entryId) fail(`${key}.${entryId}`, `has a different ${id}`);
    return entry;
  });
}

function text(source: Fields, key: string, where: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : fail(`${where}.${key}`, 'is not a string');
}

function optionalText(source: Fields, key: string, where: string): string | undefined {
  return source[key] === undefined ? undefined : text(source, key, where);
}

function optionalFlag(source: Fields, key: string, where: string): boolean | undefined {
  const value = source[key];
  if (value === undefined || typeof value === 'boolean') return value;
  return fail(`${where}.${key}`, 'is not a boolean');
}

function annotations(tool: Fields, where: string): ToolAnnotations | undefined {
  const value = tool['annotations'];
  if (value === undefined) return undefined;
  if (!isFields(value)) return fail(`${where}.annotations`, 'is not an object');
  const at = `${where}.annotations`;
  return {
    title: optionalText(value, 'title', at),
    readOnlyHint: optionalFlag(value, 'readOnlyHint', at),
    destructiveHint: optionalFlag(value, 'destructiveHint', at),
    idempotentHint: optionalFlag(value, 'idempotentHint', at),
    openWorldHint: optionalFlag(value, 'openWorldHint', at),
  };
}

function tool(source: Fields, index: number): ToolEntry {
  const where = `tools[${String(index)}]`;
  const schema = source['inputSchema'];
  const toolAnnotations = annotations(source, where);
  return {
    name: text(source, 'name', where),
    title: optionalText(source, 'title', where) ?? toolAnnotations?.title,
    description: optionalText(source, 'description', where),
    annotations: toolAnnotations,
    inputSchema: isFields(schema) ? schema : fail(`${where}.inputSchema`, 'is not an object'),
  };
}

function resource(source: Fields, index: number): ResourceEntry {
  const where = `resources[${String(index)}]`;
  return {
    uri: text(source, 'uri', where),
    name: text(source, 'name', where),
    title: optionalText(source, 'title', where),
    description: optionalText(source, 'description', where),
    mimeType: optionalText(source, 'mimeType', where),
  };
}

function resourceTemplate(source: Fields, index: number): ResourceTemplateEntry {
  const where = `resourceTemplates[${String(index)}]`;
  return {
    uriTemplate: text(source, 'uriTemplate', where),
    name: text(source, 'name', where),
    title: optionalText(source, 'title', where),
    description: optionalText(source, 'description', where),
    mimeType: optionalText(source, 'mimeType', where),
  };
}

function prompt(source: Fields, index: number): PromptEntry {
  const where = `prompts[${String(index)}]`;
  const args = source['arguments'] === undefined ? undefined : list(source, 'arguments');
  return {
    name: text(source, 'name', where),
    title: optionalText(source, 'title', where),
    description: optionalText(source, 'description', where),
    arguments: args?.map((argument, item) => {
      const at = `${where}.arguments[${String(item)}]`;
      return {
        name: text(argument, 'name', at),
        description: optionalText(argument, 'description', at),
        required: optionalFlag(argument, 'required', at),
      };
    }),
  };
}

/** Maps the server's committed surface snapshot to the docs reference. */
export function toReference(snapshot: unknown): Reference {
  if (!isFields(snapshot)) fail('the document', 'is not an object');
  const surface = snapshot['surface'];
  if (!isFields(surface)) fail('surface', 'is not an object');
  return {
    tools: collection(surface, 'tools', 'name').map(tool),
    resources: collection(surface, 'resources', 'uri').map(resource),
    resourceTemplates: collection(surface, 'resourceTemplates', 'uriTemplate').map(
      resourceTemplate,
    ),
    prompts: collection(surface, 'prompts', 'name').map(prompt),
  };
}
