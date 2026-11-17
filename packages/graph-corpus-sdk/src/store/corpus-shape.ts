import { err, isOk, ok, type Result } from '@oaknational/result';
import type {
  GraphCorpus,
  GraphCorpusEdgeType,
  GraphCorpusNode,
} from '@oaknational/sdk-codegen/graph-corpus';

type NodeKind = GraphCorpusNode['kind'];
type FieldType = 'string' | 'number' | 'number?' | 'string[]';

const NODE_FIELDS: Readonly<Record<NodeKind, Readonly<Record<string, FieldType>>>> = {
  unit: {
    unitSlug: 'string',
    unitTitle: 'string',
    subject: 'string',
    keyStage: 'string',
    year: 'number?',
    priorKnowledge: 'string[]',
    threadSlugs: 'string[]',
  },
  thread: { threadSlug: 'string', title: 'string', firstYear: 'number?', lastYear: 'number?' },
  lesson: { lessonSlug: 'string', lessonTitle: 'string', subject: 'string', keyStage: 'string' },
  misconception: { misconception: 'string', response: 'string' },
  keyword: {
    term: 'string',
    description: 'string',
    frequency: 'number',
    firstYear: 'number',
    subjects: 'string[]',
  },
};

const EDGE_ENDPOINTS: Readonly<
  Record<GraphCorpusEdgeType, readonly [source: NodeKind, target: NodeKind]>
> = {
  prerequisiteFor: ['unit', 'unit'],
  containsUnit: ['thread', 'unit'],
  containsLesson: ['unit', 'lesson'],
  addressesMisconception: ['lesson', 'misconception'],
  containsKeyword: ['lesson', 'keyword'],
};

type NodeKinds = ReadonlyMap<string, NodeKind>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKey<T extends object>(table: T, key: unknown): key is keyof T {
  return typeof key === 'string' && Object.hasOwn(table, key);
}

function hasType(value: unknown, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'number?':
      return value === undefined || typeof value === 'number';
    case 'string[]':
      return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }
}

function parseNode(node: unknown): Result<readonly [id: string, kind: NodeKind], string> {
  if (!isRecord(node) || !isKey(NODE_FIELDS, node['kind'])) {
    return err(`has a node of unknown kind: ${JSON.stringify(node)}`);
  }
  const { kind, id } = node;
  if (typeof id !== 'string' || !id.startsWith(`${kind}:`)) {
    return err(`has ${kind} node id ${JSON.stringify(id)} without its "${kind}:" qualifier`);
  }
  for (const [field, type] of Object.entries(NODE_FIELDS[kind])) {
    if (!hasType(node[field], type)) {
      return err(`has ${id} whose ${field} is not ${type}`);
    }
  }
  return ok([id, kind]);
}

function indexNodes(nodes: unknown): Result<NodeKinds, string> {
  if (!Array.isArray(nodes)) {
    return err('is missing nodes');
  }
  const kinds = new Map<string, NodeKind>();
  for (const node of nodes) {
    const parsed = parseNode(node);
    if (!isOk(parsed)) {
      return parsed;
    }
    kinds.set(...parsed.value);
  }
  return ok(kinds);
}

function edgeProblem(edge: unknown, kinds: NodeKinds): string | undefined {
  if (!isRecord(edge) || !isKey(EDGE_ENDPOINTS, edge['type'])) {
    return `has an edge of unknown type: ${JSON.stringify(edge)}`;
  }
  const [sourceKind, targetKind] = EDGE_ENDPOINTS[edge['type']];
  if (kinds.get(String(edge['source'])) !== sourceKind) {
    return `has a ${edge['type']} edge whose source is not a ${sourceKind} node: ${JSON.stringify(edge)}`;
  }
  if (kinds.get(String(edge['target'])) !== targetKind) {
    return `has a ${edge['type']} edge whose target is not a ${targetKind} node: ${JSON.stringify(edge)}`;
  }
  return undefined;
}

function referenceProblem(
  id: unknown,
  kind: NodeKind,
  where: string,
  kinds: NodeKinds,
): string | undefined {
  return kinds.get(String(id)) === kind
    ? undefined
    : `has ${where} naming ${JSON.stringify(id)}, which is not a ${kind} node`;
}

function sequenceProblem(sequence: unknown, kinds: NodeKinds): string | undefined {
  if (
    !isRecord(sequence) ||
    typeof sequence['subject'] !== 'string' ||
    !Array.isArray(sequence['placements'])
  ) {
    return `has a malformed sequence: ${JSON.stringify(sequence)}`;
  }
  const threadProblem = referenceProblem(sequence['threadId'], 'thread', 'a sequence', kinds);
  if (threadProblem !== undefined) {
    return threadProblem;
  }
  for (const placement of sequence['placements']) {
    if (!isRecord(placement) || !hasType(placement['year'], 'number?')) {
      return `has a malformed sequence placement: ${JSON.stringify(placement)}`;
    }
    const unitProblem = referenceProblem(
      placement['unitId'],
      'unit',
      'a sequence placement',
      kinds,
    );
    if (unitProblem !== undefined) {
      return unitProblem;
    }
  }
  return undefined;
}

function unitLessonRunProblem(run: unknown, kinds: NodeKinds): string | undefined {
  if (!isRecord(run) || !Array.isArray(run['lessonIds'])) {
    return `has a malformed unit lesson run: ${JSON.stringify(run)}`;
  }
  const ids: readonly (readonly [unknown, NodeKind])[] = [
    [run['unitId'], 'unit'],
    ...run['lessonIds'].map((lessonId): readonly [unknown, NodeKind] => [lessonId, 'lesson']),
  ];
  for (const [id, kind] of ids) {
    const problem = referenceProblem(id, kind, 'a unit lesson run', kinds);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

function firstProblem(
  section: unknown,
  name: string,
  problemOf: (item: unknown) => string | undefined,
): string | undefined {
  if (!Array.isArray(section)) {
    return `is missing ${name}`;
  }
  for (const item of section) {
    const problem = problemOf(item);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

export function parseGraphCorpus(value: unknown): Result<GraphCorpus, string> {
  if (!isRecord(value)) {
    return err('is not an object');
  }
  const { stats } = value;
  if (
    !isRecord(stats) ||
    typeof stats['totalNodes'] !== 'number' ||
    typeof stats['totalEdges'] !== 'number'
  ) {
    return err('is missing stats');
  }
  const indexed = indexNodes(value['nodes']);
  if (!isOk(indexed)) {
    return indexed;
  }
  const kinds = indexed.value;
  const problem =
    firstProblem(value['edges'], 'edges', (edge) => edgeProblem(edge, kinds)) ??
    firstProblem(value['sequences'], 'sequences', (sequence) => sequenceProblem(sequence, kinds)) ??
    firstProblem(value['unitLessonRuns'], 'unitLessonRuns', (run) =>
      unitLessonRunProblem(run, kinds),
    );
  return problem === undefined ? ok(value as unknown as GraphCorpus) : err(problem);
}
