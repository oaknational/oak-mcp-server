import { readFileSync } from 'node:fs';

export interface Pin {
  name: string;
  ref: string;
}

const REVIEW_HEADING = /^### (\S+)\s*$/;
const SHA_LINE = /^- SHA: `([0-9a-f]{40})`\s*$/;

export function parsePins(lockText: string): Pin[] {
  const lock = JSON.parse(lockText) as { skills?: Record<string, { ref?: unknown }> };
  return Object.entries(lock.skills ?? {}).map(([name, pin]) => ({
    name,
    ref: typeof pin.ref === 'string' ? pin.ref : '',
  }));
}

export function reviewedShas(reviewText: string): Map<string, Set<string>> {
  const reviewed = new Map<string, Set<string>>();
  let current: string | undefined;
  for (const line of reviewText.split(/\r?\n/)) {
    if (line.startsWith('#')) {
      current = REVIEW_HEADING.exec(line)?.[1];
      continue;
    }
    const sha = SHA_LINE.exec(line)?.[1];
    if (current !== undefined && sha !== undefined) {
      reviewed.set(current, (reviewed.get(current) ?? new Set<string>()).add(sha));
    }
  }
  return reviewed;
}

export function checkSkillsReview(lockText: string, reviewText: string): string[] {
  const reviewed = reviewedShas(reviewText);
  return parsePins(lockText).flatMap(({ name, ref }) => {
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      return [`${name}: the pin's ref must be a full 40-character commit SHA.`];
    }
    if (reviewed.get(name)?.has(ref) === true) {
      return [];
    }
    const seen = [...(reviewed.get(name) ?? [])];
    const history = seen.length === 0 ? 'has no review' : `is reviewed only at ${seen.join(', ')}`;
    return [
      `${name}: pinned at ${ref} but ${history}. Add a '### ${name}' section with '- SHA: \`${ref}\`' to docs/security/third-party-skills.md.`,
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
