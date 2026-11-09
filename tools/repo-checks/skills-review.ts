import { readFileSync } from 'node:fs';

import { fromMarkdown } from 'mdast-util-from-markdown';

interface Pin {
  name: string;
  source: string;
  ref: string;
  skillPath: string;
}

interface Review {
  sources: string[];
  shas: string[];
}

type Root = ReturnType<typeof fromMarkdown>;
type Block = Root['children'][number];

const SKILL_HEADING_DEPTH = 3;
const FULL_SHA = /^[0-9a-f]{40}$/;

function parsePins(lockText: string): Pin[] {
  const lock = JSON.parse(lockText) as {
    skills?: Record<string, { source?: unknown; ref?: unknown; skillPath?: unknown }>;
  };
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  return Object.entries(lock.skills ?? {}).map(([name, pin]) => ({
    name,
    source: text(pin.source),
    ref: text(pin.ref),
    skillPath: text(pin.skillPath),
  }));
}

function headingName(block: Block): string | undefined {
  if (block.type !== 'heading') {
    return undefined;
  }
  const [only] = block.children;
  return block.children.length === 1 && only?.type === 'text' ? only.value.trim() : undefined;
}

function listedSha(block: Block): string | undefined {
  if (block.type !== 'paragraph') {
    return undefined;
  }
  const [label, code, ...extra] = block.children;
  return label?.type === 'text' &&
    label.value === 'SHA: ' &&
    code?.type === 'inlineCode' &&
    extra.length === 0
    ? code.value
    : undefined;
}

function listedSource(block: Block): string | undefined {
  if (block.type !== 'paragraph') {
    return undefined;
  }
  const codes = block.children.flatMap((node) => (node.type === 'inlineCode' ? [node.value] : []));
  const [first] = block.children;
  return first?.type === 'text' && first.value.startsWith('Source: ')
    ? codes.slice(0, 2).join('\n')
    : undefined;
}

function reviewSections(reviewText: string): Map<string, Review[]> {
  const sections = new Map<string, Review[]>();
  let current: Review | undefined;
  for (const block of fromMarkdown(reviewText).children) {
    if (block.type === 'heading') {
      const name = block.depth === SKILL_HEADING_DEPTH ? headingName(block) : undefined;
      current = undefined;
      if (name !== undefined) {
        current = { sources: [], shas: [] };
        sections.set(name, [...(sections.get(name) ?? []), current]);
      }
      continue;
    }
    if (current === undefined || block.type !== 'list') {
      continue;
    }
    for (const item of block.children) {
      const [line] = item.children;
      if (item.children.length !== 1 || line === undefined) {
        continue;
      }
      const sha = listedSha(line);
      const source = listedSource(line);
      if (sha !== undefined) {
        current.shas.push(sha);
      }
      if (source !== undefined) {
        current.sources.push(source);
      }
    }
  }
  return sections;
}

export function checkSkillsReview(lockText: string, reviewText: string): string[] {
  const sections = reviewSections(reviewText);
  return parsePins(lockText).flatMap(({ name, source, ref, skillPath }) => {
    if (!FULL_SHA.test(ref)) {
      return [`${name}: the pin's ref must be a full 40-character commit SHA.`];
    }
    const own = sections.get(name) ?? [];
    const crowded = own.find((review) => review.shas.length > 1);
    if (crowded !== undefined) {
      return [
        `${name}: a review section lists more than one '- SHA:' line. Give each SHA its own '### ${name}' section.`,
      ];
    }
    const atRef = own.filter((review) => review.shas.includes(ref));
    if (atRef.length === 0) {
      const seen = own.flatMap((review) => review.shas);
      const history =
        seen.length === 0 ? 'has no review' : `is reviewed only at ${seen.join(', ')}`;
      return [
        `${name}: pinned at ${ref} but ${history}. Add a '### ${name}' section with '- SHA: \`${ref}\`' to docs/security/third-party-skills.md.`,
      ];
    }
    const expected = [source, skillPath].join('\n');
    if (atRef.some((review) => review.sources.includes(expected))) {
      return [];
    }
    return [
      `${name}: the review at ${ref} must carry '- Source: \`${source}\`, path \`${skillPath}\`' to match the pin.`,
    ];
  });
}

if (import.meta.main) {
  const errors = checkSkillsReview(
    readFileSync('skills-lock.json', 'utf8'),
    readFileSync('docs/security/third-party-skills.md', 'utf8'),
  );
  if (errors.length > 0) {
    process.stderr.write(
      ['skills-review: refused.', ...errors.map((e) => `- ${e}`), ''].join('\n'),
    );
    process.exit(1);
  }
  process.stdout.write('skills-review: ok\n');
}
